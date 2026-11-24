<script setup lang="ts">
import { X } from "lucide-vue-next";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<{
  title?: string;
  description?: string;
  class?: string;
}>();

const open = defineModel<boolean>("open", { default: false });

/**
 * Desktop opens with the first field focused (nice for keyboard users).
 * On phones that would raise the soft keyboard the moment the sheet appears,
 * so focus the sheet container instead and let the first tap choose a field.
 */
function onOpenAutoFocus(event: Event) {
  if (!window.matchMedia("(max-width: 639px)").matches) return;
  event.preventDefault();
  (event.target as HTMLElement | null)?.focus();
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
      <DialogContent
        tabindex="-1"
        @open-auto-focus="onOpenAutoFocus"
        :class="
          cn(
            'fixed z-50 flex flex-col gap-4 bg-background shadow-xl outline-none',
            'sm:top-1/2 sm:left-1/2 sm:max-h-[85vh] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-border sm:p-5',
            'max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:max-h-[88dvh] max-sm:w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-2xl max-sm:border-t max-sm:border-border max-sm:p-4 max-sm:pb-safe',
            props.class,
          )
        "
      >
        <div class="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-border sm:hidden" />

        <div v-if="props.title || props.description" class="flex flex-col gap-1 pr-8">
          <DialogTitle v-if="props.title" class="text-base font-semibold tracking-tight">
            {{ props.title }}
          </DialogTitle>
          <DialogDescription v-if="props.description" class="text-sm text-muted-foreground">
            {{ props.description }}
          </DialogDescription>
        </div>

        <slot />

        <DialogClose
          class="absolute top-3 right-3 flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25 sm:top-4 sm:right-4 sm:size-8"
          aria-label="Close"
        >
          <X class="size-4" />
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
