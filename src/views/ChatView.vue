<script setup lang="ts">
import {
  ArrowDown,
  Code2,
  FileText,
  Lightbulb,
  Mail,
  Menu,
  PanelRightOpen,
  SquarePen,
} from "lucide-vue-next";
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import BrandMark from "@/components/BrandMark.vue";
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
const composer = ref<{ fill: (text: string) => void } | null>(null);
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

const modelLabel = computed(() => providersStore.labelFor(currentModel.value));

/** The setup checklist starts where the user actually is. */
const setupSteps = computed(() =>
  providersStore.providers.length
    ? ["Enter your API key", "Enable the provider", "Fetch models"]
    : ["Add a provider", "Paste your key", "Fetch models"],
);

/** Starter prompts write directly into the composer, leaving the caret ready. */
const suggestions = [
  {
    icon: Lightbulb,
    title: "Explain a concept",
    hint: "Break down something complex",
    prompt: "Explain how ... works, with a simple analogy.",
  },
  {
    icon: Code2,
    title: "Debug an error",
    hint: "Trace a bug to its cause",
    prompt: "Help me debug this error:\n\n",
  },
  {
    icon: FileText,
    title: "Summarize a document",
    hint: "Pull out the key takeaways",
    prompt: "Summarize the following and list the key takeaways:\n\n",
  },
  {
    icon: Mail,
    title: "Draft a message",
    hint: "Write it in your voice",
    prompt: "Draft a professional message that ",
  },
];

function useSuggestion(prompt: string) {
  composer.value?.fill(prompt);
}

watch(
  () => route.params.id,
  async (id) => {
    paramsOpen.value = false;
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
  pinnedToBottom.value = true;
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

async function newChat() {
  const chat = await chatsStore.createChat();
  await router.push(`/chat/${chat.id}`);
}
</script>

<template>
  <header
    class="flex min-h-14 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-2.5 pt-safe backdrop-blur sm:px-4"
  >
    <Button
      data-sidebar-toggle
      variant="ghost"
      size="icon-sm"
      class="md:hidden"
      aria-label="Open chat history"
      @click="$emit('toggle-sidebar')"
    >
      <Menu class="size-4" />
    </Button>

    <ModelPicker
      :model-value="currentModel"
      class="min-w-0 max-w-[15rem] flex-1 sm:max-w-72 sm:flex-none"
      @update:model-value="onModelChange"
    />

    <div class="ml-auto flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        title="New chat"
        aria-label="New chat"
        @click="newChat"
      >
        <SquarePen class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Chat settings"
        aria-label="Chat settings"
        :disabled="!chatsStore.activeChat"
        @click="paramsOpen = true"
      >
        <PanelRightOpen class="size-4" />
      </Button>
    </div>
  </header>

  <div class="relative min-h-0 flex-1">
    <div ref="scroller" class="scrollbar-thin h-full overflow-y-auto" @scroll="onScroll">
      <div class="mx-auto flex min-h-full max-w-3xl flex-col px-4 sm:px-6">
        <!-- Empty states: no providers configured vs. an empty chat. -->
        <div
          v-if="!chatsStore.messages.length"
          class="relative flex flex-1 flex-col items-center justify-center overflow-hidden py-10 text-center"
        >
          <div class="hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />

          <div class="relative flex w-full flex-col items-center">
            <template v-if="!hasProviders">
              <BrandMark class="size-12 rounded-2xl" />

              <h1 class="mt-5 text-xl font-semibold tracking-tight sm:text-2xl">
                {{
                  providersStore.providers.length
                    ? "Finish setting up your model"
                    : "Set up your first model"
                }}
              </h1>
              <p class="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                {{ noModelsReason }}
                {{
                  providersStore.providers.length
                    ? "Add a key or enable a provider in settings."
                    : "Add a provider, paste a key, and fetch its models."
                }}
              </p>

              <ol class="mt-6 grid w-full max-w-md gap-2 text-left sm:grid-cols-3">
                <li
                  v-for="(step, index) in setupSteps"
                  :key="step"
                  class="rounded-xl border border-border bg-card/70 p-3 backdrop-blur-sm"
                >
                  <span class="font-mono text-[10px] text-muted-foreground">
                    0{{ index + 1 }}
                  </span>
                  <p class="mt-1 text-xs font-medium">{{ step }}</p>
                </li>
              </ol>

              <Button class="mt-6" @click="router.push('/settings')"> Open settings </Button>
              <p class="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                Keys stay in this browser and are sent directly to the provider.
              </p>
            </template>

            <template v-else>
              <BrandMark class="size-12 rounded-2xl" />

              <h1 class="mt-5 text-xl font-semibold tracking-tight sm:text-2xl">
                What's on your mind?
              </h1>
              <p class="mt-2 max-w-sm text-sm text-muted-foreground">
                Chatting with <span class="font-medium text-foreground">{{ modelLabel }}</span>
              </p>

              <div class="mt-8 grid w-full max-w-2xl gap-2 text-left sm:grid-cols-2">
                <button
                  v-for="suggestion in suggestions"
                  :key="suggestion.title"
                  type="button"
                  class="group flex min-h-[76px] items-start gap-3 rounded-xl border border-border bg-card p-3.5 text-left shadow-xs transition-[border-color,background-color,box-shadow] duration-150 outline-none hover:border-foreground/25 hover:shadow-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                  @click="useSuggestion(suggestion.prompt)"
                >
                  <span
                    class="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/50 text-muted-foreground transition-colors group-hover:border-foreground/20 group-hover:text-foreground"
                  >
                    <component :is="suggestion.icon" class="size-4" />
                  </span>
                  <span class="min-w-0">
                    <span class="block text-sm font-medium">{{ suggestion.title }}</span>
                    <span class="mt-0.5 block text-xs leading-5 text-muted-foreground">
                      {{ suggestion.hint }}
                    </span>
                  </span>
                </button>
              </div>

              <p class="mt-4 text-xs text-muted-foreground">Pick a starter or type below.</p>
            </template>
          </div>
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

        <div class="h-6" />
      </div>
    </div>

    <Transition
      enter-active-class="transition duration-150 ease-out"
      leave-active-class="transition duration-100 ease-in"
      enter-from-class="translate-y-1 opacity-0"
      leave-to-class="translate-y-1 opacity-0"
    >
      <button
        v-if="!pinnedToBottom"
        type="button"
        class="absolute right-4 bottom-4 z-10 flex size-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25 sm:right-6"
        aria-label="Jump to latest message"
        @click="scrollToBottom()"
      >
        <ArrowDown class="size-4" />
      </button>
    </Transition>
  </div>

  <Composer
    ref="composer"
    :streaming="chatsStore.streaming"
    :disabled="!hasProviders"
    :disabled-reason="noModelsReason"
    @send="onSend"
    @stop="chatsStore.stop()"
  />

  <p class="sr-only" aria-live="polite">
    {{ chatsStore.streaming ? "Assistant is replying" : "" }}
  </p>

  <ParamsPanel v-model:open="paramsOpen" />
</template>
