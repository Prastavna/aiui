<script setup lang="ts">
import {
  Lock,
  MessageSquarePlus,
  Moon,
  MoreHorizontal,
  Search,
  Settings,
  Sun,
  Trash2,
  X,
} from "lucide-vue-next";
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import BrandMark from "@/components/BrandMark.vue";
import Button from "@/components/ui/Button.vue";
import { searchChats } from "@/lib/db";
import type { Chat } from "@/lib/types";
import { cn, relativeBucket } from "@/lib/utils";
import { useChatsStore } from "@/stores/chats";
import { useSettingsStore } from "@/stores/settings";

const props = defineProps<{ class?: string; inert?: boolean; open?: boolean }>();
const emit = defineEmits<{ navigate: []; close: [] }>();

const chatsStore = useChatsStore();
const settingsStore = useSettingsStore();
const router = useRouter();
const route = useRoute();

const query = ref("");
const searchResults = ref<{ chat: Chat; snippet: string | null }[]>([]);
const renamingId = ref<string | null>(null);
const renameDraft = ref("");
const menuOpenId = ref<string | null>(null);

// The drawer is modal on phones; move focus inside so a keyboard user is not
// left tabbing through the inert page behind the backdrop.
watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    await nextTick();
    document.querySelector<HTMLElement>("[data-sidebar-close]")?.focus();
  },
);

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

const themeLabel = computed(() => (settingsStore.isDark ? "Light mode" : "Dark mode"));

async function newChat() {
  const chat = await chatsStore.createChat();
  await router.push(`/chat/${chat.id}`);
  emit("navigate");
}

async function open(id: string) {
  await router.push(`/chat/${id}`);
  emit("navigate");
}

async function openSettings() {
  await router.push("/settings");
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
  <aside
    :class="
      cn(
        'flex h-full flex-col border-r border-border bg-sidebar pt-safe text-sidebar-foreground',
        props.class,
      )
    "
    :inert="props.inert || undefined"
    :aria-hidden="props.inert ? 'true' : undefined"
    :role="props.open ? 'dialog' : undefined"
    :aria-modal="props.open ? 'true' : undefined"
    aria-label="Chat history"
  >
    <div class="flex items-center gap-2 px-3 pt-3 pb-2">
      <RouterLink
        to="/"
        class="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/25"
        aria-label="aiui home"
        @click="emit('navigate')"
      >
        <BrandMark class="size-8 rounded-[10px]" />
        <span class="min-w-0">
          <span class="block truncate text-[15px] leading-tight font-semibold tracking-tight">
            aiui
          </span>
          <span class="block truncate text-[11px] text-muted-foreground"> Private AI chat </span>
        </span>
      </RouterLink>

      <Button
        data-sidebar-close
        variant="ghost"
        size="icon-sm"
        class="md:hidden"
        aria-label="Close sidebar"
        @click="emit('close')"
      >
        <X class="size-4" />
      </Button>
    </div>

    <div class="px-3 pt-1 pb-3">
      <Button class="w-full justify-start gap-2" @click="newChat">
        <MessageSquarePlus class="size-4" />
        New chat
      </Button>
    </div>

    <div class="px-3 pb-3">
      <div class="relative">
        <Search
          class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          v-model="query"
          type="search"
          placeholder="Search chats"
          aria-label="Search chats"
          class="h-10 w-full rounded-lg border border-input bg-background pr-9 pl-8 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
        />
        <button
          v-if="query"
          type="button"
          class="absolute top-1/2 right-0.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Clear search"
          @click="query = ''"
        >
          <X class="size-3.5" />
        </button>
      </div>
    </div>

    <nav aria-label="Chat history" class="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      <p v-if="!groups.length" class="px-3 py-10 text-center text-sm text-muted-foreground">
        {{ query.trim() ? "No matches" : "No chats yet" }}
      </p>

      <div v-for="group in groups" :key="group.label" class="mb-1">
        <p
          class="px-2.5 pt-3 pb-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
        >
          {{ group.label }}
        </p>

        <div
          v-for="chat in group.chats"
          :key="chat.id"
          class="group relative rounded-lg"
          :class="
            route.params.id === chat.id
              ? 'bg-foreground text-background'
              : 'text-sidebar-foreground hover:bg-accent/70'
          "
        >
          <input
            v-if="renamingId === chat.id"
            v-model="renameDraft"
            aria-label="Chat title"
            class="h-10 w-full rounded-lg bg-transparent px-2.5 text-sm outline-none ring-[3px] ring-ring/30"
            @blur="commitRename"
            @keydown.enter.prevent="commitRename"
            @keydown.esc="renamingId = null"
          />

          <button
            v-else
            type="button"
            class="flex min-h-10 w-full items-center rounded-lg px-2.5 py-2 pr-11 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
            :aria-current="route.params.id === chat.id ? 'page' : undefined"
            @click="open(chat.id)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] font-medium">{{ chat.title }}</span>
              <span v-if="snippetFor(chat.id)" class="mt-0.5 block truncate text-[11px] opacity-70">
                {{ snippetFor(chat.id) }}
              </span>
            </span>
          </button>

          <div v-if="renamingId !== chat.id" class="absolute top-1/2 right-1 -translate-y-1/2">
            <button
              type="button"
              class="flex size-9 items-center justify-center rounded-md opacity-100 transition-opacity outline-none focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/30 can-hover:opacity-0 can-hover:group-hover:opacity-100"
              :class="route.params.id === chat.id ? 'hover:bg-background/15' : 'hover:bg-accent'"
              :aria-label="`Actions for ${chat.title}`"
              :aria-expanded="menuOpenId === chat.id"
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
              class="absolute top-9 right-0 z-20 w-40 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
            >
              <button
                type="button"
                class="flex min-h-9 w-full items-center rounded-md px-2.5 text-left text-sm transition-colors hover:bg-accent"
                @click.stop="startRename(chat)"
              >
                Rename
              </button>
              <button
                type="button"
                class="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm text-destructive transition-colors hover:bg-accent"
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

    <div class="border-t border-border px-2.5 pt-2.5 pb-safe">
      <p class="mb-2 flex items-center gap-1.5 px-1 text-[11px] leading-snug text-muted-foreground">
        <Lock class="size-3 shrink-0" />
        Conversations stay on this device
      </p>

      <div class="grid grid-cols-2 gap-1">
        <button
          type="button"
          class="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-left text-xs font-medium text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25"
          @click="settingsStore.toggleTheme()"
        >
          <Sun v-if="settingsStore.isDark" class="size-4" />
          <Moon v-else class="size-4" />
          {{ themeLabel }}
        </button>
        <button
          type="button"
          class="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-left text-xs font-medium text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25"
          @click="openSettings"
        >
          <Settings class="size-4" />
          Settings
        </button>
      </div>
    </div>
  </aside>
</template>
