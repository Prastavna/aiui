<script setup lang="ts">
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-vue-next";
import { computed, onUnmounted, ref, watch } from "vue";
import Button from "@/components/ui/Button.vue";
import Textarea from "@/components/ui/Textarea.vue";
import type { Message } from "@/lib/types";
import { formatBytes } from "@/lib/utils";
import { useProvidersStore } from "@/stores/providers";
import MessageBody from "./MessageBody.vue";

const props = defineProps<{ message: Message; streaming: boolean }>();
const emit = defineEmits<{
  regenerate: [id: string];
  delete: [id: string];
  edit: [id: string, content: string];
}>();

const providersStore = useProvidersStore();

const editing = ref(false);
const draft = ref("");
const copied = ref(false);
const showReasoning = ref(false);

const isUser = computed(() => props.message.role === "user");

/**
 * Object URLs for image thumbnails. Created in a watcher rather than a computed
 * so the previous batch can be revoked — a computed would leak one URL per
 * recompute, and this component re-renders on every streamed token.
 */
const imageUrls = ref<{ id: string; name: string; url: string }[]>([]);

function revokeImageUrls() {
  for (const image of imageUrls.value) URL.revokeObjectURL(image.url);
  imageUrls.value = [];
}

watch(
  () => props.message.attachments,
  (attachments) => {
    revokeImageUrls();
    imageUrls.value = attachments
      .filter((a) => a.kind === "image" && a.blob)
      .map((a) => ({
        id: a.id,
        name: a.name,
        url: URL.createObjectURL(a.blob as Blob),
      }));
  },
  { immediate: true },
);

onUnmounted(revokeImageUrls);

const textAttachments = computed(() => props.message.attachments.filter((a) => a.kind === "text"));

function startEdit() {
  draft.value = props.message.content;
  editing.value = true;
}

function commitEdit() {
  editing.value = false;
  if (draft.value.trim() && draft.value !== props.message.content) {
    emit("edit", props.message.id, draft.value);
  }
}

async function copy() {
  await navigator.clipboard.writeText(props.message.content);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 1200);
}
</script>

<template>
  <div class="group/message py-4" :class="isUser ? 'flex justify-end' : ''">
    <div :class="isUser ? 'flex max-w-[85%] flex-col items-end' : 'w-full'">
      <!-- Attachments render above the text for both roles. -->
      <div v-if="imageUrls.length" class="mb-2 flex flex-wrap justify-end gap-2">
        <img
          v-for="image in imageUrls"
          :key="image.id"
          :src="image.url"
          :alt="image.name"
          class="max-h-48 rounded-lg border border-border object-cover"
        />
      </div>

      <div v-if="textAttachments.length" class="mb-2 flex flex-wrap justify-end gap-2">
        <span
          v-for="file in textAttachments"
          :key="file.id"
          class="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
        >
          {{ file.name }} · {{ formatBytes(file.size) }}
        </span>
      </div>

      <!-- Editing a user message replaces the bubble with a textarea. -->
      <div v-if="editing" class="w-full min-w-0">
        <Textarea v-model="draft" :rows="4" class="w-full" />
        <div class="mt-2 flex justify-end gap-2">
          <Button variant="ghost" size="sm" @click="editing = false"> Cancel </Button>
          <Button size="sm" @click="commitEdit">Save &amp; resend</Button>
        </div>
      </div>

      <template v-else>
        <div
          v-if="isUser"
          class="rounded-2xl bg-secondary px-4 py-2.5 text-[0.9375rem] leading-7 whitespace-pre-wrap text-secondary-foreground"
        >
          {{ message.content }}
        </div>

        <template v-else>
          <button
            v-if="message.reasoning"
            type="button"
            class="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            @click="showReasoning = !showReasoning"
          >
            <ChevronRight
              class="size-3.5 transition-transform"
              :class="showReasoning && 'rotate-90'"
            />
            Reasoning
          </button>
          <pre
            v-if="message.reasoning && showReasoning"
            class="scrollbar-thin mb-3 max-h-72 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap text-muted-foreground"
            >{{ message.reasoning }}</pre>

          <MessageBody v-if="message.content" :content="message.content" />

          <!-- Typing indicator until the first token lands. -->
          <div v-else-if="streaming" class="flex items-center gap-1 py-1 text-muted-foreground">
            <span class="size-1.5 animate-bounce rounded-full bg-current" />
            <span class="size-1.5 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
            <span class="size-1.5 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
          </div>

          <div
            v-if="message.error"
            class="mt-2 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
          >
            <AlertTriangle class="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{{ message.error }}</span>
          </div>
        </template>
      </template>

      <!-- Action row: hidden until hover, and suppressed while streaming. -->
      <div
        v-if="!editing && !streaming"
        class="mt-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100"
      >
        <Button v-if="message.content" variant="ghost" size="icon-sm" title="Copy" @click="copy">
          <Check v-if="copied" class="size-3.5" />
          <Copy v-else class="size-3.5" />
        </Button>
        <Button
          v-if="isUser"
          variant="ghost"
          size="icon-sm"
          title="Edit and resend"
          @click="startEdit"
        >
          <Pencil class="size-3.5" />
        </Button>
        <Button
          v-if="!isUser"
          variant="ghost"
          size="icon-sm"
          title="Regenerate"
          @click="emit('regenerate', message.id)"
        >
          <RefreshCw class="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Delete message"
          @click="emit('delete', message.id)"
        >
          <Trash2 class="size-3.5" />
        </Button>

        <span v-if="!isUser && message.model" class="ml-1.5 text-xs text-muted-foreground">
          {{ providersStore.labelFor(message.model) }}
        </span>
      </div>
    </div>
  </div>
</template>
