<script setup lang="ts">
import {
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Label from "@/components/ui/Label.vue";
import Select, { type SelectOption } from "@/components/ui/Select.vue";
import Switch from "@/components/ui/Switch.vue";
import {
  duplicateHeaderNames,
  type HeaderRow,
  isValidHeaderName,
  rowsToHeaders,
} from "@/lib/providers/headers";
import { getPreset } from "@/lib/providers/presets";
import type { Protocol, ProviderConfig } from "@/lib/types";
import { uid } from "@/lib/utils";
import { useProvidersStore } from "@/stores/providers";

/**
 * A preset picks a protocol, but its base URL can be repointed at a gateway
 * that speaks a different wire format, so the two are edited independently.
 */
const PROTOCOL_OPTIONS: SelectOption<Protocol>[] = [
  { value: "openai", label: "OpenAI", hint: "native" },
  { value: "anthropic", label: "Anthropic", hint: "native" },
  { value: "google", label: "Google Gemini", hint: "native" },
  { value: "openai-compatible", label: "OpenAI-compatible", hint: "generic" },
];

const props = defineProps<{ provider: ProviderConfig }>();

const providersStore = useProvidersStore();

// Open on mount while anything required is still blank — presets seed
// cachedModels, so that list says nothing about whether setup is done.
const expanded = ref(
  !props.provider.baseUrl.trim() ||
    (Boolean(getPreset(props.provider.presetId)?.requiresKey) && !props.provider.apiKey.trim()),
);
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

/** True once the protocol has been moved off whatever the preset chose. */
const overridesPresetProtocol = computed(
  () => !!preset.value && preset.value.protocol !== props.provider.protocol,
);

const initials = computed(() => {
  const parts = props.provider.label
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
});

const protocolLabel = computed(() => {
  switch (props.provider.protocol) {
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "google":
      return "Google Gemini";
    default:
      return "OpenAI-compatible";
  }
});

const status = computed(() => {
  if (!props.provider.enabled) return { dot: "bg-muted-foreground/40", label: "Disabled" };
  if (!props.provider.baseUrl.trim()) return { dot: "bg-warning", label: "Needs a base URL" };
  if (needsKey.value) return { dot: "bg-warning", label: "Needs an API key" };
  return { dot: "bg-success", label: "Ready" };
});

const modelSummary = computed(() => {
  const count = props.provider.cachedModels.length;
  return count === 0 ? "No models fetched yet" : `${count} model${count === 1 ? "" : "s"}`;
});

function patch(patchValue: Partial<ProviderConfig>) {
  providersStore.update(props.provider.id, patchValue);
}

function setProtocol(value: Protocol | undefined) {
  if (value) patch({ protocol: value });
}

/**
 * Rows are the editing source of truth and the stored Record is derived from
 * them. Driving the inputs off the Record instead would delete a row the moment
 * its name was cleared to be retyped.
 */
const headerRows = ref<HeaderRow[]>(toRows(props.provider.headers));

/** The last Record this card wrote, so external replacements are detectable. */
let committedHeaders = JSON.stringify(props.provider.headers);

function toRows(headers: Record<string, string>): HeaderRow[] {
  return Object.entries(headers).map(([name, value]) => ({
    id: uid(),
    name,
    value,
  }));
}

const invalidHeaderNames = computed(() =>
  headerRows.value
    .map((row) => row.name.trim())
    .filter((name) => name.length > 0 && !isValidHeaderName(name)),
);

const duplicatedHeaderNames = computed(() => duplicateHeaderNames(headerRows.value));

function commitHeaders() {
  const headers = rowsToHeaders(headerRows.value);
  committedHeaders = JSON.stringify(headers);
  patch({ headers });
}

// Importing a bundle rewrites configs in place; adopt headers that arrived from
// anywhere other than this card, so the rows don't go stale.
watch(
  () => props.provider.headers,
  (headers) => {
    const serialized = JSON.stringify(headers);
    if (serialized === committedHeaders) return;
    committedHeaders = serialized;
    headerRows.value = toRows(headers);
  },
);

function addHeader() {
  headerRows.value.push({ id: uid(), name: "", value: "" });
}

function updateHeader(id: string, change: Partial<HeaderRow>) {
  const row = headerRows.value.find((candidate) => candidate.id === id);
  if (!row) return;
  Object.assign(row, change);
  commitHeaders();
}

function removeHeader(id: string) {
  headerRows.value = headerRows.value.filter((row) => row.id !== id);
  commitHeaders();
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

function remove() {
  if (!confirm(`Remove ${props.provider.label}? Its key will be deleted from this browser.`)) {
    return;
  }
  providersStore.remove(props.provider.id);
}
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
    <div class="flex items-center gap-1 p-3 sm:gap-2 sm:p-4">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <span
          class="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          aria-hidden="true"
        >
          {{ initials }}
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-2">
            <span class="truncate text-sm font-medium">{{ provider.label }}</span>
            <TriangleAlert
              v-if="needsKey"
              class="size-3.5 shrink-0 text-muted-foreground"
              aria-label="API key required"
            />
          </span>
          <span class="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span class="size-1.5 shrink-0 rounded-full" :class="status.dot" aria-hidden="true" />
            <span class="truncate">
              {{ status.label }} · {{ modelSummary }} · {{ protocolLabel }}
            </span>
          </span>
        </span>
      </button>

      <Switch
        :model-value="provider.enabled"
        :aria-label="`Enable ${provider.label}`"
        title="Enabled"
        @update:model-value="patch({ enabled: $event })"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        :aria-label="expanded ? 'Collapse provider' : 'Expand provider'"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <ChevronDown
          class="size-4 text-muted-foreground transition-transform"
          :class="expanded && 'rotate-180'"
        />
      </Button>
    </div>

    <div v-if="expanded" class="flex flex-col gap-5 border-t border-border p-3 sm:p-4">
      <!-- Connection -->
      <section class="flex flex-col gap-3">
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
            <Label :for="`protocol-${provider.id}`">Protocol</Label>
            <Select
              :id="`protocol-${provider.id}`"
              :model-value="provider.protocol"
              :options="PROTOCOL_OPTIONS"
              aria-label="Protocol"
              @update:model-value="setProtocol"
            />
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <Label :for="`url-${provider.id}`">Base URL</Label>
          <Input
            :id="`url-${provider.id}`"
            :model-value="provider.baseUrl"
            placeholder="https://api.example.com/v1"
            class="font-mono text-[13px]"
            @update:model-value="patch({ baseUrl: $event })"
          />
          <p class="text-xs leading-5 text-muted-foreground">
            The wire format this endpoint speaks, not who runs it. Change the protocol when the base
            URL points at a gateway that differs from the preset.
          </p>
          <p v-if="overridesPresetProtocol" class="text-xs leading-5 text-muted-foreground">
            Overriding {{ preset?.label }}'s default protocol
            <span class="font-mono">{{ preset?.protocol }}</span
            >. Re-fetch models after changing this — discovery uses the protocol's own listing
            endpoint.
          </p>
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
              class="pr-10 font-mono text-[13px]"
              :placeholder="preset?.requiresKey ? 'Required' : 'Not required'"
              @update:model-value="patch({ apiKey: $event })"
            />
            <button
              type="button"
              class="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              :aria-label="showKey ? 'Hide key' : 'Show key'"
              @click="showKey = !showKey"
            >
              <EyeOff v-if="showKey" class="size-4" />
              <Eye v-else class="size-4" />
            </button>
          </div>
          <p v-if="preset?.note" class="text-xs leading-5 text-muted-foreground">
            {{ preset.note }}
          </p>
          <p v-if="preset?.cors === 'unknown'" class="text-xs leading-5 text-muted-foreground">
            This provider hasn't been confirmed to allow browser-origin requests. Use "Test" below —
            if it fails with a connection error, the provider is blocking CORS and needs a proxy.
          </p>
        </div>
      </section>

      <!-- Advanced -->
      <section class="flex flex-col gap-3 border-t border-border pt-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-xs font-semibold tracking-wide uppercase">Custom headers</h3>
            <p class="mt-0.5 text-xs text-muted-foreground">
              Sent with every request, including model discovery.
            </p>
          </div>
          <Button variant="outline" size="sm" @click="addHeader">
            <Plus class="size-3.5" />
            Add
          </Button>
        </div>

        <div v-for="row in headerRows" :key="row.id" class="flex flex-col gap-2 sm:flex-row">
          <Input
            :model-value="row.name"
            placeholder="Header-Name"
            class="font-mono text-[13px] sm:flex-1"
            aria-label="Header name"
            @update:model-value="updateHeader(row.id, { name: $event })"
          />
          <Input
            :model-value="row.value"
            placeholder="value"
            class="font-mono text-[13px] sm:flex-[2]"
            aria-label="Header value"
            @update:model-value="updateHeader(row.id, { value: $event })"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            class="self-end text-muted-foreground hover:text-destructive sm:self-auto"
            title="Remove header"
            aria-label="Remove header"
            @click="removeHeader(row.id)"
          >
            <Trash2 class="size-4" />
          </Button>
        </div>

        <p class="text-xs leading-5 text-muted-foreground">
          Use for gateway routing or attribution headers such as OpenRouter's
          <span class="font-mono">HTTP-Referer</span>.
        </p>
        <p v-if="invalidHeaderNames.length" class="text-xs leading-5 text-destructive">
          Not valid header names, so they won't be sent:
          <span class="font-mono">{{ invalidHeaderNames.join(", ") }}</span
          >. Names allow letters, digits and <span class="font-mono">-_.~!#$%&amp;'*+^`|</span> — no
          spaces or colons.
        </p>
        <p v-if="duplicatedHeaderNames.length" class="text-xs leading-5 text-muted-foreground">
          Repeated, so only the last row of each is sent:
          <span class="font-mono">{{ duplicatedHeaderNames.join(", ") }}</span>
        </p>
      </section>

      <!-- Models -->
      <section class="flex flex-col gap-3 border-t border-border pt-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-xs font-semibold tracking-wide uppercase">Models</h3>
            <p class="mt-0.5 text-xs text-muted-foreground">{{ modelSummary }}</p>
          </div>
          <Button variant="outline" size="sm" :disabled="discovery.loading" @click="refresh">
            <Loader2 v-if="discovery.loading" class="size-3.5 animate-spin" />
            <RefreshCw v-else class="size-3.5" />
            Fetch models
          </Button>
        </div>

        <div class="flex flex-col gap-2 sm:flex-row">
          <Select
            v-model="testModel"
            :options="modelOptions"
            placeholder="No models fetched yet"
            :disabled="!modelOptions.length"
            aria-label="Model to test"
            class="sm:flex-1"
          />
          <Button
            variant="secondary"
            class="sm:w-24"
            :disabled="!testModel || testing"
            @click="test"
          >
            <Loader2 v-if="testing" class="size-3.5 animate-spin" />
            Test
          </Button>
        </div>

        <p v-if="discovery.error" class="text-xs leading-5 text-destructive">
          {{ discovery.error }}
        </p>
        <p
          v-if="testResult"
          class="flex items-start gap-1.5 text-xs leading-5"
          :class="testResult.ok ? 'text-muted-foreground' : 'text-destructive'"
        >
          <Check v-if="testResult.ok" class="mt-0.5 size-3.5 shrink-0" />
          <X v-else class="mt-0.5 size-3.5 shrink-0" />
          {{ testResult.message }}
        </p>
      </section>

      <div class="flex justify-end border-t border-border pt-4">
        <Button
          variant="ghost"
          size="sm"
          class="text-muted-foreground hover:text-destructive"
          @click="remove"
        >
          <Trash2 class="size-3.5" />
          Remove provider
        </Button>
      </div>
    </div>
  </div>
</template>
