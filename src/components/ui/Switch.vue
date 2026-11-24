<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<{ class?: string; id?: string; disabled?: boolean }>();
const model = defineModel<boolean>({ default: false });
</script>

<template>
  <SwitchRoot
    :id="props.id"
    v-model="model"
    :disabled="props.disabled"
    :class="
      cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
        props.class,
      )
    "
  >
    <SwitchThumb
      class="pointer-events-none block size-5 rounded-full bg-background shadow ring-0 transition-transform data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-0.5"
    />
  </SwitchRoot>
</template>
