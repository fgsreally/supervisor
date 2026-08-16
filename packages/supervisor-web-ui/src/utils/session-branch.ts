import type { ChatEntry } from "@/types/chat-entry";

export type SessionBranchType = "subagent" | "fork" | "btw";

/** Sidebar tree dot color per branch kind. */
export const BRANCH_DOT_COLORS: Record<SessionBranchType, string> = {
  subagent: "#4f8cff",
  fork: "#e6a23c",
  btw: "#07c160",
};

export const BRANCH_LABELS: Record<SessionBranchType, string> = {
  subagent: "子代理",
  fork: "分叉",
  btw: "顺便问",
};

export function branchDotColor(branchType?: SessionBranchType): string {
  return branchType ? BRANCH_DOT_COLORS[branchType] : "#4f8cff";
}

export function isOldEntry(entry: ChatEntry): boolean {
  return entry.isOld === true;
}
