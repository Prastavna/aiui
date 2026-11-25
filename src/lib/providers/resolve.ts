import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type {
  LanguageModelV4,
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from "@ai-sdk/provider";
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

/** The local server takes Basic auth with a fixed user and the server password. */
function opencodeAuthHeader(password: string): string {
  const bytes = new TextEncoder().encode(`opencode:${password}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

export interface OpenCodeModelRef {
  providerID: string;
  id: string;
}

/**
 * Local model ids are namespaced "providerID/modelID", so one provider can
 * offer Go, Zen and anything else the local server has configured.
 */
export function parseOpenCodeModelId(modelId: string): OpenCodeModelRef {
  const slash = modelId.indexOf("/");
  if (slash <= 0 || slash === modelId.length - 1) {
    throw new Error(
      `Model "${modelId}" needs an OpenCode provider prefix, such as "opencode-go/glm-5.3". Fetch models to pick a valid id.`,
    );
  }
  return { providerID: modelId.slice(0, slash), id: modelId.slice(slash + 1) };
}

const NO_USAGE: LanguageModelV4Usage = {
  inputTokens: {
    total: undefined,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
};

/** The local generate endpoint is text-only; file parts have nowhere to go. */
function assertTextOnly(prompt: LanguageModelV4Prompt): void {
  for (const message of prompt) {
    if (message.role === "system") continue;
    if (message.content.some((part) => part.type === "file")) {
      throw new Error(
        "The local OpenCode endpoint accepts text only. Remove image attachments or use a direct provider.",
      );
    }
  }
}

/** The local endpoint takes one prompt string, so roles become labels. */
function promptToText(prompt: LanguageModelV4Prompt): string {
  const chunks: string[] = [];
  for (const message of prompt) {
    if (message.role === "system") {
      chunks.push(`System: ${message.content}`);
      continue;
    }
    const text = message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (!text) continue;
    if (message.role === "user") chunks.push(`User: ${text}`);
    else if (message.role === "assistant") chunks.push(`Assistant: ${text}`);
  }
  return chunks.join("\n\n");
}

async function generateLocalText(
  config: ProviderConfig,
  modelId: string,
  prompt: LanguageModelV4Prompt,
  signal: AbortSignal | undefined,
  extraHeaders: Record<string, string | undefined> | undefined,
): Promise<string> {
  assertTextOnly(prompt);
  const { providerID, id } = parseOpenCodeModelId(modelId);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: opencodeAuthHeader(config.apiKey.trim()),
    ...config.headers,
  };
  for (const [name, value] of Object.entries(extraHeaders ?? {})) {
    if (value !== undefined) headers[name] = value;
  }

  const response = await fetch(
    `${normalizeBaseUrl(config.baseUrl)}/api/experimental/generate/text`,
    {
      method: "POST",
      signal,
      headers,
      body: JSON.stringify({ prompt: promptToText(prompt), model: { providerID, id } }),
    },
  );
  if (!response.ok) throw await toError(response);
  const data = (await response.json()) as { data?: { text?: string } };
  return data.data?.text ?? "";
}

/**
 * Wraps the local OpenCode server as an AI SDK model. Its generate endpoint
 * returns the whole answer at once, so doStream emits a single text delta.
 */
function createOpenCodeServerModel(config: ProviderConfig, modelId: string): LanguageModelV4 {
  return {
    specificationVersion: "v4",
    provider: "opencode-server",
    modelId,
    supportedUrls: {},
    async doGenerate(options) {
      const text = await generateLocalText(
        config,
        modelId,
        options.prompt,
        options.abortSignal,
        options.headers,
      );
      return {
        content: text ? [{ type: "text", text }] : [],
        finishReason: { unified: "stop", raw: "stop" },
        usage: NO_USAGE,
        warnings: [],
      } satisfies LanguageModelV4GenerateResult;
    },
    async doStream(options) {
      const text = await generateLocalText(
        config,
        modelId,
        options.prompt,
        options.abortSignal,
        options.headers,
      );
      const stream = new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "text-0" });
          if (text) controller.enqueue({ type: "text-delta", id: "text-0", delta: text });
          controller.enqueue({ type: "text-end", id: "text-0" });
          controller.enqueue({
            type: "finish",
            usage: NO_USAGE,
            finishReason: { unified: "stop", raw: "stop" },
          });
          controller.close();
        },
      });
      return { stream };
    },
  };
}

/**
 * Builds an AI SDK LanguageModel from a stored config. Most providers funnel
 * through a factory chosen by `protocol`; the local OpenCode server has its own
 * adapter because it speaks OpenCode's HttpApi rather than an AI wire format.
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
    case "opencode-server":
      return createOpenCodeServerModel(config, modelId);
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

  if (config.protocol === "opencode-server") {
    const response = await fetch(`${baseURL}/api/model`, {
      signal,
      headers: {
        ...(apiKey ? { Authorization: opencodeAuthHeader(apiKey) } : {}),
        ...config.headers,
      },
    });
    if (!response.ok) throw await toError(response);
    const data = (await response.json()) as {
      data?: {
        providerID?: string;
        modelID?: string;
        id?: string;
        type?: string;
        enabled?: boolean;
      }[];
    };
    return (data.data ?? [])
      .filter(
        (model) =>
          Boolean(model.providerID) && (model.type ?? "chat") === "chat" && model.enabled !== false,
      )
      .map((model) => `${model.providerID}/${model.modelID ?? model.id ?? ""}`)
      .filter((id) => !id.endsWith("/"))
      .sort();
  }

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
    const parsed = JSON.parse(body) as {
      error?: { message?: string };
      message?: string;
    };
    if (parsed.error?.message) detail = parsed.error.message;
    else if (parsed.message) detail = parsed.message;
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
    ? `Could not reach ${baseUrl}. Check the server is running and started with browser origins allowed (OLLAMA_ORIGINS="*" for Ollama; opencode service set cors <origin> for OpenCode).`
    : `Could not reach ${baseUrl}. This is usually CORS — the provider did not allow a request from this page's origin. Providers that block browser calls need a proxy.`;
}
