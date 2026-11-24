<script setup lang="ts">
import { ArrowUp, Paperclip, Square, X } from "lucide-vue-next";
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import Button from "@/components/ui/Button.vue";
import type { Attachment } from "@/lib/types";
import { formatBytes, uid } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings";

const props = defineProps<{
  streaming: boolean;
  disabled: boolean;
  /** Shown in place of the prompt so a blocked composer explains itself. */
  disabledReason?: string | null;
}>();
const emit = defineEmits<{
  send: [text: string, attachments: Attachment[]];
  stop: [];
}>();

const settingsStore = useSettingsStore();

const text = ref("");
const attachments = ref<Attachment[]>([]);
const textarea = ref<HTMLTextAreaElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);

/** Text files above this are almost certainly not meant to be pasted inline. */
const MAX_TEXT_BYTES = 512 * 1024;

const canSend = computed(
  () =>
    !props.disabled &&
    !props.streaming &&
    (text.value.trim().length > 0 || attachments.value.length > 0),
);

/**
 * Thumbnail URLs, rebuilt in a watcher so the prior batch gets revoked.
 * A computed would leak a URL per recompute.
 */
const previews = ref<{ id: string; name: string; url: string | null }[]>([]);

function revokePreviews() {
  for (const preview of previews.value) {
    if (preview.url) URL.revokeObjectURL(preview.url);
  }
}

watch(
  attachments,
  (list) => {
    revokePreviews();
    previews.value = list.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      url:
        attachment.kind === "image" && attachment.blob
          ? URL.createObjectURL(attachment.blob)
          : null,
    }));
  },
  { deep: true, immediate: true },
);

onUnmounted(revokePreviews);

// Grow the textarea with its content, capped so the message list keeps room.
watch(text, async () => {
  await nextTick();
  const element = textarea.value;
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
});

async function addFiles(files: FileList | File[]) {
  for (const file of Array.from(files)) {
    const isImage = file.type.startsWith("image/");

    if (isImage) {
      attachments.value.push({
        id: uid(),
        name: file.name || "pasted-image.png",
        mediaType: file.type,
        size: file.size,
        kind: "image",
        blob: file,
      });
      continue;
    }

    if (file.size > MAX_TEXT_BYTES) {
      attachments.value.push({
        id: uid(),
        name: `${file.name} (too large — ${formatBytes(file.size)})`,
        mediaType: file.type || "text/plain",
        size: file.size,
        kind: "text",
        text: "",
      });
      continue;
    }

    attachments.value.push({
      id: uid(),
      name: file.name,
      mediaType: file.type || "text/plain",
      size: file.size,
      kind: "text",
      text: await file.text(),
    });
  }
}

function onPaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? []);
  if (!files.length) return;
  // Only intercept when there are real files; plain text pastes normally.
  event.preventDefault();
  void addFiles(files);
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  const files = event.dataTransfer?.files;
  if (files?.length) void addFiles(files);
}

function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files?.length) void addFiles(input.files);
  input.value = "";
}

function removeAttachment(id: string) {
  attachments.value = attachments.value.filter((attachment) => attachment.id !== id);
}

function submit() {
  if (!canSend.value) return;
  emit("send", text.value, attachments.value);
  text.value = "";
  attachments.value = [];
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter") return;

  const sendOnEnter = settingsStore.settings.sendOnEnter;
  const wantsSend = sendOnEnter ? !event.shiftKey : event.metaKey || event.ctrlKey;

  if (wantsSend) {
    event.preventDefault();
    submit();
  }
}

/** Used by the empty-state starter cards to drop a prompt in and focus it. */
async function fill(prompt: string) {
  text.value = prompt;
  await nextTick();
  const element = textarea.value;
  if (!element) return;
  element.focus();
  element.setSelectionRange(element.value.length, element.value.length);
}

defineExpose({ fill });
</script>

<template>
  <div class="border-t border-border bg-background px-3 pt-3 pb-safe sm:px-4">
    <div class="mx-auto max-w-3xl">
      <div
        class="rounded-2xl border border-input bg-card shadow-sm transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/15"
        :class="dragging && 'border-ring ring-[3px] ring-ring/20'"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <div v-if="previews.length" class="flex flex-wrap gap-2 p-2.5 pb-0">
          <div v-for="attachment in previews" :key="attachment.id" class="relative">
            <img
              v-if="attachment.url"
              :src="attachment.url"
              :alt="attachment.name"
              class="size-16 rounded-lg border border-border object-cover"
            />
            <span
              v-else
              class="flex h-16 max-w-40 items-center rounded-lg border border-border bg-muted px-2 font-mono text-xs break-all text-muted-foreground"
            >
              {{ attachment.name }}
            </span>
            <button
              type="button"
              class="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Remove attachment"
              @click="removeAttachment(attachment.id)"
            >
              <X class="size-3" />
            </button>
          </div>
        </div>

        <div class="flex items-end gap-1 p-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            class="size-10 rounded-full text-muted-foreground hover:text-foreground"
            title="Attach files"
            aria-label="Attach files"
            @click="fileInput?.click()"
          >
            <Paperclip class="size-4" />
          </Button>
          <input ref="fileInput" type="file" multiple class="hidden" @change="onFilePicked" />

          <textarea
            ref="textarea"
            v-model="text"
            rows="1"
            dir="auto"
            :enterkeyhint="settingsStore.settings.sendOnEnter ? 'send' : 'enter'"
            :placeholder="
              disabled
                ? (disabledReason ?? 'Add a provider in Settings to start')
                : 'Send a message…'
            "
            :disabled="disabled"
            aria-label="Message"
            class="scrollbar-thin max-h-60 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-[0.9375rem] leading-6 outline-none placeholder:text-muted-foreground disabled:opacity-60"
            @keydown="onKeydown"
            @paste="onPaste"
          />

          <Button
            v-if="streaming"
            size="icon-sm"
            variant="secondary"
            class="size-10 rounded-full"
            title="Stop generating"
            aria-label="Stop generating"
            @click="emit('stop')"
          >
            <Square class="size-3.5 fill-current" />
          </Button>
          <Button
            v-else
            size="icon-sm"
            class="size-10 rounded-full"
            :disabled="!canSend"
            title="Send message"
            aria-label="Send message"
            @click="submit"
          >
            <ArrowUp class="size-4" />
          </Button>
        </div>
      </div>

      <p class="mt-2 hidden text-center text-[11px] text-muted-foreground sm:block">
        {{
          settingsStore.settings.sendOnEnter
            ? "Enter to send · Shift+Enter for a new line"
            : "Ctrl+Enter to send"
        }}
      </p>
    </div>
  </div>
</template>
