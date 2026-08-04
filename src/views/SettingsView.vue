<script setup lang="ts">
import { ArrowLeft, Download, Plus, Upload } from "lucide-vue-next";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import ModelPicker from "@/components/chat/ModelPicker.vue";
import ProviderCard from "@/components/settings/ProviderCard.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Label from "@/components/ui/Label.vue";
import Select from "@/components/ui/Select.vue";
import Switch from "@/components/ui/Switch.vue";
import Textarea from "@/components/ui/Textarea.vue";
import * as db from "@/lib/db";
import { PRESETS } from "@/lib/providers/presets";
import type { AppSettings, ExportBundle, ModelRef } from "@/lib/types";
import { useChatsStore } from "@/stores/chats";
import { useProvidersStore } from "@/stores/providers";
import { useSettingsStore } from "@/stores/settings";

const router = useRouter();
const providersStore = useProvidersStore();
const settingsStore = useSettingsStore();
const chatsStore = useChatsStore();

const presetToAdd = ref<string | undefined>();
const importInput = ref<HTMLInputElement | null>(null);
const includeKeys = ref(false);
const status = ref<string | null>(null);

const presetOptions = computed(() =>
  PRESETS.map((preset) => ({
    value: preset.id,
    label: preset.label,
    hint: preset.protocol === "openai-compatible" ? "compatible" : "native",
  })),
);

const themeOptions = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function addProvider() {
  if (!presetToAdd.value) return;
  providersStore.createFromPreset(presetToAdd.value);
  presetToAdd.value = undefined;
}

/** Numeric defaults use "" for unset, matching the per-chat override fields. */
function numericDefault(key: "temperature" | "topP" | "maxOutputTokens") {
  return computed({
    get: () => {
      const value = settingsStore.settings.defaults[key];
      return value === null ? "" : String(value);
    },
    set: (raw: string) => {
      if (raw.trim() === "") {
        settingsStore.updateDefaults({ [key]: null });
        return;
      }
      const parsed = Number(raw);
      if (!Number.isNaN(parsed)) settingsStore.updateDefaults({ [key]: parsed });
    },
  });
}

const temperature = numericDefault("temperature");
const topP = numericDefault("topP");
const maxOutputTokens = numericDefault("maxOutputTokens");

const contextLimit = computed({
  get: () => String(settingsStore.settings.contextLimit),
  set: (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      settingsStore.settings.contextLimit = Math.floor(parsed);
    }
  },
});

