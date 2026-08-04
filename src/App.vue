<script setup lang="ts">
import { onMounted, ref } from "vue";
import Sidebar from "@/components/Sidebar.vue";
import { useChatsStore } from "@/stores/chats";
import { useSettingsStore } from "@/stores/settings";

// Instantiating settings applies the stored theme before first paint of routes.
useSettingsStore();
const chatsStore = useChatsStore();

const sidebarOpen = ref(false);

onMounted(() => {
  void chatsStore.loadChats();
});
</script>

<template>
  <div class="flex h-full overflow-hidden">
    <!-- Off-canvas on small screens, static column from md up. -->
    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-30 bg-black/50 md:hidden"
      @click="sidebarOpen = false"
    />
    <Sidebar
      class="fixed inset-y-0 left-0 z-40 w-72 transition-transform md:static md:translate-x-0"
      :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
      @navigate="sidebarOpen = false"
    />

    <main class="flex min-w-0 flex-1 flex-col">
      <RouterView v-slot="{ Component }">
        <component :is="Component" @toggle-sidebar="sidebarOpen = !sidebarOpen" />
      </RouterView>
    </main>
  </div>
</template>
