import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { toRaw } from "vue";
import type { Chat, Message } from "./types";

/**
 * Chats and messages live in IndexedDB rather than localStorage so long
 * histories and image attachments (stored as Blobs) don't hit the ~5MB quota.
 * Settings and provider configs stay in localStorage — see storage.ts.
 */
interface AiuiDB extends DBSchema {
  chats: {
    key: string;
    value: Chat;
    indexes: { "by-updated": number };
  };
  messages: {
    key: string;
    value: Message;
    indexes: { "by-chat": string; "by-created": number };
  };
}

const DB_NAME = "aiui";
const DB_VERSION = 1;

/**
 * IndexedDB structured-clones everything it stores, and a Vue reactive proxy
 * is not cloneable — put() rejects with DataCloneError and takes the calling
 * turn down with it. Records written here always come from a store, so proxies
 * are stripped at this boundary instead of relying on each call site.
 *
 * toRaw() returns the untouched target, whose nested values are themselves raw.
 * Nested fields are still unwrapped explicitly because a caller that spread a
 * proxy into a fresh object ({ ...message }) hands over reactive children under
 * a plain parent, which toRaw alone would leave in place.
 */
function rawChat(chat: Chat): Chat {
  const base = toRaw(chat);
  return {
    ...base,
    model: base.model ? toRaw(base.model) : null,
    params: toRaw(base.params),
  };
}

function rawMessage(message: Message): Message {
  const base = toRaw(message);
  return {
    ...base,
    model: base.model ? toRaw(base.model) : undefined,
    attachments: toRaw(base.attachments).map((attachment) => toRaw(attachment)),
  };
}

let dbPromise: Promise<IDBPDatabase<AiuiDB>> | null = null;

function getDB(): Promise<IDBPDatabase<AiuiDB>> {
  dbPromise ??= openDB<AiuiDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("chats")) {
        const chats = db.createObjectStore("chats", { keyPath: "id" });
        chats.createIndex("by-updated", "updatedAt");
      }
      if (!db.objectStoreNames.contains("messages")) {
        const messages = db.createObjectStore("messages", { keyPath: "id" });
        messages.createIndex("by-chat", "chatId");
        messages.createIndex("by-created", "createdAt");
      }
    },
  });
  return dbPromise;
}

export async function listChats(): Promise<Chat[]> {
  const db = await getDB();
  const chats = await db.getAllFromIndex("chats", "by-updated");
  return chats.reverse();
}

export async function getChat(id: string): Promise<Chat | undefined> {
  return (await getDB()).get("chats", id);
}

export async function putChat(chat: Chat): Promise<void> {
  await (await getDB()).put("chats", rawChat(chat));
}

export async function deleteChat(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["chats", "messages"], "readwrite");
  const messageKeys = await tx.objectStore("messages").index("by-chat").getAllKeys(id);
  await Promise.all([
    tx.objectStore("chats").delete(id),
    ...messageKeys.map((key) => tx.objectStore("messages").delete(key)),
    tx.done,
  ]);
}

export async function deleteAllChats(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["chats", "messages"], "readwrite");
  await Promise.all([tx.objectStore("chats").clear(), tx.objectStore("messages").clear(), tx.done]);
}

export async function listMessages(chatId: string): Promise<Message[]> {
  const db = await getDB();
  const messages = await db.getAllFromIndex("messages", "by-chat", chatId);
  return messages.sort((a, b) => a.createdAt - b.createdAt);
}

export async function putMessage(message: Message): Promise<void> {
  await (await getDB()).put("messages", rawMessage(message));
}

export async function deleteMessage(id: string): Promise<void> {
  await (await getDB()).delete("messages", id);
}

/** Used by regenerate: drops the target message and everything after it. */
export async function deleteMessagesFrom(chatId: string, createdAt: number): Promise<void> {
  const db = await getDB();
  const messages = await db.getAllFromIndex("messages", "by-chat", chatId);
  const tx = db.transaction("messages", "readwrite");
  await Promise.all([
    ...messages.filter((m) => m.createdAt >= createdAt).map((m) => tx.store.delete(m.id)),
    tx.done,
  ]);
}

export async function getAllMessages(): Promise<Message[]> {
  return (await getDB()).getAll("messages");
}

/**
 * Full-text search across message bodies and chat titles. Runs in memory —
 * IndexedDB has no text index, and histories are small enough that scanning
 * beats maintaining an inverted index.
 */
export async function searchChats(
  query: string,
): Promise<{ chat: Chat; snippet: string | null }[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const db = await getDB();
  const [chats, messages] = await Promise.all([db.getAll("chats"), db.getAll("messages")]);

  const snippets = new Map<string, string>();
  for (const message of messages) {
    if (snippets.has(message.chatId)) continue;
    const index = message.content.toLowerCase().indexOf(needle);
    if (index === -1) continue;
    const start = Math.max(0, index - 40);
    snippets.set(
      message.chatId,
      (start > 0 ? "…" : "") +
        message.content.slice(start, index + needle.length + 60).trim() +
        "…",
    );
  }

  return chats
    .filter((chat) => snippets.has(chat.id) || chat.title.toLowerCase().includes(needle))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((chat) => ({ chat, snippet: snippets.get(chat.id) ?? null }));
}

export async function importData(chats: Chat[], messages: Message[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["chats", "messages"], "readwrite");
  await Promise.all([
    ...chats.map((chat) => tx.objectStore("chats").put(rawChat(chat))),
    ...messages.map((message) => tx.objectStore("messages").put(rawMessage(message))),
    tx.done,
  ]);
}
