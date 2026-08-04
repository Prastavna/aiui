import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig, lazyPlugins } from "vite-plus";

// Project sites are served from /<repo>/, user sites from /. The Pages workflow
// passes the right one through from actions/configure-pages.
const basePath = process.env.PAGES_BASE_PATH ?? "";

// https://vite.dev/config/
export default defineConfig({
  base: basePath.endsWith("/") ? basePath : `${basePath}/`,
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: lazyPlugins(() => [vue(), tailwindcss()]),
});
