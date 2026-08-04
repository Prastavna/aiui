import MarkdownIt from "markdown-it";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

/**
 * Languages bundled up front. markdown-it's highlight hook is synchronous, so
 * a language that isn't already loaded can't be fetched mid-render — anything
 * outside this list renders as escaped plain text.
 *
 * These are imported individually rather than via shiki's full bundle so the
 * build only carries the grammars listed here.
 */
const LANG_LOADERS = {
  javascript: () => import("@shikijs/langs/javascript"),
  typescript: () => import("@shikijs/langs/typescript"),
  jsx: () => import("@shikijs/langs/jsx"),
  tsx: () => import("@shikijs/langs/tsx"),
  json: () => import("@shikijs/langs/json"),
  html: () => import("@shikijs/langs/html"),
  css: () => import("@shikijs/langs/css"),
  python: () => import("@shikijs/langs/python"),
  bash: () => import("@shikijs/langs/bash"),
  shell: () => import("@shikijs/langs/shellscript"),
  sql: () => import("@shikijs/langs/sql"),
  yaml: () => import("@shikijs/langs/yaml"),
  markdown: () => import("@shikijs/langs/markdown"),
  vue: () => import("@shikijs/langs/vue"),
  rust: () => import("@shikijs/langs/rust"),
  go: () => import("@shikijs/langs/go"),
  java: () => import("@shikijs/langs/java"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  diff: () => import("@shikijs/langs/diff"),
} as const;

/** Fence aliases people actually type, mapped onto the grammars above. */
const LANG_ALIASES: Record<string, keyof typeof LANG_LOADERS> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  zsh: "bash",
  shellscript: "shell",
  yml: "yaml",
  md: "markdown",
  rs: "rust",
  golang: "go",
  "c++": "cpp",
  json5: "json",
  jsonc: "json",
};

const THEMES = { light: "github-light", dark: "github-dark" } as const;

let highlighter: HighlighterCore | null = null;
let highlighterPromise: Promise<HighlighterCore> | null = null;
const loadedLangs = new Set(Object.keys(LANG_LOADERS));

/** Resolves once Shiki is ready; callers re-render to pick up highlighting. */
export function initHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [import("@shikijs/themes/github-light"), import("@shikijs/themes/github-dark")],
    langs: Object.values(LANG_LOADERS).map((load) => load()),
    // The JS regex engine avoids shipping and fetching Oniguruma's ~600kB wasm.
    engine: createJavaScriptRegexEngine(),
  }).then((instance) => {
    highlighter = instance;
    return instance;
  });
  return highlighterPromise;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const md = new MarkdownIt({
  html: false, // Model output is untrusted; never let raw HTML through.
  linkify: true,
  breaks: true,
  highlight(code, lang) {
    const key = lang?.toLowerCase() ?? "";
    const resolved = LANG_ALIASES[key] ?? key;
    const language = loadedLangs.has(resolved) ? resolved : null;

    if (highlighter && language) {
      try {
        return highlighter.codeToHtml(code, {
          lang: language,
          themes: THEMES,
          defaultColor: false,
        });
      } catch {
        // Fall through to the escaped-plaintext path below.
      }
    }
    return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
  },
});

/**
 * Wraps every fenced block in a header carrying the language label and a copy
 * button. The button is wired by delegation in MessageBody.vue.
 */
md.renderer.rules.fence = (tokens, index, options, _env, self) => {
  const token = tokens[index];
  const lang = token.info.trim().split(/\s+/)[0] ?? "";
  const highlighted =
    options.highlight?.(token.content, lang, "") ??
    `<pre class="shiki"><code>${escapeHtml(token.content)}</code></pre>`;

  return `<div class="md-code">
<div class="md-code-header"><span>${escapeHtml(lang || "text")}</span><button type="button" class="md-copy" data-code="${escapeHtml(token.content)}">Copy</button></div>
${highlighted || self.renderToken(tokens, index, options)}
</div>`;
};

/** Opens model-supplied links in a new tab and strips referrer. */
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));

md.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet("target", "_blank");
  tokens[index].attrSet("rel", "noopener noreferrer");
  return defaultLinkOpen(tokens, index, options, env, self);
};

export function renderMarkdown(source: string): string {
  return md.render(source);
}
