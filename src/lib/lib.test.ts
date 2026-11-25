import { generateText, streamText } from "ai";
import { describe, expect, it } from "vite-plus/test";
import { buildModelMessages, deriveTitle } from "./chat-engine";
import { initHighlighter, renderMarkdown } from "./markdown";
import { describeNoModels } from "./providers/availability";
import { duplicateHeaderNames, type HeaderRow, rowsToHeaders } from "./providers/headers";
import { sessionHeaders } from "./providers/presets";
import {
  discoverModels,
  explainNetworkError,
  parseOpenCodeModelId,
  resolveModel,
} from "./providers/resolve";
import type { Message, ProviderConfig } from "./types";

function rows(...pairs: [string, string][]): HeaderRow[] {
  return pairs.map(([name, value], index) => ({ id: String(index), name, value }));
}

function message(partial: Partial<Message>): Message {
  return {
    id: partial.id ?? "m1",
    chatId: "c1",
    role: partial.role ?? "user",
    content: partial.content ?? "",
    attachments: partial.attachments ?? [],
    createdAt: partial.createdAt ?? 0,
    ...partial,
  };
}

describe("deriveTitle", () => {
  it("uses the first line", () => {
    expect(deriveTitle("Hello there\nsecond line")).toBe("Hello there");
  });

  it("truncates long titles", () => {
    const title = deriveTitle("x".repeat(100));
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.endsWith("…")).toBe(true);
  });

  it("falls back for empty input", () => {
    expect(deriveTitle("   ")).toBe("New chat");
  });
});

