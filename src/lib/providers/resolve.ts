import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { ProviderConfig } from "@/lib/types";

/** Anthropic refuses browser-origin requests unless this opt-in header is set. */
const ANTHROPIC_BROWSER_HEADER = "anthropic-dangerous-direct-browser-access";

function baseHeaders(config: ProviderConfig): Record<string, string> {
  const headers: Record<string, string> = { ...config.headers };
  if (config.protocol === "anthropic") {
    headers[ANTHROPIC_BROWSER_HEADER] = "true";
  }
  return headers;
}

/** Trailing slashes make some providers 404 on the joined path. */
function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Builds an AI SDK LanguageModel from a stored config. Every provider funnels
 * through one of four factories, chosen purely by `protocol` — adding a preset
 * never requires changing this function.
 */
export function resolveModel(config: ProviderConfig, modelId: string): LanguageModel {
  const baseURL = normalizeBaseUrl(config.baseUrl);
  const apiKey = config.apiKey.trim();
  const headers = baseHeaders(config);

  switch (config.protocol) {
    case "openai": {
      const provider = createOpenAI({ baseURL, apiKey, headers });
      // .chat() targets /chat/completions, which every OpenAI-shaped gateway
      // implements; the default callable would use the Responses API instead.
      return provider.chat(modelId);
    }
    case "anthropic":
      return createAnthropic({ baseURL, apiKey, headers })(modelId);
    case "google":
      return createGoogleGenerativeAI({ baseURL, apiKey, headers })(modelId);
    case "openai-compatible":
      return createOpenAICompatible({
        name: config.presetId,
        baseURL,
        // Local runtimes accept any bearer; sending a placeholder is harmless
        // and keeps servers that require the header from 401-ing.
        apiKey: apiKey || "not-needed",
        headers,
      }).chatModel(modelId);
  }
}

/**
 * Lists models the provider exposes. The AI SDK has no discovery API, so this
 * hits each protocol's native listing endpoint directly.
 */
export async function discoverModels(
  config: ProviderConfig,
  signal?: AbortSignal,
): Promise<string[]> {
  const baseURL = normalizeBaseUrl(config.baseUrl);
  const apiKey = config.apiKey.trim();

  if (config.protocol === "google") {
    const response = await fetch(`${baseURL}/models?key=${encodeURIComponent(apiKey)}`, {
      signal,
      headers: config.headers,
    });
    if (!response.ok) throw await toError(response);
    const data = (await response.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    return (data.models ?? [])
      .filter(
        (model) =>
          !model.supportedGenerationMethods ||
          model.supportedGenerationMethods.includes("generateContent"),
      )
      .map((model) => (model.name ?? "").replace(/^models\//, ""))
      .filter(Boolean)
      .sort();
  }

  if (config.protocol === "anthropic") {
    const response = await fetch(`${baseURL}/models?limit=1000`, {
      signal,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        [ANTHROPIC_BROWSER_HEADER]: "true",
        ...config.headers,
      },
    });
    if (!response.ok) throw await toError(response);
    const data = (await response.json()) as { data?: { id?: string }[] };
    return (data.data ?? []).map((model) => model.id ?? "").filter(Boolean);
  }

  // OpenAI and every OpenAI-compatible gateway expose GET /models.
  const response = await fetch(`${baseURL}/models`, {
    signal,
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...config.headers,
    },
  });
  if (!response.ok) throw await toError(response);
  const data = (await response.json()) as { data?: { id?: string }[] };
  return (data.data ?? [])
    .map((model) => model.id ?? "")
    .filter(Boolean)
    .sort();
}

async function toError(response: Response): Promise<Error> {
  const body = await response.text().catch(() => "");
  let detail = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) detail = parsed.error.message;
  } catch {
    // Non-JSON error body; the truncated text is the best we have.
  }
  return new Error(`${response.status} ${response.statusText}${detail ? ` — ${detail}` : ""}`);
}

/**
 * A failed fetch with no status is almost always CORS or a dead local server,
 * and the browser deliberately hides which. Say so instead of surfacing the
 * bare "Failed to fetch".
 */
export function explainNetworkError(error: unknown, baseUrl: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const isOpaque =
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("Load failed");

  if (!isOpaque) return message;

  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(baseUrl);
  return isLocal
    ? `Could not reach ${baseUrl}. Check the server is running and started with browser origins allowed (e.g. OLLAMA_ORIGINS="*" for Ollama).`
    : `Could not reach ${baseUrl}. This is usually CORS — the provider did not allow a request from this page's origin. Providers that block browser calls need a proxy.`;
}
