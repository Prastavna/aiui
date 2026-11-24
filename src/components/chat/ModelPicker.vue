<script setup lang="ts">
import { computed } from "vue";
import Select, { type SelectOption } from "@/components/ui/Select.vue";
import type { ModelRef } from "@/lib/types";
import { useProvidersStore } from "@/stores/providers";

const props = defineProps<{
  modelValue: ModelRef | null;
  class?: string;
  ariaLabel?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: ModelRef] }>();

const providersStore = useProvidersStore();

/** Encoded as providerId::modelId so the flat Select can round-trip a pair. */
const options = computed<SelectOption[]>(() =>
  providersStore.availableModels.map((entry) => ({
    value: `${entry.providerId}::${entry.modelId}`,
    label: entry.modelId,
    hint: entry.providerLabel,
  })),
);

const selected = computed({
  get: () =>
    props.modelValue ? `${props.modelValue.providerId}::${props.modelValue.modelId}` : undefined,
  set: (value: string | undefined) => {
    if (!value) return;
    const separator = value.indexOf("::");
    emit("update:modelValue", {
      providerId: value.slice(0, separator),
      modelId: value.slice(separator + 2),
    });
  },
});
</script>

<template>
  <Select
    v-model="selected"
    :options="options"
    :aria-label="props.ariaLabel ?? 'Model'"
    :placeholder="options.length ? 'Select a model' : 'No models available'"
    :disabled="!options.length"
    :class="props.class"
  />
</template>
