import type { MockEntry } from '../mock/types'

export type SessionBranchType = 'spawn' | 'fork' | 'clone'

/** Sidebar tree dot color per branch kind. */
export const BRANCH_DOT_COLORS: Record<SessionBranchType, string> = {
  spawn: '#4f8cff',
  fork: '#e6a23c',
  clone: '#9b59b6',
}

export function branchDotColor(branchType?: SessionBranchType): string {
  return branchType ? BRANCH_DOT_COLORS[branchType] : '#4f8cff'
}

export function isOldEntry(entry: MockEntry): boolean {
  return entry.isOld === true
}
