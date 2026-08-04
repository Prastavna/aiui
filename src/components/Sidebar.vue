<script setup lang="ts">
import { MessageSquarePlus, MoreHorizontal, Search, Settings, Trash2, X } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "@/components/ui/Button.vue";
import { searchChats } from "@/lib/db";
import type { Chat } from "@/lib/types";
import { cn, relativeBucket } from "@/lib/utils";
import { useChatsStore } from "@/stores/chats";

const emit = defineEmits<{ navigate: [] }>();
defineProps<{ class?: string }>();

const chatsStore = useChatsStore();
const router = useRouter();
const route = useRoute();

const query = ref("");
const searchResults = ref<{ chat: Chat; snippet: string | null }[]>([]);
const renamingId = ref<string | null>(null);
const renameDraft = ref("");
const menuOpenId = ref<string | null>(null);

let searchToken = 0;

watch(query, async (value) => {
  const token = ++searchToken;
  if (!value.trim()) {
    searchResults.value = [];
    return;
  }
  const results = await searchChats(value);
  // Ignore responses that lost the race to a newer keystroke.
  if (token === searchToken) searchResults.value = results;
});

/** Search mode returns a flat list; otherwise chats are grouped by recency. */
const groups = computed(() => {
  const list = query.value.trim()
    ? searchResults.value.map((result) => result.chat)
    : chatsStore.chats;

  const buckets: { label: string; chats: Chat[] }[] = [];
  for (const chat of list) {
    const label = relativeBucket(chat.updatedAt);
    const existing = buckets.find((bucket) => bucket.label === label);
    if (existing) existing.chats.push(chat);
    else buckets.push({ label, chats: [chat] });
  }
  return buckets;
});

const snippetFor = (id: string) =>
  searchResults.value.find((result) => result.chat.id === id)?.snippet ?? null;

async function newChat() {
  const chat = await chatsStore.createChat();
  await router.push(`/chat/${chat.id}`);
  emit("navigate");
}

async function open(id: string) {
  await router.push(`/chat/${id}`);
  emit("navigate");
}

function startRename(chat: Chat) {
  renamingId.value = chat.id;
  renameDraft.value = chat.title;
  menuOpenId.value = null;
}

async function commitRename() {
  if (!renamingId.value) return;
  await chatsStore.renameChat(renamingId.value, renameDraft.value);
  renamingId.value = null;
}

async function remove(id: string) {
  menuOpenId.value = null;
  await chatsStore.deleteChat(id);
  if (route.params.id === id) await router.push("/");
}
</script>

<template>
  <aside :class="cn('flex h-full flex-col border-r border-border bg-card', $props.class)">
    <div class="flex items-center gap-2 p-3">
      <Button class="flex-1 justify-start gap-2" size="sm" @click="newChat">
        <MessageSquarePlus />
        New chat
      </Button>
      <Button variant="ghost" size="icon-sm" title="Settings" @click="router.push('/settings')">
        <Settings />
      </Button>
    </div>

    <div class="px-3 pb-2">
      <div class="relative">
        <Search
          class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          v-model="query"
          type="search"
          placeholder="Search chats"
          class="h-8 w-full rounded-md border border-input bg-transparent pr-8 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <button
          v-if="query"
          type="button"
          class="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
          @click="query = ''"
        >
          <X class="size-3.5" />
        </button>
      </div>
    </div>

    <nav class="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      <p v-if="!groups.length" class="px-2 py-6 text-center text-sm text-muted-foreground">
        {{ query.trim() ? "No matches" : "No chats yet" }}
      </p>

      <div v-for="group in groups" :key="group.label" class="mb-3">
        <p class="px-2 py-1 text-xs font-medium tracking-wide text-muted-foreground">
          {{ group.label }}
        </p>

        <div
          v-for="chat in group.chats"
          :key="chat.id"
          class="group relative rounded-md"
          :class="
            route.params.id === chat.id ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
          "
        >
          <input
            v-if="renamingId === chat.id"
            v-model="renameDraft"
            class="w-full rounded-md bg-transparent px-2 py-2 text-sm outline-none ring-[3px] ring-ring/50"
            @blur="commitRename"
            @keydown.enter.prevent="commitRename"
            @keydown.esc="renamingId = null"
          />

          <button
            v-else
            type="button"
            class="w-full px-2 py-2 pr-8 text-left"
            @click="open(chat.id)"
          >
            <span class="block truncate text-sm">{{ chat.title }}</span>
            <span
              v-if="snippetFor(chat.id)"
              class="mt-0.5 block truncate text-xs text-muted-foreground"
            >
              {{ snippetFor(chat.id) }}
            </span>
          </button>

          <div v-if="renamingId !== chat.id" class="absolute top-1.5 right-1">
            <button
              type="button"
              class="rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100"
              aria-label="Chat actions"
              @click.stop="menuOpenId = menuOpenId === chat.id ? null : chat.id"
            >
              <MoreHorizontal class="size-4" />
            </button>

            <!-- Invisible catcher so clicking anywhere dismisses the menu. -->
            <div
              v-if="menuOpenId === chat.id"
              class="fixed inset-0 z-10"
              @click.stop="menuOpenId = null"
            />
            <div
              v-if="menuOpenId === chat.id"
              class="absolute top-7 right-0 z-20 w-36 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md"
            >
              <button
                type="button"
                class="w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                @click.stop="startRename(chat)"
              >
                Rename
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-destructive hover:bg-accent"
                @click.stop="remove(chat.id)"
              >
                <Trash2 class="size-3.5" />
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  </aside>
</template>
