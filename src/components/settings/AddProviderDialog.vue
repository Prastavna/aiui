<script setup lang="ts">
import { Plus, Search } from "lucide-vue-next";
import { computed, ref } from "vue";
import Dialog from "@/components/ui/Dialog.vue";
import { PRESETS, type ProviderPreset } from "@/lib/providers/presets";
import { useProvidersStore } from "@/stores/providers";

const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ added: [label: string] }>();

const providersStore = useProvidersStore();
const query = ref("");

/** The handful most people start with; kept visually first. */
const SUGGESTED = new Set(["openai", "anthropic", "google", "openrouter"]);

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase();
  if (!needle) {
    return [...PRESETS].sort((a, b) => Number(SUGGESTED.has(b.id)) - Number(SUGGESTED.has(a.id)));
  }
  return PRESETS.filter(
    (preset) =>
      preset.label.toLowerCase().includes(needle) ||
      preset.id.includes(needle) ||
      preset.protocol.includes(needle),
  );
});

function initials(label: string) {
  const parts = label
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/);
  return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
}

function protocolLabel(preset: ProviderPreset) {
  if (preset.protocol === "openai-compatible") return "OpenAI-compatible";
  if (preset.protocol === "google") return "Google Gemini";
  if (preset.protocol === "anthropic") return "Anthropic";
  if (preset.protocol === "opencode-server") return "Local server";
  return "OpenAI";
}

function add(preset: ProviderPreset) {
  providersStore.createFromPreset(preset.id);
  query.value = "";
  open.value = false;
  emit("added", preset.label);
}
</script>

<template>
  <Dialog
    v-model:open="open"
    title="Add a provider"
    description="Pick a preset — you can change its URL, protocol, key and headers afterwards."
  >
    <div class="relative">
      <Search
        class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        v-model="query"
        type="search"
        placeholder="Search providers"
        aria-label="Search providers"
        class="h-10 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
      />
    </div>

    <div class="scrollbar-thin -mx-1 max-h-[45dvh] overflow-y-auto px-1">
      <button
        v-for="preset in filtered"
        :key="preset.id"
        type="button"
        class="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/20"
        @click="add(preset)"
      >
        <span
          class="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/50 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
          aria-hidden="true"
        >
          {{ initials(preset.label) }}
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5">
            <span class="truncate text-sm font-medium">{{ preset.label }}</span>
            <span
              v-if="SUGGESTED.has(preset.id)"
              class="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-muted-foreground uppercase"
            >
              Suggested
            </span>
          </span>
          <span class="mt-0.5 block truncate text-xs text-muted-foreground">
            {{ protocolLabel(preset) }} · {{ preset.requiresKey ? "API key required" : "No key" }}
          </span>
        </span>
        <Plus
          class="size-4 shrink-0 text-muted-foreground opacity-40 transition-opacity group-hover:opacity-100"
        />
      </button>

      <p v-if="!filtered.length" class="px-3 py-10 text-center text-sm text-muted-foreground">
        No provider matches “{{ query }}”.
      </p>
    </div>

    <p class="text-xs leading-5 text-muted-foreground">
      Anything else works through the
      <span class="font-medium text-foreground">Custom (OpenAI-compatible)</span> preset.
    </p>
  </Dialog>
</template>
