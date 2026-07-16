import { createRouter, createWebHistory, type RouteLocationNormalized } from "vue-router";

export type AppRouteTab = "chat" | "contacts" | "providers" | "resources" | "settings" | "search";

export function tabFromRoute(route: RouteLocationNormalized): AppRouteTab {
  const seg = route.path.split("/").filter(Boolean)[0];
  if (
    seg === "contacts" ||
    seg === "providers" ||
    seg === "resources" ||
    seg === "settings" ||
    seg === "search"
  ) {
    return seg;
  }
  return "chat";
}

export function idFromRoute(route: RouteLocationNormalized): string | undefined {
  const parts = route.path.split("/").filter(Boolean);
  return parts[1] || undefined;
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/chat" },
    { path: "/chat/:sessionId?", name: "chat", component: { template: "<div />" } },
    { path: "/contacts/:agentId?", name: "contacts", component: { template: "<div />" } },
    { path: "/providers/:providerId?", name: "providers", component: { template: "<div />" } },
    { path: "/resources/:resourceId?", name: "resources", component: { template: "<div />" } },
    { path: "/settings", name: "settings", component: { template: "<div />" } },
    { path: "/search", name: "search", component: { template: "<div />" } },
  ],
});

export default router;
