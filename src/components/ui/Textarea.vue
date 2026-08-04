<script setup lang="ts">
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: string;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  id?: string;
}>();

const model = defineModel<string>({ default: "" });
</script>

<template>
  <textarea
    :id="props.id"
    v-model="model"
    :placeholder="props.placeholder"
    :disabled="props.disabled"
    :rows="props.rows"
    :class="
      cn(
        'scrollbar-thin flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
  />
</template>
