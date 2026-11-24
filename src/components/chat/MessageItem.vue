<script setup lang="ts">
import {
  AlertTriangle,
  Asterisk,
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

const timestamp = computed(() =>
  new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
    props.message.createdAt,
  ),
);

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
  <div class="group/message py-3 sm:py-4" :class="isUser ? 'flex justify-end' : ''">
    <div :class="isUser ? 'flex max-w-[88%] flex-col items-end sm:max-w-[80%]' : 'w-full'">
      <!-- Attachments render above the text for both roles. -->
      <div
        v-if="imageUrls.length"
        class="mb-2 flex flex-wrap gap-2"
        :class="isUser ? 'justify-end' : 'justify-start'"
      >
        <img
          v-for="image in imageUrls"
          :key="image.id"
          :src="image.url"
          :alt="image.name"
          class="max-h-48 rounded-xl border border-border object-cover"
        />
      </div>

      <div
        v-if="textAttachments.length"
        class="mb-2 flex flex-wrap gap-2"
        :class="isUser ? 'justify-end' : 'justify-start'"
      >
        <span
          v-for="file in textAttachments"
          :key="file.id"
          class="rounded-lg border border-border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
        >
          {{ file.name }} · {{ formatBytes(file.size) }}
        </span>
      </div>

      <!-- Editing a user message replaces the bubble with a textarea. -->
      <div v-if="editing" class="w-full min-w-0">
        <Textarea v-model="draft" :rows="4" class="w-full" aria-label="Edit message" />
        <div class="mt-2 flex justify-end gap-2">
          <Button variant="ghost" size="sm" @click="editing = false"> Cancel </Button>
          <Button size="sm" @click="commitEdit">Save &amp; resend</Button>
        </div>
      </div>

      <template v-else>
        <div
          v-if="isUser"
          class="rounded-2xl rounded-br-md bg-bubble px-4 py-2.5 text-[0.9375rem] leading-7 whitespace-pre-wrap text-bubble-foreground shadow-xs"
        >
          {{ message.content }}
        </div>

        <template v-else>
          <div class="mb-1.5 flex items-center gap-2">
            <span
              class="grid size-7 shrink-0 place-items-center rounded-lg bg-foreground text-background"
              aria-hidden="true"
            >
              <Asterisk class="size-3.5" :stroke-width="2.5" />
            </span>
            <span class="min-w-0 truncate text-xs font-medium">
              {{ message.model ? providersStore.labelFor(message.model) : "Assistant" }}
            </span>
            <span class="shrink-0 text-[11px] text-muted-foreground">{{ timestamp }}</span>
          </div>

          <button
            v-if="message.reasoning"
            type="button"
            class="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25"
            :aria-expanded="showReasoning"
            @click="showReasoning = !showReasoning"
          >
            <ChevronRight
              class="size-3 transition-transform"
              :class="showReasoning && 'rotate-90'"
            />
            Reasoning
          </button>
          <pre
            v-if="message.reasoning && showReasoning"
            class="scrollbar-thin mb-3 max-h-72 overflow-y-auto rounded-xl border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap text-muted-foreground"
            >{{ message.reasoning }}</pre>

          <MessageBody v-if="message.content" :content="message.content" />

          <!-- Typing indicator until the first token lands. -->
          <div v-else-if="streaming" class="flex items-center gap-1.5 py-2 text-muted-foreground">
            <span class="size-1.5 animate-bounce rounded-full bg-current" />
            <span class="size-1.5 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
            <span class="size-1.5 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
          </div>
        </template>

        <!-- Outside the assistant branch: a user message can fail to save, and
             that used to surface nowhere but the console. -->
        <div
          v-if="message.error"
          class="mt-2 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"
        >
          <AlertTriangle class="mt-0.5 size-4 shrink-0 text-destructive" />
          <div class="min-w-0">
            <p>{{ message.error }}</p>
            <Button
              v-if="!isUser"
              variant="outline"
              size="sm"
              class="mt-2 bg-background"
              @click="emit('regenerate', message.id)"
            >
              <RefreshCw class="size-3.5" />
              Try again
            </Button>
          </div>
        </div>
      </template>

      <!-- Action row: always reachable on touch, hover-revealed on desktop. -->
      <div
        v-if="!editing && !streaming"
        class="mt-1.5 flex items-center gap-0.5 opacity-100 transition-opacity focus-within:opacity-100 can-hover:opacity-0 can-hover:group-hover/message:opacity-100"
        :class="isUser && 'justify-end'"
      >
        <Button
          v-if="message.content"
          variant="ghost"
          size="icon-sm"
          class="text-muted-foreground hover:text-foreground"
          :title="copied ? 'Copied' : 'Copy'"
          :aria-label="copied ? 'Copied' : 'Copy message'"
          @click="copy"
        >
          <Check v-if="copied" class="size-3.5" />
          <Copy v-else class="size-3.5" />
        </Button>
        <Button
          v-if="isUser"
          variant="ghost"
          size="icon-sm"
          class="text-muted-foreground hover:text-foreground"
          title="Edit and resend"
          aria-label="Edit and resend"
          @click="startEdit"
        >
          <Pencil class="size-3.5" />
        </Button>
        <Button
          v-if="!isUser"
          variant="ghost"
          size="icon-sm"
          class="text-muted-foreground hover:text-foreground"
          title="Regenerate"
          aria-label="Regenerate reply"
          @click="emit('regenerate', message.id)"
        >
          <RefreshCw class="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="text-muted-foreground hover:text-destructive"
          title="Delete message"
          aria-label="Delete message"
          @click="emit('delete', message.id)"
        >
          <Trash2 class="size-3.5" />
        </Button>

        <span class="ml-1.5 text-[11px] text-muted-foreground">{{ timestamp }}</span>
      </div>
    </div>
  </div>
</template>
