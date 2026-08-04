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
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/50" />
      <DialogContent
        :class="
          cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-background p-5 shadow-lg outline-none',
            props.class,
          )
        "
      >
        <div v-if="props.title || props.description" class="flex flex-col gap-1">
          <DialogTitle v-if="props.title" class="text-base font-semibold">
            {{ props.title }}
          </DialogTitle>
          <DialogDescription v-if="props.description" class="text-sm text-muted-foreground">
            {{ props.description }}
          </DialogDescription>
        </div>

        <slot />

        <DialogClose
          class="absolute top-4 right-4 rounded-sm text-muted-foreground opacity-70 transition-opacity outline-none hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Close"
        >
          <X class="size-4" />
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
