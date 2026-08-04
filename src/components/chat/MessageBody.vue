<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { initHighlighter, renderMarkdown } from "@/lib/markdown";

const props = defineProps<{ content: string }>();

/**
 * Bumped once Shiki finishes loading so blocks rendered before it was ready
 * get re-highlighted. Module-level would be cleaner, but a ref per component
 * keeps the dependency explicit for Vue's reactivity.
 */
const highlighterReady = ref(false);

onMounted(() => {
  void initHighlighter().then(() => {
    highlighterReady.value = true;
  });
});

const html = computed(() => {
  // Touch the flag so the render re-runs when Shiki lands.
  void highlighterReady.value;
  return renderMarkdown(props.content);
});

/**
 * Copy buttons are markup emitted by the renderer, not components, so they're
 * handled by delegation rather than a listener per block.
 */
async function onClick(event: MouseEvent) {
  const target = (event.target as HTMLElement | null)?.closest(".md-copy");
  if (!(target instanceof HTMLElement)) return;

  const code = target.dataset.code ?? "";
  try {
    await navigator.clipboard.writeText(code);
    const original = target.textContent;
    target.textContent = "Copied";
    setTimeout(() => {
      target.textContent = original;
    }, 1200);
  } catch {
    target.textContent = "Copy failed";
  }
}
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- markdown-it runs with html:false, so model output is escaped. -->
  <div class="md" @click="onClick" v-html="html" />
</template>
