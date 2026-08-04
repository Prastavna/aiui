# aiui

A minimal, client-only AI chat UI. You bring your own provider base URL and API
key; everything is stored in your browser and requests go straight from the page
to the provider. There is no backend.

## Running it

```bash
vp install
vp dev        # dev server
vp check      # format, lint, type check
vp test       # unit tests
vp run build  # production build to dist/
```

The build is a static bundle using hash routing, so `dist/` can be served from
any static host or opened directly.

## Providers

Every provider funnels through one of four wire protocols, chosen per provider
in settings:

| Protocol            | Built on                    | Covers                                     |
| ------------------- | --------------------------- | ------------------------------------------ |
| `openai`            | `@ai-sdk/openai`            | OpenAI                                     |
| `anthropic`         | `@ai-sdk/anthropic`         | Anthropic                                  |
| `google`            | `@ai-sdk/google`            | Google Gemini                              |
| `openai-compatible` | `@ai-sdk/openai-compatible` | everything else with a `/chat/completions` |

Presets ship for OpenAI, Anthropic, Google, OpenRouter, Groq, DeepSeek, Mistral,
xAI, Together, Fireworks, Cerebras, Perplexity, Nebius, Hyperbolic, Novita,
Ollama, LM Studio, llama.cpp, and vLLM. Anything not listed works through
**Custom (OpenAI-compatible)** by pasting a base URL.

Adding a preset means one entry in `src/lib/providers/presets.ts` — the resolver
in `resolve.ts` never changes, because it dispatches purely on protocol.

## CORS is the real constraint

Calling provider APIs directly from a browser is not the same as calling them
from a server. The provider must send permissive CORS headers or the browser
blocks the request before it leaves the page.

- **OpenAI, Anthropic, Google, OpenRouter, Groq** work directly. Anthropic
  requires the `anthropic-dangerous-direct-browser-access` header, which this app
  sets automatically.
- **Local runtimes** need to be told to accept browser origins — for example
  `OLLAMA_ORIGINS="*"` for Ollama, or `--allowed-origins` for vLLM.
- **Some providers block browser origins entirely.** They cannot be used without
  a proxy, and no client-side change will fix it.

Each provider has a **Test** button in settings that performs a real one-token
request, so you find out which category a provider falls into before you start a
conversation rather than mid-message.

## About API key storage

Keys are stored in `localStorage` in plain text. Any script running on this
origin — including a malicious browser extension — can read them. That is a
property of storing credentials in a browser, not something this app works
around.

Use keys that are scoped, spend-limited, and easy to revoke. Don't use this on a
shared machine. Exports omit keys unless you explicitly opt in.

## Layout

```
src/
  lib/
    types.ts              shared domain types
    db.ts                 IndexedDB: chats, messages, attachment blobs, search
    storage.ts            localStorage: settings and provider configs
    chat-engine.ts        message → AI SDK conversion, streaming
    markdown.ts           markdown-it + Shiki, sanitized rendering
    providers/
      presets.ts          the provider registry
      resolve.ts          config → AI SDK model, discovery, error explanation
  stores/                 Pinia: providers, chats, settings
  components/
    ui/                   shadcn-vue primitives on reka-ui
    chat/                 composer, message list, model picker, params
    settings/             provider cards
  views/                  ChatView, SettingsView
```

## Notes

- Chats, messages, and image attachments live in IndexedDB; settings and
  provider configs live in `localStorage` so they load synchronously at boot.
- Markdown is rendered with `html: false`, so model output can never inject
  markup.
- Shiki uses the JavaScript regex engine and a fixed set of ~20 grammars, which
  keeps Oniguruma's WASM payload out of the bundle. The language list is in
  `src/lib/markdown.ts`.
- Exports are JSON. Image attachments are not included, since blobs don't
  survive JSON serialization.