async function exportData() {
  const [chats, messages] = await Promise.all([db.listChats(), db.getAllMessages()]);

  const bundle: ExportBundle = {
    version: 1,
    exportedAt: Date.now(),
    chats,
    // Blobs don't survive JSON; images are dropped and noted in the filename.
    messages: messages.map((message) => ({
      ...message,
      attachments: message.attachments
        .filter((attachment) => attachment.kind === "text")
        .map(({ blob: _blob, ...rest }) => rest),
    })),
    providers: providersStore.providers.map((provider) =>
      includeKeys.value ? provider : { ...provider, apiKey: "" },
    ),
    settings: settingsStore.settings,
  };

  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `aiui-export-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);

  status.value = includeKeys.value
    ? "Exported, including API keys — treat the file as a secret."
    : "Exported without API keys. Images were not included.";
}

async function importData(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  try {
    const bundle = JSON.parse(await file.text()) as Partial<ExportBundle>;
    if (bundle.version !== 1) throw new Error("Unrecognised export format.");

    if (bundle.chats && bundle.messages) {
      await db.importData(bundle.chats, bundle.messages);
      await chatsStore.loadChats();
    }
    if (bundle.providers) {
      // Merge rather than replace, and never blank an existing key with "".
      const existing = providersStore.providers;
      const merged = [...existing];
      for (const incoming of bundle.providers) {
        const index = merged.findIndex((p) => p.id === incoming.id);
        if (index === -1) merged.push(incoming);
        else
          merged[index] = {
            ...incoming,
            apiKey: incoming.apiKey || merged[index].apiKey,
          };
      }
      providersStore.replaceAll(merged);
    }
    if (bundle.settings) settingsStore.replace(bundle.settings as AppSettings);

    status.value = "Import complete.";
  } catch (error) {
    status.value = `Import failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function clearChats() {
  if (!confirm("Delete all chats and messages? This cannot be undone.")) return;
  await chatsStore.deleteAll();
  status.value = "All chats deleted.";
}
</script>

<template>
  <header class="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
    <Button variant="ghost" size="icon-sm" @click="router.back()">
      <ArrowLeft class="size-4" />
    </Button>
    <h1 class="text-sm font-semibold">Settings</h1>
  </header>

  <div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-6">
      <!-- Providers -->
      <section class="flex flex-col gap-3">
        <div>
          <h2 class="text-base font-semibold">Providers</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            Requests go straight from this page to the provider — nothing passes through a server.
          </p>
        </div>

        <div class="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p class="font-medium">API keys are stored in plain text</p>
          <p class="mt-1 text-muted-foreground">
            Keys live in this browser's localStorage. Any script running on this origin — including
            a malicious extension — can read them. Use keys that are scoped, spend-limited, and easy
            to revoke. Avoid this on a shared or public machine.
          </p>
        </div>

        <ProviderCard
          v-for="provider in providersStore.providers"
          :key="provider.id"
          :provider="provider"
        />

        <div class="flex gap-2">
          <Select
            v-model="presetToAdd"
            :options="presetOptions"
            placeholder="Add a provider…"
            class="flex-1"
          />
          <Button :disabled="!presetToAdd" @click="addProvider">
            <Plus class="size-4" />
            Add
          </Button>
        </div>
      </section>

      <!-- Defaults -->
      <section class="flex flex-col gap-3">
        <div>
          <h2 class="text-base font-semibold">Defaults</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            Applied to new chats. Any chat can override these individually.
          </p>
        </div>

        <div class="flex flex-col gap-1.5">
          <Label>Default model</Label>
          <ModelPicker
            :model-value="settingsStore.settings.defaultModel"
            @update:model-value="(value: ModelRef) => settingsStore.setDefaultModel(value)"
          />
        </div>

        <div class="grid gap-3 sm:grid-cols-3">
          <div class="flex flex-col gap-1.5">
            <Label for="default-temperature">Temperature</Label>
            <Input
              id="default-temperature"
              v-model="temperature"
              type="number"
              placeholder="provider default"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="default-top-p">Top P</Label>
            <Input id="default-top-p" v-model="topP" type="number" placeholder="provider default" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="default-max-tokens">Max tokens</Label>
            <Input
              id="default-max-tokens"
              v-model="maxOutputTokens"
              type="number"
              placeholder="provider default"
            />
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <Label for="default-system">System prompt</Label>
          <Textarea
            id="default-system"
            v-model="settingsStore.settings.defaults.systemPrompt"
            :rows="4"
            placeholder="Optional instructions sent with every chat"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <Label for="context-limit">Context window (messages)</Label>
          <Input id="context-limit" v-model="contextLimit" type="number" />
          <p class="text-xs text-muted-foreground">
            How many recent messages to send with each request. 0 sends the whole conversation.
          </p>
        </div>
      </section>

      <!-- Appearance -->
      <section class="flex flex-col gap-3">
        <h2 class="text-base font-semibold">Appearance</h2>

        <div class="flex items-center justify-between gap-4">
          <Label for="theme">Theme</Label>
          <Select
            id="theme"
            :model-value="settingsStore.settings.theme"
            :options="themeOptions"
            class="w-40"
            @update:model-value="(value) => settingsStore.setTheme(value as AppSettings['theme'])"
          />
        </div>

        <div class="flex items-center justify-between gap-4">
          <div>
            <Label for="send-on-enter">Enter sends the message</Label>
            <p class="mt-0.5 text-xs text-muted-foreground">
              When off, Ctrl/Cmd+Enter sends and Enter adds a new line.
            </p>
          </div>
          <Switch id="send-on-enter" v-model="settingsStore.settings.sendOnEnter" />
        </div>
      </section>

      <!-- Data -->
      <section class="flex flex-col gap-3">
        <h2 class="text-base font-semibold">Data</h2>

        <div class="flex items-center justify-between gap-4">
          <div>
            <Label for="include-keys">Include API keys in exports</Label>
            <p class="mt-0.5 text-xs text-muted-foreground">
              Off by default. An export with keys is as sensitive as the keys.
            </p>
          </div>
          <Switch id="include-keys" v-model="includeKeys" />
        </div>

        <div class="flex flex-wrap gap-2">
          <Button variant="outline" @click="exportData">
            <Download class="size-4" />
            Export
          </Button>
          <Button variant="outline" @click="importInput?.click()">
            <Upload class="size-4" />
            Import
          </Button>
          <input
            ref="importInput"
            type="file"
            accept="application/json"
            class="hidden"
            @change="importData"
          />
          <Button variant="destructive" class="ml-auto" @click="clearChats">
            Delete all chats
          </Button>
        </div>

        <p v-if="status" class="text-xs text-muted-foreground">{{ status }}</p>
      </section>
    </div>
  </div>
</template>
