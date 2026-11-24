<script setup lang="ts">
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: string;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}>();

const model = defineModel<string>({ default: "" });
</script>

<template>
  <input
    :id="props.id"
    v-model="model"
    :type="props.type ?? 'text'"
    :placeholder="props.placeholder"
    :disabled="props.disabled"
    :class="
      cn(
        'flex h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
  />
</template>
