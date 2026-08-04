<script setup lang="ts">
import { Menu, Moon, PanelRightOpen, Sun } from "lucide-vue-next";
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Composer from "@/components/chat/Composer.vue";
import MessageItem from "@/components/chat/MessageItem.vue";
import ModelPicker from "@/components/chat/ModelPicker.vue";
import ParamsPanel from "@/components/chat/ParamsPanel.vue";
import Button from "@/components/ui/Button.vue";
import { describeNoModels } from "@/lib/providers/availability";
import type { Attachment, ModelRef } from "@/lib/types";
import { useChatsStore } from "@/stores/chats";
import { useProvidersStore } from "@/stores/providers";
import { useSettingsStore } from "@/stores/settings";

defineEmits<{ "toggle-sidebar": [] }>();

const route = useRoute();
const router = useRouter();
const chatsStore = useChatsStore();
const providersStore = useProvidersStore();
const settingsStore = useSettingsStore();

const scroller = ref<HTMLElement | null>(null);
const paramsOpen = ref(false);
/** Cleared whenever the user scrolls away, so streaming doesn't yank them back. */
const pinnedToBottom = ref(true);

const hasProviders = computed(() => providersStore.availableModels.length > 0);

/** Names what's missing whenever the composer is blocked. */
const noModelsReason = computed(() =>
  hasProviders.value ? null : describeNoModels(providersStore.providers),
);

const currentModel = computed<ModelRef | null>(
  () => chatsStore.activeChat?.model ?? settingsStore.settings.defaultModel ?? null,
);

watch(
  () => route.params.id,
  async (id) => {
    if (typeof id === "string") await chatsStore.openChat(id);
    else {
      chatsStore.activeId = null;
      chatsStore.messages = [];
    }
    await nextTick();
    scrollToBottom("auto");
  },
  { immediate: true },
);

// Follow the stream only while the user is still parked at the bottom.
watch(
  () => chatsStore.messages.map((message) => message.content).join(""),
  async () => {
    if (!pinnedToBottom.value) return;
    await nextTick();
    scrollToBottom("auto");
  },
);

function scrollToBottom(behavior: ScrollBehavior = "smooth") {
  const element = scroller.value;
  if (element) element.scrollTo({ top: element.scrollHeight, behavior });
}

function onScroll() {
  const element = scroller.value;
  if (!element) return;
  const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
  pinnedToBottom.value = distance < 80;
}

async function onSend(text: string, attachments: Attachment[]) {
  const isNew = !chatsStore.activeChat;
  pinnedToBottom.value = true;
  await chatsStore.send(text, attachments);
  // Land on the chat's own URL so reloads and back/forward work.
  if (isNew && chatsStore.activeId) {
    await router.replace(`/chat/${chatsStore.activeId}`);
  }
}

async function onModelChange(model: ModelRef) {
  if (chatsStore.activeChat) {
    await chatsStore.setChatModel(chatsStore.activeChat.id, model);
  } else {
    settingsStore.setDefaultModel(model);
  }
}
</script>

<template>
  <header class="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
    <Button
      variant="ghost"
      size="icon-sm"
      class="md:hidden"
      aria-label="Toggle sidebar"
      @click="$emit('toggle-sidebar')"
    >
      <Menu class="size-4" />
    </Button>

    <ModelPicker
      :model-value="currentModel"
      class="max-w-72 min-w-0"
      @update:model-value="onModelChange"
    />

    <div class="ml-auto flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        :title="settingsStore.isDark ? 'Switch to light' : 'Switch to dark'"
        @click="settingsStore.toggleTheme()"
      >
        <Sun v-if="settingsStore.isDark" class="size-4" />
        <Moon v-else class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Chat settings"
        :disabled="!chatsStore.activeChat"
        @click="paramsOpen = true"
      >
        <PanelRightOpen class="size-4" />
      </Button>
    </div>
  </header>

  <div ref="scroller" class="scrollbar-thin min-h-0 flex-1 overflow-y-auto" @scroll="onScroll">
    <div class="mx-auto max-w-3xl px-4">
      <!-- Empty states: no providers configured vs. an empty chat. -->
      <div
        v-if="!chatsStore.messages.length"
        class="flex min-h-[60vh] flex-col items-center justify-center text-center"
      >
        <template v-if="!hasProviders">
          <h1 class="text-lg font-semibold">No model available</h1>
          <p class="mt-1 max-w-sm text-sm text-muted-foreground">
            {{ noModelsReason }}
          </p>
          <p
            v-if="!providersStore.providers.length"
            class="mt-1 max-w-sm text-sm text-muted-foreground"
          >
            Keys are stored only in this browser and sent directly to the provider.
          </p>
          <Button class="mt-4" @click="router.push('/settings')"> Open settings </Button>
        </template>
        <template v-else>
          <h1 class="text-lg font-semibold">What's on your mind?</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            Using {{ providersStore.labelFor(currentModel) }}
          </p>
        </template>
      </div>

      <MessageItem
        v-for="message in chatsStore.messages"
        :key="message.id"
        :message="message"
        :streaming="chatsStore.streamingMessageId === message.id"
        @regenerate="chatsStore.regenerate"
        @delete="chatsStore.deleteMessage"
        @edit="chatsStore.editAndResend"
      />

      <div class="h-4" />
    </div>
  </div>

  <Composer
    :streaming="chatsStore.streaming"
    :disabled="!hasProviders"
    :disabled-reason="noModelsReason"
    @send="onSend"
    @stop="chatsStore.stop()"
  />

  <ParamsPanel v-model:open="paramsOpen" />
</template>
