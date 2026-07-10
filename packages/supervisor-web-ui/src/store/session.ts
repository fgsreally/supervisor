import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { Session } from "@/api";
import * as api from "@/api";

/**
 * @deprecated Use useSessionStore from "@/store" instead
 * This file is kept for backward compatibility
 */
export const useSessionStore = defineStore("session", () => {
	const sessions = ref<Session[]>([]);
	const loading = ref(false);

	const fetchSessions = async () => {
		loading.value = true;
		try {
			sessions.value = await api.listSessions();
		} finally {
			loading.value = false;
		}
	};

	// Group by workspace (cwd)
	const groupedSessions = computed(() => {
		const groups: Record<string, Session[]> = {};
		sessions.value.forEach((s) => {
			const cwd = s.cwd || "Unknown Workspace";
			if (!groups[cwd]) groups[cwd] = [];
			groups[cwd].push(s);
		});
		return groups;
	});

	// Build tree to show main agent and subagents
	const sessionTree = computed(() => {
		const map = new Map<string, Session & { children: any[] }>();
		const roots: any[] = [];

		sessions.value.forEach((s) => {
			map.set(s.id, { ...s, children: [] });
		});

		sessions.value.forEach((s) => {
			if (s.parentId && map.has(s.parentId)) {
				map.get(s.parentId)!.children.push(map.get(s.id));
			} else {
				roots.push(map.get(s.id));
			}
		});

		return roots;
	});

	return {
		sessions,
		loading,
		fetchSessions,
		groupedSessions,
		sessionTree,
	};
});
