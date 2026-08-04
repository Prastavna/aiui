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
</script>

<template>
  <div class="border-t border-border bg-background px-4 py-3">
    <div
      class="mx-auto max-w-3xl rounded-2xl border border-input transition-colors"
      :class="dragging && 'border-ring ring-[3px] ring-ring/50'"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <div v-if="previews.length" class="flex flex-wrap gap-2 p-2 pb-0">
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
            class="absolute -top-1.5 -right-1.5 rounded-full border border-border bg-background p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Remove attachment"
            @click="removeAttachment(attachment.id)"
          >
            <X class="size-3" />
          </button>
        </div>
      </div>

      <div class="flex items-end gap-1 p-2">
        <Button variant="ghost" size="icon-sm" title="Attach files" @click="fileInput?.click()">
          <Paperclip class="size-4" />
        </Button>
        <input ref="fileInput" type="file" multiple class="hidden" @change="onFilePicked" />

        <textarea
          ref="textarea"
          v-model="text"
          rows="1"
          :placeholder="
            disabled ? (disabledReason ?? 'Add a provider in Settings to start') : 'Send a message…'
          "
          :disabled="disabled"
          class="scrollbar-thin max-h-60 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-[0.9375rem] outline-none placeholder:text-muted-foreground disabled:opacity-50"
          @keydown="onKeydown"
          @paste="onPaste"
        />

        <Button
          v-if="streaming"
          size="icon-sm"
          variant="secondary"
          title="Stop generating"
          @click="emit('stop')"
        >
          <Square class="size-3.5 fill-current" />
        </Button>
        <Button v-else size="icon-sm" :disabled="!canSend" title="Send" @click="submit">
          <ArrowUp class="size-4" />
        </Button>
      </div>
    </div>

    <p class="mx-auto mt-1.5 max-w-3xl text-center text-xs text-muted-foreground">
      {{
        settingsStore.settings.sendOnEnter
          ? "Enter to send · Shift+Enter for a new line"
          : "Ctrl+Enter to send"
      }}
    </p>
  </div>
</template>
