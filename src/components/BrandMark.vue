<script setup lang="ts">
import { Asterisk } from "lucide-vue-next";
import { cn } from "@/lib/utils";

const props = defineProps<{ class?: string }>();
</script>

<template>
  <span
    :class="
      cn(
        'grid size-9 shrink-0 place-items-center rounded-[11px] bg-foreground text-background shadow-xs',
        props.class,
      )
    "
    aria-hidden="true"
  >
    <Asterisk class="size-5" :stroke-width="2.5" />
  </span>
</template>