describe("buildModelMessages", () => {
  it("prepends the system prompt and maps roles", async () => {
    const result = await buildModelMessages(
      [
        message({ id: "1", role: "user", content: "hi" }),
        message({ id: "2", role: "assistant", content: "hello" }),
      ],
      "be terse",
      0,
    );

    expect(result).toEqual([
      { role: "system", content: "be terse" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("omits the system message when the prompt is blank", async () => {
    const result = await buildModelMessages([message({ content: "hi" })], "   ", 0);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
  });

  it("drops failed and empty messages", async () => {
    const result = await buildModelMessages(
      [
        message({ id: "1", content: "kept" }),
        message({ id: "2", content: "boom", error: "429 rate limited" }),
        message({ id: "3", content: "   " }),
      ],
      "",
      0,
    );
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("kept");
  });

  it("applies the context limit to the most recent messages", async () => {
    const history = Array.from({ length: 10 }, (_, index) =>
      message({ id: String(index), content: `m${index}` }),
    );
    const result = await buildModelMessages(history, "", 3);
    expect(result.map((m) => m.content)).toEqual(["m7", "m8", "m9"]);
  });

  it("keeps the system prompt outside the context limit", async () => {
    const history = Array.from({ length: 5 }, (_, index) =>
      message({ id: String(index), content: `m${index}` }),
    );
    const result = await buildModelMessages(history, "sys", 2);
    expect(result[0]).toEqual({ role: "system", content: "sys" });
    expect(result).toHaveLength(3);
  });

  it("inlines text attachments in a named fence", async () => {
    const result = await buildModelMessages(
      [
        message({
          content: "explain this",
          attachments: [
            {
              id: "a1",
              name: "main.ts",
              mediaType: "text/plain",
              size: 10,
              kind: "text",
              text: "const x = 1;",
            },
          ],
        }),
      ],
      "",
      0,
    );

    expect(result[0].content).toBe('<file name="main.ts">\nconst x = 1;\n</file>\n\nexplain this');
  });

  it("emits image parts for image attachments", async () => {
    const result = await buildModelMessages(
      [
        message({
          content: "what is this",
          attachments: [
            {
              id: "a1",
              name: "shot.png",
              mediaType: "image/png",
              size: 4,
              kind: "image",
              blob: new Blob([new Uint8Array([1, 2, 3, 4])], {
                type: "image/png",
              }),
            },
          ],
        }),
      ],
      "",
      0,
    );

    const parts = result[0].content as {
      type: string;
      mediaType?: string;
      image?: Uint8Array;
      text?: string;
    }[];
    expect(parts[0].type).toBe("image");
    expect(parts[0].mediaType).toBe("image/png");
    expect(Array.from(parts[0].image as Uint8Array)).toEqual([1, 2, 3, 4]);
    expect(parts[1]).toEqual({ type: "text", text: "what is this" });
  });
});

describe("explainNetworkError", () => {
  it("explains opaque failures against a remote host as CORS", () => {
    const message = explainNetworkError(
      new TypeError("Failed to fetch"),
      "https://api.example.com/v1",
    );
    expect(message).toContain("CORS");
  });

  it("points at the local server for localhost", () => {
    const message = explainNetworkError(
      new TypeError("Failed to fetch"),
      "http://localhost:11434/v1",
    );
    expect(message).toContain("OLLAMA_ORIGINS");
    expect(message).toContain("opencode service set cors");
    expect(message).not.toContain("CORS");
  });

  it("passes through errors that already say something useful", () => {
    const message = explainNetworkError(
      new Error("401 Unauthorized — invalid api key"),
      "https://api.example.com/v1",
    );
    expect(message).toBe("401 Unauthorized — invalid api key");
  });
});

describe("describeNoModels", () => {
  function provider(partial: Partial<ProviderConfig>): ProviderConfig {
    return {
      id: partial.id ?? "p1",
      presetId: partial.presetId ?? "anthropic",
      label: partial.label ?? "Anthropic",
      protocol: partial.protocol ?? "anthropic",
      baseUrl: partial.baseUrl ?? "https://api.anthropic.com/v1",
      apiKey: partial.apiKey ?? "sk-test",
      headers: partial.headers ?? {},
      enabled: partial.enabled ?? true,
      cachedModels: partial.cachedModels ?? [],
      cachedModelsAt: null,
      createdAt: 0,
      ...partial,
    };
  }

  it("reports an empty provider list", () => {
    expect(describeNoModels([])).toBe("No providers configured yet.");
  });

  it("reports providers that are all switched off", () => {
    expect(describeNoModels([provider({ enabled: false })])).toBe(
      "Every provider is switched off.",
    );
  });

  it("names a provider missing a key the preset requires", () => {
    expect(describeNoModels([provider({ apiKey: "" })])).toBe("Anthropic still needs an API key.");
  });

  it("names a provider missing a base URL", () => {
    expect(
      describeNoModels([provider({ presetId: "custom", label: "Gateway", baseUrl: "" })]),
    ).toBe("Gateway still needs a base URL.");
  });

  it("points a configured but undiscovered provider at Fetch models", () => {
    expect(describeNoModels([provider({ presetId: "custom", label: "Gateway" })])).toContain(
      "Fetch models",
    );
  });

  it("joins several provider names", () => {
    expect(
      describeNoModels([
        provider({ id: "a", label: "One", apiKey: "" }),
        provider({ id: "b", label: "Two", apiKey: "" }),
      ]),
    ).toBe("One and Two still needs an API key.");
  });
});

describe("sessionHeaders", () => {
  it("gives OpenCode Go the chat id as its session", () => {
    expect(sessionHeaders("opencode-go", "chat-1")).toEqual({ "x-opencode-session": "chat-1" });
  });

  it("adds nothing for presets that don't route by session", () => {
    expect(sessionHeaders("openai", "chat-1")).toEqual({});
  });
});

describe("OpenCode server provider", () => {
  const config: ProviderConfig = {
    id: "p-local",
    presetId: "opencode-local",
    label: "OpenCode server (local)",
    protocol: "opencode-server",
    baseUrl: "http://127.0.0.1:49374",
    apiKey: "secret",
    headers: {},
    enabled: true,
    cachedModels: [],
    cachedModelsAt: null,
    createdAt: 0,
  };

  function requestUrl(input: Parameters<typeof fetch>[0]): string {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input.url;
  }

  function stubFetch(handler: (url: string, init: RequestInit | undefined) => Response) {
    const original = globalThis.fetch;
    globalThis.fetch = (async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => handler(requestUrl(input), init)) as typeof fetch;
    return () => {
      globalThis.fetch = original;
    };
  }

  it("splits a namespaced model id", () => {
    expect(parseOpenCodeModelId("opencode-go/glm-5.3")).toEqual({
      providerID: "opencode-go",
      id: "glm-5.3",
    });
  });

  it("rejects an id with no provider prefix", () => {
    expect(() => parseOpenCodeModelId("glm-5.3")).toThrow(/provider prefix/);
  });

  it("discovers chat models with their provider prefix", async () => {
    const restore = stubFetch(
      () =>
        new Response(
          JSON.stringify({
            data: [
              { providerID: "opencode-go", modelID: "glm-5.3", type: "chat", enabled: true },
              { providerID: "opencode", modelID: "zeta", type: "chat", enabled: true },
              { providerID: "opencode-go", modelID: "embed", type: "embedding", enabled: true },
              { providerID: "opencode-go", modelID: "off", type: "chat", enabled: false },
            ],
          }),
          { status: 200 },
        ),
    );
    try {
      expect(await discoverModels(config)).toEqual(["opencode-go/glm-5.3", "opencode/zeta"]);
    } finally {
      restore();
    }
  });

  it("builds the local request with Basic auth and the model ref", async () => {
    let seen: { url: string; body: unknown; auth: string | null } | undefined;
    const restore = stubFetch((url, init) => {
      seen = {
        url,
        body: JSON.parse(typeof init?.body === "string" ? init.body : ""),
        auth: new Headers(init?.headers).get("authorization"),
      };
      return new Response(JSON.stringify({ data: { text: "ok" } }), { status: 200 });
    });
    try {
      const result = await generateText({
        model: resolveModel(config, "opencode-go/glm-5.3"),
        prompt: "Reply with ok",
      });
      expect(result.text).toBe("ok");
      expect(seen).toEqual({
        url: "http://127.0.0.1:49374/api/experimental/generate/text",
        body: {
          prompt: "User: Reply with ok",
          model: { providerID: "opencode-go", id: "glm-5.3" },
        },
        auth: `Basic ${btoa("opencode:secret")}`,
      });
    } finally {
      restore();
    }
  });

  it("streams the whole answer as one delta", async () => {
    const restore = stubFetch(
      () => new Response(JSON.stringify({ data: { text: "whole answer" } }), { status: 200 }),
    );
    try {
      const result = streamText({
        model: resolveModel(config, "opencode-go/glm-5.3"),
        prompt: "Reply with ok",
      });
      let text = "";
      for await (const delta of result.textStream) text += delta;
      expect(text).toBe("whole answer");
    } finally {
      restore();
    }
  });
});

describe("rowsToHeaders", () => {
  it("collapses rows into a record, trimming names", () => {
    expect(
      rowsToHeaders(rows(["X-Title", "aiui"], ["  HTTP-Referer  ", "https://x.test"])),
    ).toEqual({ "X-Title": "aiui", "HTTP-Referer": "https://x.test" });
  });

  it("keeps a half-typed row out of the config instead of failing", () => {
    expect(rowsToHeaders(rows(["", "orphan value"], ["X-Ok", "yes"]))).toEqual({ "X-Ok": "yes" });
  });

  it("drops names fetch would throw on", () => {
    expect(rowsToHeaders(rows(["Bad Name", "v"], ["Also:Bad", "v"], ["Fine", "v"]))).toEqual({
      Fine: "v",
    });
  });

  it("lets the last row win a repeated name", () => {
    expect(rowsToHeaders(rows(["X-Key", "first"], ["X-Key", "second"]))).toEqual({
      "X-Key": "second",
    });
  });

  it("preserves an empty value, which is a legal header", () => {
    expect(rowsToHeaders(rows(["X-Empty", ""]))).toEqual({ "X-Empty": "" });
  });
});

describe("duplicateHeaderNames", () => {
  it("compares case-insensitively, as the transport does", () => {
    expect(duplicateHeaderNames(rows(["X-Key", "a"], ["x-key", "b"]))).toEqual(["X-Key"]);
  });

  it("reports nothing for distinct names", () => {
    expect(duplicateHeaderNames(rows(["A", "1"], ["B", "2"]))).toEqual([]);
  });

  it("ignores blank rows", () => {
    expect(duplicateHeaderNames(rows(["", "1"], ["", "2"]))).toEqual([]);
  });
});

describe("renderMarkdown", () => {
  it("escapes raw HTML from model output", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("wraps fenced code with a language label and copy button", () => {
    const html = renderMarkdown("```ts\nconst x = 1;\n```");
    expect(html).toContain('class="md-code"');
    expect(html).toContain("md-copy");
    expect(html).toContain(">ts<");
  });

  it("marks external links safe", () => {
    const html = renderMarkdown("[link](https://example.com)");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it("highlights known languages once the highlighter loads", async () => {
    await initHighlighter();
    const html = renderMarkdown("```ts\nconst x = 1;\n```");
    // Shiki emits inline colors; the plain fallback has no style attribute.
    expect(html).toContain("shiki");
    expect(html).toContain("style=");
  });

  it("resolves fence aliases to a loaded grammar", async () => {
    await initHighlighter();
    const aliased = renderMarkdown("```js\nconst x = 1;\n```");
    expect(aliased).toContain("style=");
  });

  it("falls back to escaped plain text for unknown languages", () => {
    const html = renderMarkdown("```brainfuck\n+[-<]>\n```");
    expect(html).toContain("md-code");
    expect(html).toContain("+[-&lt;]&gt;");
  });
});
