import { type LanguageModel, type ModelMessage, streamText } from "ai";
import type { GenerationParams, Message } from "./types";

/** Chunks handed back to the store as the response streams in. */
export interface StreamHandlers {
  onText: (delta: string) => void;
  onReasoning: (delta: string) => void;
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Converts stored messages into the AI SDK's wire format.
 *
 * Image attachments become image parts (vision models read them directly);
 * text attachments are inlined into the prompt with a filename fence, which
 * works on every model rather than only those accepting file parts.
 */
export async function buildModelMessages(
  messages: Message[],
  systemPrompt: string,
  contextLimit: number,
): Promise<ModelMessage[]> {
  const usable = messages.filter((m) => !m.error && m.content.trim().length > 0);
  const windowed = contextLimit > 0 ? usable.slice(-contextLimit) : usable;

  const result: ModelMessage[] = [];
  if (systemPrompt.trim()) {
    result.push({ role: "system", content: systemPrompt.trim() });
  }

  for (const message of windowed) {
    if (message.role === "system") continue;

    if (message.role === "assistant") {
      result.push({ role: "assistant", content: message.content });
      continue;
    }

    const images = message.attachments.filter((a) => a.kind === "image" && a.blob);
    const texts = message.attachments.filter((a) => a.kind === "text" && a.text);

    const body = texts.length
      ? [
          ...texts.map((a) => `<file name="${a.name}">\n${a.text ?? ""}\n</file>`),
          message.content,
        ].join("\n\n")
      : message.content;

    if (!images.length) {
      result.push({ role: "user", content: body });
      continue;
    }

    result.push({
      role: "user",
      content: [
        ...(await Promise.all(
          images.map(async (a) => ({
            type: "image" as const,
            image: await blobToBytes(a.blob as Blob),
            mediaType: a.mediaType,
          })),
        )),
        { type: "text" as const, text: body },
      ],
    });
  }

  return result;
}

/**
 * Streams one assistant turn. Resolves with the final text and reasoning;
 * throws on failure so the caller can persist the error onto the message.
 */
export async function streamAssistant(options: {
  model: LanguageModel;
  messages: ModelMessage[];
  params: GenerationParams;
  signal: AbortSignal;
  handlers: StreamHandlers;
  /** Per-request headers, such as a provider's session id. */
  headers?: Record<string, string>;
}): Promise<{ text: string; reasoning: string }> {
  const { model, messages, params, signal, handlers, headers } = options;

  const result = streamText({
    model,
    messages,
    abortSignal: signal,
    ...(headers && Object.keys(headers).length > 0 && { headers }),
    ...(params.temperature !== null && { temperature: params.temperature }),
    ...(params.topP !== null && { topP: params.topP }),
    ...(params.maxOutputTokens !== null && {
      maxOutputTokens: params.maxOutputTokens,
    }),
  });

  let text = "";
  let reasoning = "";

  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta":
        text += part.text;
        handlers.onText(part.text);
        break;
      case "reasoning-delta":
        reasoning += part.text;
        handlers.onReasoning(part.text);
        break;
      case "error":
        throw part.error instanceof Error ? part.error : new Error(String(part.error));
      default:
        break;
    }
  }

  return { text, reasoning };
}

/** First line of the opening message, trimmed to something sidebar-sized. */
export function deriveTitle(text: string): string {
  const line = text.trim().split("\n")[0]?.trim() ?? "";
  if (!line) return "New chat";
  return line.length > 60 ? `${line.slice(0, 60).trimEnd()}…` : line;
}
