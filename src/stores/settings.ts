import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "@/lib/storage";
import type { AppSettings, GenerationParams, ModelRef } from "@/lib/types";

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<AppSettings>(loadSettings());

  watch(settings, (value) => saveSettings(value), { deep: true });

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
  const systemDark = ref(prefersDark.matches);
  prefersDark.addEventListener("change", (event) => {
    systemDark.value = event.matches;
  });

  const isDark = computed(() =>
    settings.value.theme === "system" ? systemDark.value : settings.value.theme === "dark",
  );

  watch(isDark, (dark) => document.documentElement.classList.toggle("dark", dark), {
    immediate: true,
  });

  function setTheme(theme: AppSettings["theme"]) {
    settings.value.theme = theme;
  }

  function toggleTheme() {
    setTheme(isDark.value ? "light" : "dark");
  }

  function setDefaultModel(model: ModelRef | null) {
    settings.value.defaultModel = model;
  }

  function updateDefaults(patch: Partial<GenerationParams>) {
    settings.value.defaults = { ...settings.value.defaults, ...patch };
  }

  function reset() {
    settings.value = structuredClone(DEFAULT_SETTINGS);
  }

  function replace(next: AppSettings) {
    settings.value = { ...DEFAULT_SETTINGS, ...next };
  }

  return {
    settings,
    isDark,
    setTheme,
    toggleTheme,
    setDefaultModel,
    updateDefaults,
    reset,
    replace,
  };
});
