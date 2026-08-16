import { createRouter, createWebHistory, type RouteLocationNormalized } from "vue-router";
import { handleHotUpdate, routes } from "vue-router/auto-routes";

export type AppRouteTab =
  | "chat"
  | "todo"
  | "dashboard"
  | "contacts"
  | "providers"
  | "resources"
  | "settings";

export function tabFromRoute(route: Pick<RouteLocationNormalized, "path">): AppRouteTab {
  const seg = route.path.split("/").filter(Boolean)[0];
  if (seg === "active-ui") return "chat";
  if (
    seg === "todo" ||
    seg === "dashboard" ||
    seg === "contacts" ||
    seg === "providers" ||
    seg === "resources" ||
    seg === "settings"
  ) {
    return seg;
  }
  if (seg === "chat") return "chat";
  return "chat";
}

export function idFromRoute(route: Pick<RouteLocationNormalized, "path">): string | undefined {
  const parts = route.path.split("/").filter(Boolean);
  if (parts[0] === "settings") return undefined;
  if (parts[0] === "contacts" && parts[1] === "new") return undefined;
  if (parts[0] === "providers" && parts[1] === "new") return undefined;
  return parts[1] || undefined;
}

export function modelIdFromRoute(route: RouteLocationNormalized): string | undefined {
  const value = (route.params as Record<string, unknown>).modelId;
  return typeof value === "string" ? value : undefined;
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/chat" },
    { path: "/home", redirect: "/dashboard" },
    { path: "/active-ui", redirect: "/chat" },
    ...routes,
  ],
});

if (import.meta.hot) {
  handleHotUpdate(router);
}

export default router;
