import type { Protocol } from "@/lib/types";

export interface ProviderPreset {
  id: string;
  label: string;
  protocol: Protocol;
  baseUrl: string;
  /** Where the user gets a key; omitted for local runtimes that need none. */
  apiKeyUrl?: string;
  /** Shown under the key field when there's something specific to know. */
  note?: string;
  /** Seeds the model picker when discovery is unavailable or fails. */
  suggestedModels?: string[];
  /** False for local servers that accept any key, so the form stops nagging. */
  requiresKey: boolean;
  /**
   * Whether the provider is known to send permissive CORS headers for
   * browser-origin requests. "unknown" providers still work if they allow it —
   * the settings screen just warns instead of promising.
   */
  cors: "yes" | "no" | "unknown";
  defaultHeaders?: Record<string, string>;
}

/**
 * Ordered roughly by how likely someone is to reach for them. Anything not
 * listed still works through the "Custom (OpenAI-compatible)" entry.
 */
export const PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    requiresKey: true,
    cors: "yes",
    suggestedModels: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    requiresKey: true,
    cors: "yes",
    note: "Browser calls are sent with the anthropic-dangerous-direct-browser-access header, which Anthropic requires for direct client-side use.",
    suggestedModels: ["claude-sonnet-4-5", "claude-opus-4-5", "claude-haiku-4-5"],
  },
  {
    id: "google",
    label: "Google Gemini",
    protocol: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    requiresKey: true,
    cors: "yes",
    suggestedModels: ["gemini-2.5-pro", "gemini-2.5-flash"],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    protocol: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyUrl: "https://openrouter.ai/keys",
    requiresKey: true,
    cors: "yes",
    note: "Single key, hundreds of models from every major lab.",
  },
  {
    id: "groq",
    label: "Groq",
    protocol: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyUrl: "https://console.groq.com/keys",
    requiresKey: true,
    cors: "yes",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    protocol: "openai-compatible",
    baseUrl: "https://api.deepseek.com/v1",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    requiresKey: true,
    cors: "unknown",
  },
  {
    id: "mistral",
    label: "Mistral",
    protocol: "openai-compatible",
    baseUrl: "https://api.mistral.ai/v1",
    apiKeyUrl: "https://console.mistral.ai/api-keys",
    requiresKey: true,
    cors: "unknown",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    protocol: "openai-compatible",
    baseUrl: "https://api.x.ai/v1",
    apiKeyUrl: "https://console.x.ai",
    requiresKey: true,
    cors: "unknown",
  },
  {
    id: "together",
    label: "Together AI",
    protocol: "openai-compatible",
    baseUrl: "https://api.together.xyz/v1",
    apiKeyUrl: "https://api.together.ai/settings/api-keys",
    requiresKey: true,
    cors: "unknown",
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    protocol: "openai-compatible",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    apiKeyUrl: "https://fireworks.ai/account/api-keys",
    requiresKey: true,
    cors: "unknown",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    protocol: "openai-compatible",
    baseUrl: "https://api.cerebras.ai/v1",
    apiKeyUrl: "https://cloud.cerebras.ai",
    requiresKey: true,
    cors: "unknown",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    protocol: "openai-compatible",
    baseUrl: "https://api.perplexity.ai",
    apiKeyUrl: "https://www.perplexity.ai/settings/api",
    requiresKey: true,
    cors: "unknown",
  },
  {
    id: "nebius",
    label: "Nebius AI Studio",
    protocol: "openai-compatible",
    baseUrl: "https://api.studio.nebius.ai/v1",
    apiKeyUrl: "https://studio.nebius.ai",
    requiresKey: true,
    cors: "unknown",
  },
  {
    id: "hyperbolic",
    label: "Hyperbolic",
    protocol: "openai-compatible",
    baseUrl: "https://api.hyperbolic.xyz/v1",
    apiKeyUrl: "https://app.hyperbolic.xyz/settings",
    requiresKey: true,
    cors: "unknown",
  },
  {
    id: "novita",
    label: "Novita AI",
    protocol: "openai-compatible",
    baseUrl: "https://api.novita.ai/v3/openai",
    apiKeyUrl: "https://novita.ai/settings/key-management",
    requiresKey: true,
    cors: "unknown",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    protocol: "openai-compatible",
    baseUrl: "http://localhost:11434/v1",
    requiresKey: false,
    cors: "no",
    note: 'Ollama rejects browser origins by default. Start it with OLLAMA_ORIGINS="*" (or this app\'s origin) for requests to go through.',
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    protocol: "openai-compatible",
    baseUrl: "http://localhost:1234/v1",
    requiresKey: false,
    cors: "yes",
    note: "Enable the local server in LM Studio's Developer tab, with CORS turned on.",
  },
  {
    id: "llamacpp",
    label: "llama.cpp server (local)",
    protocol: "openai-compatible",
    baseUrl: "http://localhost:8080/v1",
    requiresKey: false,
    cors: "yes",
  },
  {
    id: "vllm",
    label: "vLLM (local)",
    protocol: "openai-compatible",
    baseUrl: "http://localhost:8000/v1",
    requiresKey: false,
    cors: "unknown",
    note: "Start vLLM with --allowed-origins to permit browser requests.",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    protocol: "openai-compatible",
    baseUrl: "",
    requiresKey: false,
    cors: "unknown",
    note: "Any endpoint exposing /chat/completions. Point the base URL at the path that precedes /chat/completions.",
  },
];

export function getPreset(id: string): ProviderPreset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}
