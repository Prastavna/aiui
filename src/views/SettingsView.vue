<script setup lang="ts">
import { ArrowLeft, ChevronDown, Download, Lock, Plus, Upload } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import ModelPicker from "@/components/chat/ModelPicker.vue";
import AddProviderDialog from "@/components/settings/AddProviderDialog.vue";
import ProviderCard from "@/components/settings/ProviderCard.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Label from "@/components/ui/Label.vue";
import Select from "@/components/ui/Select.vue";
import Switch from "@/components/ui/Switch.vue";
import Textarea from "@/components/ui/Textarea.vue";
import * as db from "@/lib/db";
import type { AppSettings, ExportBundle, ModelRef } from "@/lib/types";
import { useChatsStore } from "@/stores/chats";
import { useProvidersStore } from "@/stores/providers";
import { useSettingsStore } from "@/stores/settings";

// Declared so the app shell's shared RouterView listener is absorbed here too;
// settings has no drawer of its own.
defineEmits<{ "toggle-sidebar": [] }>();

const router = useRouter();
const providersStore = useProvidersStore();
const settingsStore = useSettingsStore();
const chatsStore = useChatsStore();

const addOpen = ref(false);
const importInput = ref<HTMLInputElement | null>(null);
const includeKeys = ref(false);
/** Separate messages: provider changes happen far from the Data actions. */
const providerStatus = ref<string | null>(null);
const dataStatus = ref<string | null>(null);

const sections = [
  { id: "providers", label: "Providers" },
  { id: "defaults", label: "Defaults" },
  { id: "appearance", label: "Appearance" },
  { id: "data", label: "Data" },
];

const providerCount = computed(() => providersStore.providers.length);
const modelCount = computed(() =>
  providersStore.providers.reduce((total, provider) => total + provider.cachedModels.length, 0),
);

const themeOptions = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function onProviderAdded(label: string) {
  providerStatus.value = `${label} added. Expand it to enter your API key.`;
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

const activeSection = ref("providers");
let observer: IntersectionObserver | null = null;

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) activeSection.value = entry.target.id;
      }
    },
    { rootMargin: "-15% 0px -70% 0px" },
  );
  for (const section of sections) {
    const element = document.getElementById(section.id);
    if (element) observer.observe(element);
  }
});

onUnmounted(() => observer?.disconnect());

function goTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

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

  dataStatus.value = includeKeys.value
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

    dataStatus.value = "Import complete.";
  } catch (error) {
    dataStatus.value = `Import failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function clearChats() {
  if (!confirm("Delete all chats and messages? This cannot be undone.")) return;
  await chatsStore.deleteAll();
  dataStatus.value = "All chats deleted.";
}

function openAddProvider() {
  addOpen.value = true;
}

const sectionLinkClass = (id: string) =>
  id === activeSection.value
    ? "bg-accent font-medium text-foreground"
    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground";
</script>

<template>
  <header
    class="flex min-h-14 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-2.5 pt-safe backdrop-blur sm:px-4"
  >
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Back to chat"
      title="Back to chat"
      @click="router.push('/')"
    >
      <ArrowLeft class="size-4" />
    </Button>
    <div class="min-w-0">
      <h1 class="truncate text-sm font-semibold tracking-tight">Settings</h1>
    </div>
    <p class="ml-auto hidden text-xs text-muted-foreground sm:block">Saved automatically</p>
  </header>

  <div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto max-w-5xl px-4 pt-3 pb-10 sm:px-6 lg:flex lg:gap-10 lg:pt-6">
      <!-- Section nav: scrollable pills on mobile, sticky rail on desktop. -->
      <nav
        aria-label="Settings sections"
        class="sticky top-0 z-10 -mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-4 py-2 backdrop-blur no-scrollbar lg:hidden"
      >
        <button
          v-for="section in sections"
          :key="section.id"
          type="button"
          class="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          :class="sectionLinkClass(section.id)"
          @click="goTo(section.id)"
        >
          {{ section.label }}
        </button>
      </nav>

      <nav
        aria-label="Settings sections"
        class="sticky top-6 hidden h-fit w-40 shrink-0 flex-col gap-1 lg:flex"
      >
        <button
          v-for="section in sections"
          :key="section.id"
          type="button"
          class="rounded-lg px-3 py-2 text-left text-sm transition-colors"
          :class="sectionLinkClass(section.id)"
          @click="goTo(section.id)"
        >
          {{ section.label }}
        </button>
      </nav>

      <div class="flex min-w-0 max-w-2xl flex-1 flex-col gap-10">
        <!-- Providers -->
        <section id="providers" class="scroll-mt-16">
          <div>
            <h2 class="text-base font-semibold tracking-tight">Providers</h2>
            <p class="mt-1 text-sm leading-6 text-muted-foreground">
              Requests go straight from this page to the provider — nothing passes through a server.
            </p>
          </div>

          <details
            class="group mt-4 rounded-xl border border-border bg-muted/30 px-3.5 py-3 text-sm [&_summary::-webkit-details-marker]:hidden"
          >
            <summary
              class="flex cursor-pointer list-none items-center gap-2 font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20"
            >
              <Lock class="size-4 shrink-0 text-muted-foreground" />
              How your keys are stored
              <ChevronDown
                class="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              />
            </summary>
            <p class="mt-2 text-xs leading-5 text-muted-foreground">
              Keys live in this browser's localStorage in plain text. Any script running on this
              origin — including a malicious extension — can read them. Use keys that are scoped,
              spend-limited, and easy to revoke. Avoid this on a shared or public machine.
            </p>
          </details>

          <div class="mt-4 flex flex-col gap-3">
            <div
              class="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p class="text-sm font-medium">
                  {{ providerCount }} {{ providerCount === 1 ? "provider" : "providers" }}
                  <span class="text-muted-foreground">·</span>
                  {{ modelCount }} {{ modelCount === 1 ? "model" : "models" }}
                </p>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  {{
                    providerCount
                      ? "Keys are sent only to the provider you choose."
                      : "Add at least one provider to start a conversation."
                  }}
                </p>
              </div>
              <Button class="sm:shrink-0" @click="openAddProvider">
                <Plus class="size-4" />
                Add provider
              </Button>
            </div>

            <div
              v-if="!providersStore.providers.length"
              class="rounded-xl border border-dashed border-input px-4 py-8 text-center"
            >
              <p class="text-sm font-medium">No providers yet</p>
              <p class="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                Use a preset like OpenAI, Anthropic or OpenRouter, or point a custom
                OpenAI-compatible entry at any endpoint.
              </p>
            </div>

            <ProviderCard
              v-for="provider in providersStore.providers"
              :key="provider.id"
              :provider="provider"
            />

            <p
              v-if="providerStatus"
              role="status"
              aria-live="polite"
              class="text-xs leading-5 text-muted-foreground"
            >
              {{ providerStatus }}
            </p>
          </div>
        </section>

        <!-- Defaults -->
        <section id="defaults" class="scroll-mt-16">
          <div>
            <h2 class="text-base font-semibold tracking-tight">Defaults</h2>
            <p class="mt-1 text-sm leading-6 text-muted-foreground">
              Applied to new chats. Any chat can override these individually.
            </p>
          </div>

          <div
            class="mt-4 flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs"
          >
            <div class="flex flex-col gap-1.5">
              <Label>Default model</Label>
              <ModelPicker
                :model-value="settingsStore.settings.defaultModel"
                aria-label="Default model"
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
                <Input
                  id="default-top-p"
                  v-model="topP"
                  type="number"
                  placeholder="provider default"
                />
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
              <p class="text-xs leading-5 text-muted-foreground">
                How many recent messages to send with each request. 0 sends the whole conversation.
              </p>
            </div>
          </div>
        </section>

        <!-- Appearance -->
        <section id="appearance" class="scroll-mt-16">
          <h2 class="text-base font-semibold tracking-tight">Appearance</h2>

          <div
            class="mt-4 flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs"
          >
            <div class="flex items-center justify-between gap-4">
              <Label for="theme">Theme</Label>
              <Select
                id="theme"
                :model-value="settingsStore.settings.theme"
                :options="themeOptions"
                aria-label="Theme"
                class="w-40"
                @update:model-value="
                  (value) => settingsStore.setTheme(value as AppSettings['theme'])
                "
              />
            </div>

            <div class="flex items-center justify-between gap-4 border-t border-border pt-4">
              <div>
                <Label for="send-on-enter">Enter sends the message</Label>
                <p class="mt-1 text-xs leading-5 text-muted-foreground">
                  When off, Ctrl/Cmd+Enter sends and Enter adds a new line.
                </p>
              </div>
              <Switch id="send-on-enter" v-model="settingsStore.settings.sendOnEnter" />
            </div>
          </div>
        </section>

        <!-- Data -->
        <section id="data" class="scroll-mt-16">
          <div>
            <h2 class="text-base font-semibold tracking-tight">Data</h2>
            <p class="mt-1 text-sm leading-6 text-muted-foreground">
              Everything lives in this browser. Export before clearing site data.
            </p>
          </div>

          <div
            class="mt-4 flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs"
          >
            <div class="flex items-center justify-between gap-4">
              <div>
                <Label for="include-keys">Include API keys in exports</Label>
                <p class="mt-1 text-xs leading-5 text-muted-foreground">
                  Off by default. An export with keys is as sensitive as the keys.
                </p>
              </div>
              <Switch id="include-keys" v-model="includeKeys" />
            </div>

            <div class="flex flex-wrap gap-2 border-t border-border pt-4">
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
              <Button variant="outline" class="text-destructive sm:ml-auto" @click="clearChats">
                Delete all chats
              </Button>
            </div>

            <p
              v-if="dataStatus"
              role="status"
              aria-live="polite"
              class="text-xs leading-5 text-muted-foreground"
            >
              {{ dataStatus }}
            </p>
          </div>
        </section>
      </div>
    </div>
  </div>

  <AddProviderDialog v-model:open="addOpen" @added="onProviderAdded" />
</template>
