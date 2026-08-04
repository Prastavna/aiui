import type { AppSettings, ProviderConfig } from "./types";

/**
 * Settings and provider configs live in localStorage so they're readable
 * synchronously during boot — no hydration gate before the first render.
 *
 * API keys are stored here in plaintext. Anything running in this origin can
 * read them; the settings screen says so explicitly. Use scoped, revocable,
 * spend-limited keys.
 */
const SETTINGS_KEY = "aiui:settings:v1";
const PROVIDERS_KEY = "aiui:providers:v1";

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  defaultModel: null,
  defaults: {
    temperature: null,
    maxOutputTokens: null,
    topP: null,
    systemPrompt: "",
  },
  sendOnEnter: true,
  contextLimit: 0,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt or partially-written entry: fall back rather than dying at boot.
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to persist ${key}`, error);
  }
}

export function loadSettings(): AppSettings {
  const stored = read<Partial<AppSettings>>(SETTINGS_KEY, {});
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    defaults: { ...DEFAULT_SETTINGS.defaults, ...stored.defaults },
  };
}

export function saveSettings(settings: AppSettings): void {
  write(SETTINGS_KEY, settings);
}

export function loadProviders(): ProviderConfig[] {
  const stored = read<ProviderConfig[]>(PROVIDERS_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

export function saveProviders(providers: ProviderConfig[]): void {
  write(PROVIDERS_KEY, providers);
}

export function clearAll(): void {
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(PROVIDERS_KEY);
}
