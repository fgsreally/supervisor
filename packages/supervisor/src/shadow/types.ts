export interface ShadowSecurityFinding {
	severity: string;
	title: string;
	detail?: string;
}

export interface ShadowProtocolResult {
	memory?: {
		append?: string;
		replace?: string | null;
	};
	security?: {
		findings?: ShadowSecurityFinding[];
	};
	parent?: {
		message?: string;
		/** Higher level = more urgent. >= 90 interrupts the parent turn; otherwise queued. */
		level?: number;
	};
}

export { DEFAULT_PARENT_MESSAGE_LEVEL } from "../core/session-input-queue.js";
