import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { initHighlighter } from "./lib/markdown";
import { router } from "./router";
import "./style.css";

createApp(App).use(createPinia()).use(router).mount("#app");

// Warm Shiki in the background; markdown renders unhighlighted until it lands.
void initHighlighter();
