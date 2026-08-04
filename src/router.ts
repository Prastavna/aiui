import { createRouter, createWebHashHistory } from "vue-router";
import ChatView from "@/views/ChatView.vue";
import SettingsView from "@/views/SettingsView.vue";

/**
 * Hash history so the built app works from any static host or a file:// open
 * without server rewrite rules — this is a client-only app.
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "home", component: ChatView },
    // No props: ChatView reads the id from the route itself, and passing it
    // would land in $attrs — the view renders a fragment with no root to
    // inherit onto — which Vue warns about.
    { path: "/chat/:id", name: "chat", component: ChatView },
    { path: "/settings", name: "settings", component: SettingsView },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});
