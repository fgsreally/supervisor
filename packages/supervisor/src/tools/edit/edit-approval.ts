/**
 * Approval mechanism for edit tool requiring user confirmation before applying changes.
 * Mirrors the ask-tool pattern: pending approvals indexed by (sessionId, toolCallId).
 */

export interface PendingEditApproval {
	filePath: string;
	originalContent: string;
	modifiedContent: string;
	diff: string;
	resolve: (approved: boolean) => void;
	reject: (error: Error) => void;
	abortHandler?: () => void;
}

export interface EditApprovalHooks {
	onPending?: () => void;
	onResolved?: () => void;
}

const pendingEditApprovals = new Map<string, Map<string, PendingEditApproval>>();
const hooksBySession = new Map<string, EditApprovalHooks>();

export function setEditApprovalHooks(sessionId: string, hooks?: EditApprovalHooks): void {
	if (hooks) {
		hooksBySession.set(sessionId, hooks);
	} else {
		hooksBySession.delete(sessionId);
	}
}

function cleanupPending(sessionId: string, toolCallId: string): void {
	const sessionMap = pendingEditApprovals.get(sessionId);
	sessionMap?.delete(toolCallId);
	if (sessionMap && sessionMap.size === 0) pendingEditApprovals.delete(sessionId);
	if (!hasPendingEditApprovals(sessionId)) {
		hooksBySession.get(sessionId)?.onResolved?.();
	}
}

export function hasPendingEditApprovals(sessionId: string): boolean {
	const sessionMap = pendingEditApprovals.get(sessionId);
	return !!sessionMap && sessionMap.size > 0;
}

export function getPendingEditApproval(sessionId: string, toolCallId: string): PendingEditApproval | undefined {
	return pendingEditApprovals.get(sessionId)?.get(toolCallId);
}

export function submitEditApproval(sessionId: string, toolCallId: string, approved: boolean): boolean {
	const pending = pendingEditApprovals.get(sessionId)?.get(toolCallId);
	if (!pending) return false;

	pending.resolve(approved);
	cleanupPending(sessionId, toolCallId);
	return true;
}

export function cancelPendingEditApprovals(sessionId: string): void {
	const sessionMap = pendingEditApprovals.get(sessionId);
	if (!sessionMap) return;
	for (const [toolCallId, pending] of sessionMap) {
		pending.reject(new Error("Session aborted"));
		cleanupPending(sessionId, toolCallId);
	}
}

export function storePendingEditApproval(
	sessionId: string,
	toolCallId: string,
	approval: PendingEditApproval,
	hooks?: EditApprovalHooks,
): void {
	if (hooks) hooksBySession.set(sessionId, hooks);
	const sessionMap = pendingEditApprovals.get(sessionId) ?? new Map<string, PendingEditApproval>();
	sessionMap.set(toolCallId, approval);
	pendingEditApprovals.set(sessionId, sessionMap);
	hooksBySession.get(sessionId)?.onPending?.();
}
