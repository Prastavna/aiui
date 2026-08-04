import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { buildModelMessages, deriveTitle, streamAssistant } from "@/lib/chat-engine";
import * as db from "@/lib/db";
import { explainNetworkError } from "@/lib/providers/resolve";
import type { Attachment, Chat, GenerationParams, Message, ModelRef } from "@/lib/types";
import { uid } from "@/lib/utils";
import { useProvidersStore } from "./providers";
import { useSettingsStore } from "./settings";

export const useChatsStore = defineStore("chats", () => {
  const providersStore = useProvidersStore();
  const settingsStore = useSettingsStore();

  const chats = ref<Chat[]>([]);
  const activeId = ref<string | null>(null);
  const messages = ref<Message[]>([]);
  const loading = ref(false);
  const streaming = ref(false);
  /** Id of the assistant message currently being written into. */
  const streamingMessageId = ref<string | null>(null);

  let abortController: AbortController | null = null;

  const activeChat = computed(() => chats.value.find((chat) => chat.id === activeId.value) ?? null);

  /** Per-chat overrides layered onto the global defaults. */
  const effectiveParams = computed<GenerationParams>(() => {
    const defaults = settingsStore.settings.defaults;
    const overrides = activeChat.value?.params ?? {};
    return {
      temperature: overrides.temperature ?? defaults.temperature,
      maxOutputTokens: overrides.maxOutputTokens ?? defaults.maxOutputTokens,
      topP: overrides.topP ?? defaults.topP,
      systemPrompt: overrides.systemPrompt ?? defaults.systemPrompt,
    };
  });

  async function loadChats() {
    chats.value = await db.listChats();
  }

  async function openChat(id: string) {
    if (activeId.value === id && messages.value.length) return;
    loading.value = true;
    activeId.value = id;
    try {
      messages.value = await db.listMessages(id);
    } finally {
      loading.value = false;
    }
  }

  async function createChat(model?: ModelRef | null): Promise<Chat> {
    const now = Date.now();
    const chat: Chat = {
      id: uid(),
      title: "New chat",
      createdAt: now,
      updatedAt: now,
      model: model ?? settingsStore.settings.defaultModel,
      params: {},
    };
    await db.putChat(chat);
    chats.value = [chat, ...chats.value];
    activeId.value = chat.id;
    messages.value = [];
    return chat;
  }

  async function persistChat(chat: Chat) {
    await db.putChat(chat);
    const index = chats.value.findIndex((c) => c.id === chat.id);
    if (index !== -1) chats.value[index] = chat;
  }

  async function renameChat(id: string, title: string) {
    const chat = chats.value.find((c) => c.id === id);
    if (!chat) return;
    await persistChat({ ...chat, title: title.trim() || "Untitled" });
  }

  async function setChatModel(id: string, model: ModelRef) {
    const chat = chats.value.find((c) => c.id === id);
    if (!chat) return;
    await persistChat({ ...chat, model });
  }

  async function setChatParams(id: string, params: Partial<GenerationParams>) {
    const chat = chats.value.find((c) => c.id === id);
    if (!chat) return;
    await persistChat({ ...chat, params });
  }

  async function deleteChat(id: string) {
    await db.deleteChat(id);
    chats.value = chats.value.filter((chat) => chat.id !== id);
    if (activeId.value === id) {
      activeId.value = null;
      messages.value = [];
    }
  }

  async function deleteAll() {
    stop();
    await db.deleteAllChats();
    chats.value = [];
    messages.value = [];
    activeId.value = null;
  }

  function stop() {
    abortController?.abort();
    abortController = null;
    streaming.value = false;
    streamingMessageId.value = null;
  }

  /**
   * Runs one assistant turn against the chat's current message list.
   * Shared by send() and regenerate() so both behave identically.
   */
  async function runTurn(input: Chat) {
    // A chat created before any model existed keeps model: null, while the
    // header picker displays the global default in its place. Honour the same
    // fallback here, so the model the user can see selected is the one that
    // runs, and pin it to the chat so later turns don't depend on the default.
    const modelRef = input.model ?? settingsStore.settings.defaultModel;
    const chat = modelRef && !input.model ? { ...input, model: modelRef } : input;
    if (chat !== input) await persistChat(chat);

    const assistant: Message = {
      id: uid(),
      chatId: chat.id,
      role: "assistant",
      content: "",
      reasoning: "",
      attachments: [],
      createdAt: Date.now(),
      model: modelRef ?? undefined,
    };
    messages.value = [...messages.value, assistant];
    streamingMessageId.value = assistant.id;
    streaming.value = true;

    abortController = new AbortController();
    const live = messages.value[messages.value.length - 1];

    try {
      // Raised in here rather than before the message exists: a rejection out
      // of runTurn escapes send(), whose callers don't catch, so the turn used
      // to fail with nothing on screen and no request in the network log.
      if (!modelRef) {
        throw new Error("Pick a model before sending a message.");
      }

      const model = providersStore.resolve(modelRef);
      const modelMessages = await buildModelMessages(
        messages.value.slice(0, -1),
        effectiveParams.value.systemPrompt,
        settingsStore.settings.contextLimit,
      );

      const { text, reasoning } = await streamAssistant({
        model,
        messages: modelMessages,
        params: effectiveParams.value,
        signal: abortController.signal,
        handlers: {
          onText: (delta) => {
            live.content += delta;
          },
          onReasoning: (delta) => {
            live.reasoning = (live.reasoning ?? "") + delta;
          },
        },
      });

      live.content = text;
      live.reasoning = reasoning || undefined;
      await db.putMessage({ ...live });
    } catch (error) {
      const aborted =
        error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message));

      if (aborted) {
        // Keep whatever streamed in before the user hit stop.
        if (live.content.trim()) {
          await db.putMessage({ ...live });
        } else {
          messages.value = messages.value.filter((m) => m.id !== live.id);
        }
      } else {
        const provider = modelRef ? providersStore.byId(modelRef.providerId) : undefined;
        live.error = explainNetworkError(error, provider?.baseUrl ?? "");
        await db.putMessage({ ...live });
      }
    } finally {
      streaming.value = false;
      streamingMessageId.value = null;
      abortController = null;
      await persistChat({ ...chat, updatedAt: Date.now() });
      chats.value = [...chats.value].sort((a, b) => b.updatedAt - a.updatedAt);
    }
  }

  async function send(text: string, attachments: Attachment[] = []) {
    const trimmed = text.trim();
    if ((!trimmed && !attachments.length) || streaming.value) return;

    let chat = activeChat.value;
    chat ??= await createChat();

    const user: Message = {
      id: uid(),
      chatId: chat.id,
      role: "user",
      content: trimmed,
      attachments,
      createdAt: Date.now(),
    };
    messages.value = [...messages.value, user];
    await db.putMessage(user);

    // Name the chat from its opening message rather than leaving "New chat".
    if (chat.title === "New chat" && trimmed) {
      chat = { ...chat, title: deriveTitle(trimmed) };
      await persistChat(chat);
    }

    await runTurn(chat);
  }

  /** Drops the target assistant message and everything after it, then re-runs. */
  async function regenerate(messageId: string) {
    const chat = activeChat.value;
    if (!chat || streaming.value) return;

    const index = messages.value.findIndex((m) => m.id === messageId);
    if (index === -1) return;

    const cutoff = messages.value[index].createdAt;
    await db.deleteMessagesFrom(chat.id, cutoff);
    messages.value = messages.value.slice(0, index);

    await runTurn(chat);
  }

  async function deleteMessage(messageId: string) {
    await db.deleteMessage(messageId);
    messages.value = messages.value.filter((m) => m.id !== messageId);
  }

  /** Rewrites a user message and re-runs everything downstream of it. */
  async function editAndResend(messageId: string, content: string) {
    const chat = activeChat.value;
    if (!chat || streaming.value) return;

    const index = messages.value.findIndex((m) => m.id === messageId);
    if (index === -1) return;

    const target = { ...messages.value[index], content: content.trim() };
    const following = messages.value[index + 1];
    if (following) {
      await db.deleteMessagesFrom(chat.id, following.createdAt);
    }

    messages.value = [...messages.value.slice(0, index), target];
    await db.putMessage(target);
    await runTurn(chat);
  }

  return {
    chats,
    activeId,
    activeChat,
    messages,
    loading,
    streaming,
    streamingMessageId,
    effectiveParams,
    loadChats,
    openChat,
    createChat,
    renameChat,
    setChatModel,
    setChatParams,
    deleteChat,
    deleteAll,
    send,
    stop,
    regenerate,
    deleteMessage,
    editAndResend,
  };
});
