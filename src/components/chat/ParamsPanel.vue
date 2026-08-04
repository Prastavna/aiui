<script setup lang="ts">
import { computed } from "vue";
import Dialog from "@/components/ui/Dialog.vue";
import Input from "@/components/ui/Input.vue";
import Label from "@/components/ui/Label.vue";
import Textarea from "@/components/ui/Textarea.vue";
import type { GenerationParams } from "@/lib/types";
import { useChatsStore } from "@/stores/chats";
import { useSettingsStore } from "@/stores/settings";

const open = defineModel<boolean>("open", { default: false });

const chatsStore = useChatsStore();
const settingsStore = useSettingsStore();

const defaults = computed(() => settingsStore.settings.defaults);

/**
 * Overrides are stored sparsely: an empty field means "inherit the default",
 * so the placeholder shows what will actually be used.
 */
function override(key: keyof GenerationParams) {
  return computed({
    get: () => {
      const value = chatsStore.activeChat?.params[key];
      return value === undefined || value === null ? "" : String(value);
    },
    set: (raw: string) => {
      const chat = chatsStore.activeChat;
      if (!chat) return;

      const next = { ...chat.params };
      if (raw.trim() === "") {
        delete next[key];
      } else if (key === "systemPrompt") {
        next.systemPrompt = raw;
      } else {
        const parsed = Number(raw);
        if (Number.isNaN(parsed)) return;
        next[key] = parsed as never;
      }
      void chatsStore.setChatParams(chat.id, next);
    },
  });
}

const temperature = override("temperature");
const topP = override("topP");
const maxOutputTokens = override("maxOutputTokens");
const systemPrompt = override("systemPrompt");

const placeholder = (value: number | null, fallback: string) =>
  value === null ? fallback : String(value);
</script>

<template>
  <Dialog
    v-model:open="open"
    title="Chat settings"
    description="Overrides for this chat only. Leave a field empty to inherit the global default."
  >
    <div class="scrollbar-thin flex flex-col gap-4 overflow-y-auto">
      <div class="grid grid-cols-3 gap-3">
        <div class="flex flex-col gap-1.5">
          <Label for="param-temperature">Temperature</Label>
          <Input
            id="param-temperature"
            v-model="temperature"
            type="number"
            :placeholder="placeholder(defaults.temperature, 'provider default')"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="param-top-p">Top P</Label>
          <Input
            id="param-top-p"
            v-model="topP"
            type="number"
            :placeholder="placeholder(defaults.topP, 'provider default')"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="param-max-tokens">Max tokens</Label>
          <Input
            id="param-max-tokens"
            v-model="maxOutputTokens"
            type="number"
            :placeholder="placeholder(defaults.maxOutputTokens, 'provider default')"
          />
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <Label for="param-system">System prompt</Label>
        <Textarea
          id="param-system"
          v-model="systemPrompt"
          :rows="5"
          :placeholder="defaults.systemPrompt || 'No system prompt'"
        />
      </div>
    </div>
  </Dialog>
</template>
