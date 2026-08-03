import { reactive } from "vue";

const STORAGE_KEY = "pi-supervisor:view-preferences:v1";

export interface ViewPreferences {
  projectOrder: string[];
  pinnedSessionIds: string[];
  mutedSessionIds: string[];
  unreadBySession: Record<string, number>;
  collapseExternalAgentDetails: boolean;
  /** DOM particle dissolve / assemble on list remove & restore. */
  advancedAnimations: boolean;
}

const defaults: ViewPreferences = {
  projectOrder: [],
  pinnedSessionIds: [],
  mutedSessionIds: [],
  unreadBySession: {},
  collapseExternalAgentDetails: true,
  advancedAnimations: false,
};

function load(): ViewPreferences {
  if (typeof localStorage === "undefined") return { ...defaults };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return { ...defaults };
  }
}

export const viewPreferences = reactive<ViewPreferences>(load());

export function saveViewPreferences(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(viewPreferences));
}

export function sortByProjectPreference<T extends { id: string }>(projects: T[]): T[] {
  const rank = new Map(viewPreferences.projectOrder.map((id, index) => [id, index]));
  return [...projects].sort(
    (left, right) =>
      (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function setProjectOrder(ids: string[]): void {
  viewPreferences.projectOrder = [...ids];
  saveViewPreferences();
}

export function setSessionViewFlag(
  field: "pinnedSessionIds" | "mutedSessionIds",
  sessionId: string,
  enabled: boolean,
): void {
  const next = new Set(viewPreferences[field]);
  if (enabled) next.add(sessionId);
  else next.delete(sessionId);
  viewPreferences[field] = [...next];
  saveViewPreferences();
}
