<script setup lang="ts">
import {
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Label from "@/components/ui/Label.vue";
import Select from "@/components/ui/Select.vue";
import Switch from "@/components/ui/Switch.vue";
import { getPreset } from "@/lib/providers/presets";
import type { ProviderConfig } from "@/lib/types";
import { useProvidersStore } from "@/stores/providers";

const props = defineProps<{ provider: ProviderConfig }>();

const providersStore = useProvidersStore();

const expanded = ref(!props.provider.apiKey && !props.provider.cachedModels.length);
const showKey = ref(false);
const testing = ref(false);
const testResult = ref<{ ok: boolean; message: string } | null>(null);
const testModel = ref<string | undefined>(props.provider.cachedModels[0]);

const preset = computed(() => getPreset(props.provider.presetId));
const discovery = computed(
  () =>
    providersStore.discovery[props.provider.id] ?? {
      loading: false,
      error: null,
    },
);

const needsKey = computed(() => preset.value?.requiresKey && !props.provider.apiKey.trim());

const modelOptions = computed(() =>
  props.provider.cachedModels.map((id) => ({ value: id, label: id })),
);

function patch(patchValue: Partial<ProviderConfig>) {
  providersStore.update(props.provider.id, patchValue);
}

async function refresh() {
  await providersStore.refreshModels(props.provider.id);
  testModel.value ??= props.provider.cachedModels[0];
}

async function test() {
  if (!testModel.value) return;
  testing.value = true;
  testResult.value = null;
  try {
    testResult.value = await providersStore.testConnection(props.provider.id, testModel.value);
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <div class="rounded-lg border border-border">
    <div class="flex items-center gap-3 p-3">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-2 text-left"
        @click="expanded = !expanded"
      >
        <ChevronDown
          class="size-4 shrink-0 text-muted-foreground transition-transform"
          :class="expanded && 'rotate-180'"
        />
        <span class="min-w-0">
          <span class="block truncate text-sm font-medium">
            {{ provider.label }}
          </span>
          <span class="block truncate text-xs text-muted-foreground">
            {{ provider.cachedModels.length }} models · {{ provider.protocol }}
          </span>
        </span>
      </button>

      <TriangleAlert
        v-if="needsKey"
        class="size-4 shrink-0 text-muted-foreground"
        title="API key required"
      />
      <Switch
        :model-value="provider.enabled"
        title="Enabled"
        @update:model-value="patch({ enabled: $event })"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        title="Remove provider"
        @click="providersStore.remove(provider.id)"
      >
        <Trash2 class="size-4" />
      </Button>
    </div>

    <div v-if="expanded" class="flex flex-col gap-3 border-t border-border p-3">
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="flex flex-col gap-1.5">
          <Label :for="`label-${provider.id}`">Display name</Label>
          <Input
            :id="`label-${provider.id}`"
            :model-value="provider.label"
            @update:model-value="patch({ label: $event })"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label :for="`url-${provider.id}`">Base URL</Label>
          <Input
            :id="`url-${provider.id}`"
            :model-value="provider.baseUrl"
            placeholder="https://api.example.com/v1"
            @update:model-value="patch({ baseUrl: $event })"
          />
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <Label :for="`key-${provider.id}`">
          API key
          <a
            v-if="preset?.apiKeyUrl"
            :href="preset.apiKeyUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground"
          >
            get one <ExternalLink class="size-3" />
          </a>
        </Label>
        <div class="relative">
          <Input
            :id="`key-${provider.id}`"
            :model-value="provider.apiKey"
            :type="showKey ? 'text' : 'password'"
            class="pr-9 font-mono"
            :placeholder="preset?.requiresKey ? 'Required' : 'Not required'"
            @update:model-value="patch({ apiKey: $event })"
          />
          <button
            type="button"
            class="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            :aria-label="showKey ? 'Hide key' : 'Show key'"
            @click="showKey = !showKey"
          >
            <EyeOff v-if="showKey" class="size-4" />
            <Eye v-else class="size-4" />
          </button>
        </div>
        <p v-if="preset?.note" class="text-xs text-muted-foreground">
          {{ preset.note }}
        </p>
        <p v-if="preset?.cors === 'unknown'" class="text-xs text-muted-foreground">
          This provider hasn't been confirmed to allow browser-origin requests. Use "Test" below —
          if it fails with a connection error, the provider is blocking CORS and needs a proxy.
        </p>
      </div>

      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <Label>Models</Label>
          <Button variant="outline" size="sm" :disabled="discovery.loading" @click="refresh">
            <Loader2 v-if="discovery.loading" class="size-3.5 animate-spin" />
            <RefreshCw v-else class="size-3.5" />
            Fetch models
          </Button>
        </div>

        <div class="flex gap-2">
          <Select
            v-model="testModel"
            :options="modelOptions"
            placeholder="No models fetched yet"
            :disabled="!modelOptions.length"
            class="flex-1"
          />
          <Button
            variant="secondary"
            size="default"
            :disabled="!testModel || testing"
            @click="test"
          >
            <Loader2 v-if="testing" class="size-3.5 animate-spin" />
            Test
          </Button>
        </div>

        <p v-if="discovery.error" class="text-xs text-destructive">
          {{ discovery.error }}
        </p>
        <p
          v-if="testResult"
          class="flex items-start gap-1.5 text-xs"
          :class="testResult.ok ? 'text-muted-foreground' : 'text-destructive'"
        >
          <Check v-if="testResult.ok" class="mt-0.5 size-3.5 shrink-0" />
          <X v-else class="mt-0.5 size-3.5 shrink-0" />
          {{ testResult.message }}
        </p>
      </div>
    </div>
  </div>
</template>
