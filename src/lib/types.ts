/**
 * Wire protocol a provider speaks. This is the only axis that decides which
 * AI SDK factory builds the model, so adding a provider preset never means
 * touching the resolver.
 */
export type Protocol = "openai" | "anthropic" | "google" | "openai-compatible";

export interface ProviderConfig {
  id: string;
  /** Preset id this was created from, or "custom". Drives the icon and docs link. */
  presetId: string;
  /** User-facing name, defaults to the preset label but is editable. */
  label: string;
  protocol: Protocol;
  baseUrl: string;
  apiKey: string;
  /** Extra headers merged into every request (e.g. OpenRouter attribution). */
  headers: Record<string, string>;
  enabled: boolean;
  /** Model ids from the last successful discovery, used to seed the picker. */
  cachedModels: string[];
  cachedModelsAt: number | null;
  createdAt: number;
}

/** A provider + model pair. Chats store this so history survives config edits. */
export interface ModelRef {
  providerId: string;
  modelId: string;
}

export interface GenerationParams {
  temperature: number | null;
  maxOutputTokens: number | null;
  topP: number | null;
  systemPrompt: string;
}

export interface Attachment {
  id: string;
  name: string;
  /** MIME type; anything starting with image/ renders as a thumbnail. */
  mediaType: string;
  size: number;
  /** Images are stored as blobs; text files keep their decoded contents. */
  kind: "image" | "text";
  blob?: Blob;
  text?: string;
}

export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  /** Present on assistant messages from models that emit reasoning. */
  reasoning?: string;
  attachments: Attachment[];
  createdAt: number;
  /** Set when generation failed; the message is kept so the user can retry. */
  error?: string;
  /** Which model produced this, for the per-message footer. */
  model?: ModelRef;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: ModelRef | null;
  /** Per-chat overrides; null fields fall back to global defaults. */
  params: Partial<GenerationParams>;
}

export interface AppSettings {
  theme: "light" | "dark" | "system";
  defaultModel: ModelRef | null;
  defaults: GenerationParams;
  sendOnEnter: boolean;
  /** Number of prior messages sent as context; 0 means the whole chat. */
  contextLimit: number;
}

export interface ExportBundle {
  version: 1;
  exportedAt: number;
  chats: Chat[];
  messages: Message[];
  /** Provider configs are exported without keys unless explicitly included. */
  providers: ProviderConfig[];
  settings: AppSettings;
}
