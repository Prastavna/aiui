<script setup lang="ts" generic="T extends string">
import { Check, ChevronDown } from "lucide-vue-next";
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from "reka-ui";
import { cn } from "@/lib/utils";

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  hint?: string;
}

const props = defineProps<{
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  class?: string;
  id?: string;
  ariaLabel?: string;
}>();

const model = defineModel<T | undefined>();
</script>

<template>
  <SelectRoot v-model="model" :disabled="props.disabled">
    <SelectTrigger
      :id="props.id"
      :aria-label="props.ariaLabel"
      :class="
        cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground',
          props.class,
        )
      "
    >
      <SelectValue :placeholder="props.placeholder ?? 'Select…'" class="truncate" />
      <SelectIcon as-child>
        <ChevronDown class="size-4 shrink-0 opacity-50" />
      </SelectIcon>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent
        position="popper"
        :side-offset="4"
        class="relative z-50 max-h-72 min-w-[var(--reka-select-trigger-width)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
      >
        <SelectViewport class="scrollbar-thin max-h-72 overflow-y-auto p-1.5">
          <SelectItem
            v-for="option in props.options"
            :key="option.value"
            :value="option.value"
            class="relative flex w-full cursor-default items-center gap-2 rounded-md py-2 pr-2 pl-7 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
          >
            <SelectItemIndicator class="absolute left-2 flex items-center">
              <Check class="size-3.5" />
            </SelectItemIndicator>
            <SelectItemText class="truncate">{{ option.label }}</SelectItemText>
            <span v-if="option.hint" class="ml-auto shrink-0 text-xs text-muted-foreground">
              {{ option.hint }}
            </span>
          </SelectItem>

          <div
            v-if="!props.options.length"
            class="px-2 py-6 text-center text-sm text-muted-foreground"
          >
            No options
          </div>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
