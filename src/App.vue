<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import Sidebar from "@/components/Sidebar.vue";
import { useChatsStore } from "@/stores/chats";
import { useSettingsStore } from "@/stores/settings";

// Instantiating settings applies the stored theme before first paint of routes.
useSettingsStore();
const chatsStore = useChatsStore();
const route = useRoute();

const sidebarOpen = ref(false);

/**
 * Desktop keeps the sidebar in the layout; the drawer only exists below md.
 * Tracking the breakpoint lets us inert the off-canvas panel when closed so
 * its links aren't tabbable, while leaving the desktop column interactive.
 */
const desktopQuery = window.matchMedia("(min-width: 768px)");
const isDesktop = ref(desktopQuery.matches);

function onBreakpoint(event: MediaQueryListEvent) {
  isDesktop.value = event.matches;
  if (event.matches) sidebarOpen.value = false;
}

watch(sidebarOpen, async (open) => {
  document.body.style.overflow = open && !isDesktop.value ? "hidden" : "";
  // Hand focus back to the toggle that opened the mobile drawer.
  if (!open && !isDesktop.value) {
    await nextTick();
    document.querySelector<HTMLElement>("[data-sidebar-toggle]")?.focus();
  }
});

// Navigating from the drawer should reveal the page, not leave it covered.
watch(
  () => route.fullPath,
  () => {
    sidebarOpen.value = false;
  },
);

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && sidebarOpen.value) sidebarOpen.value = false;
}

function focusMain() {
  document.getElementById("main")?.focus();
}

onMounted(() => {
  desktopQuery.addEventListener("change", onBreakpoint);
  window.addEventListener("keydown", onKeydown);
  void chatsStore.loadChats();
});

onUnmounted(() => {
  desktopQuery.removeEventListener("change", onBreakpoint);
  window.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = "";
});
</script>

<template>
  <a
    href="#main"
    class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
    :inert="!isDesktop && sidebarOpen ? true : undefined"
    :aria-hidden="!isDesktop && sidebarOpen ? 'true' : undefined"
    @click.prevent="focusMain"
  >
    Skip to content
  </a>

  <div class="flex h-full overflow-hidden">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="sidebarOpen"
        class="fixed inset-0 z-30 bg-foreground/25 backdrop-blur-[2px] md:hidden"
        @click="sidebarOpen = false"
      />
    </Transition>

    <Sidebar
      class="fixed inset-y-0 left-0 z-40 w-[86%] max-w-80 shadow-2xl transition-transform duration-200 ease-out md:static md:z-auto md:w-72 md:max-w-none md:translate-x-0 md:shadow-none"
      :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
      :inert="!isDesktop && !sidebarOpen"
      :open="sidebarOpen"
      @navigate="sidebarOpen = false"
      @close="sidebarOpen = false"
    />

    <main
      id="main"
      tabindex="-1"
      class="flex min-w-0 flex-1 flex-col outline-none"
      :inert="!isDesktop && sidebarOpen ? true : undefined"
      :aria-hidden="!isDesktop && sidebarOpen ? 'true' : undefined"
    >
      <RouterView v-slot="{ Component }">
        <component :is="Component" @toggle-sidebar="sidebarOpen = !sidebarOpen" />
      </RouterView>
    </main>
  </div>
</template>
