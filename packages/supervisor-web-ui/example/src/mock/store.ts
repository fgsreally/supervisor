import { reactive } from 'vue'
import type { MockSession, MockWorkspace } from './app-data'
import { mockSessions as sessionsSeed, mockWorkspaces } from './app-data'
import type { MockAgent } from './agents'
import { mockAgents as agentsSeed } from './agents'
import type { MockProvider, MockProviderModel } from './providers'
import { createEmptyProviderModel } from './providers'
import { mockProviders as providersSeed } from './providers'
import type { MockResourceItem } from './resources'
import { mockAgentResources as agentResourcesSeed, mockGlobalResources as globalResourcesSeed } from './resources'
import type { MockEntry } from './types'
import { messagesBySessionId as messagesSeed } from './messages'

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

export const mockStore = reactive({
	sessions: clone(sessionsSeed) as MockSession[],
	agents: clone(agentsSeed) as MockAgent[],
	providers: clone(providersSeed) as MockProvider[],
	globalResources: clone(globalResourcesSeed) as MockResourceItem[],
	agentResources: clone(agentResourcesSeed) as Record<string, MockResourceItem[]>,
	messages: clone(messagesSeed) as Record<string, MockEntry[]>,
})

export { mockWorkspaces }
export type { MockWorkspace }

export function getWorkspaceName(workspaceId: string): string {
	return mockWorkspaces.find((w) => w.id === workspaceId)?.name ?? workspaceId
}

// ============ Sessions ============

export function getSessionById(id: string): MockSession | undefined {
	return mockStore.sessions.find((s) => s.id === id)
}

export function getSessionsByAgentId(agentId: string): MockSession[] {
	return mockStore.sessions.filter((s) => s.agentId === agentId && !s.parentId)
}

export function groupSessionsByWorkspace(
	sessions: MockSession[],
): Array<{ workspace: MockWorkspace; sessions: MockSession[] }> {
	return mockWorkspaces
		.map((workspace) => ({
			workspace,
			sessions: sessions.filter((s) => s.workspaceId === workspace.id),
		}))
		.filter((g) => g.sessions.length > 0)
}

export function updateSession(id: string, patch: Partial<MockSession>): void {
	const session = getSessionById(id)
	if (!session) return
	Object.assign(session, patch)
}

export function updateSessionMeta(id: string, patch: Partial<MockSession['meta']>): void {
	const session = getSessionById(id)
	if (!session) return
	Object.assign(session.meta, patch)
}

export function addSession(session: MockSession): void {
	mockStore.sessions.unshift(session)
}

/** Remove session and all descendants; clears stored messages. */
export function deleteSession(sessionId: string): void {
	const ids = new Set<string>()
	function collect(id: string) {
		ids.add(id)
		for (const s of mockStore.sessions) {
			if (s.parentId === id) collect(s.id)
		}
	}
	collect(sessionId)
	mockStore.sessions = mockStore.sessions.filter((s) => !ids.has(s.id))
	for (const id of ids) {
		delete mockStore.messages[id]
	}
}

export function getSessionMessages(sessionId: string): MockEntry[] {
	if (!mockStore.messages[sessionId]) {
		mockStore.messages[sessionId] = []
	}
	return mockStore.messages[sessionId]
}

export function setSessionMessages(sessionId: string, entries: MockEntry[]): void {
	mockStore.messages[sessionId] = entries
}

export function appendSessionMessage(sessionId: string, entry: MockEntry): void {
	getSessionMessages(sessionId).push(entry)
}

export function updateSessionPreview(sessionId: string, text: string): void {
	const session = getSessionById(sessionId)
	if (!session) return
	session.lastMessagePreview = text.length > 80 ? `${text.slice(0, 80)}…` : text
	session.lastActiveAt = new Date().toISOString()
}

export function clearSessionMessages(sessionId: string): void {
	mockStore.messages[sessionId] = []
	const session = getSessionById(sessionId)
	if (session) {
		session.lastMessagePreview = ''
	}
}

export function toggleSessionPinned(sessionId: string, pinned: boolean): void {
	updateSession(sessionId, { pinned })
}

export function toggleSessionMuted(sessionId: string, muted: boolean): void {
	updateSession(sessionId, { muted })
}

// ============ Agents ============

export function getAgentById(id: string): MockAgent | undefined {
	return mockStore.agents.find((a) => a.id === id)
}

export function getAgentsByCategory(): Array<{ label: string; agents: MockAgent[] }> {
	const agentCategories: Record<string, string> = {
		frontend: '前端',
		backend: '后端',
		qa: '测试',
		general: '通用',
	}
	const order = ['frontend', 'backend', 'qa', 'general']
	return order
		.map((cat) => ({
			label: agentCategories[cat] ?? cat,
			agents: mockStore.agents.filter((a) => a.category === cat),
		}))
		.filter((g) => g.agents.length > 0)
}

export function updateAgent(id: string, patch: Partial<MockAgent>): void {
	const agent = getAgentById(id)
	if (!agent) return
	Object.assign(agent, patch)
}

export function addAgent(agent: MockAgent): void {
	mockStore.agents.push(agent)
}

// ============ Providers ============

export function getProviderById(id: string): MockProvider | undefined {
	return mockStore.providers.find((p) => p.id === id)
}

export function getProviderForAgent(agent: MockAgent): MockProvider | undefined {
	return getProviderById(agent.providerId)
}

export function getAgentsUsingProvider(providerId: string): MockAgent[] {
	return mockStore.agents.filter((a) => a.providerId === providerId)
}

export function updateProvider(id: string, patch: Partial<MockProvider>): void {
	const provider = getProviderById(id)
	if (!provider) return
	Object.assign(provider, patch)
}

export function setProviderActiveModel(providerId: string, modelId: string): void {
	const provider = getProviderById(providerId)
	if (!provider) return
	if (!provider.models.some((m) => m.id === modelId)) {
		provider.models.push(createEmptyProviderModel(modelId))
	}
	provider.activeModelId = modelId
}

export function addProvider(provider: MockProvider): void {
	mockStore.providers.push(provider)
}

export function addProviderModel(providerId: string, model: MockProviderModel): void {
	const provider = getProviderById(providerId)
	if (!provider) return
	if (provider.models.some((m) => m.id === model.id)) return
	provider.models.push(model)
}

export function updateProviderModel(providerId: string, modelId: string, patch: Partial<MockProviderModel>): void {
	const provider = getProviderById(providerId)
	if (!provider) return
	const model = provider.models.find((m) => m.id === modelId)
	if (!model) return
	Object.assign(model, patch)
}

export function removeProviderModel(providerId: string, modelId: string): void {
	const provider = getProviderById(providerId)
	if (!provider) return
	provider.models = provider.models.filter((m) => m.id !== modelId)
	if (provider.activeModelId === modelId) {
		provider.activeModelId = provider.models[0]?.id ?? ''
	}
}

// ============ Resources ============

export function getGlobalResources(): MockResourceItem[] {
	return mockStore.globalResources
}

export function getResourcesByKind(kind: MockResourceItem['kind']): MockResourceItem[] {
	return mockStore.globalResources.filter((r) => r.kind === kind)
}

export function getResourceById(id: string): MockResourceItem | undefined {
	const all = [...mockStore.globalResources, ...Object.values(mockStore.agentResources).flat()]
	return all.find((r) => r.id === id)
}

export function getLinkedResourcesForAgent(agentId: string): MockResourceItem[] {
	const agentOwn = mockStore.agentResources[agentId] ?? []
	const inherited = mockStore.globalResources.filter((g) => g.agentIds?.includes(agentId))
	return [...inherited, ...agentOwn]
}

export function updateResource(id: string, patch: Partial<MockResourceItem>): void {
	const resource = getResourceById(id)
	if (!resource) return
	Object.assign(resource, patch)
}

export function updateResourceContent(id: string, content: string, fileId?: string): void {
	const resource = getResourceById(id)
	if (!resource) return
	if (resource.kind === 'skills') {
		if (!fileId) return
		const file = resource.files.find((f) => f.id === fileId)
		if (file) file.content = content
		return
	}
	resource.content = content
}

export function updateSkillFileContent(skillId: string, fileId: string, content: string): void {
	updateResourceContent(skillId, content, fileId)
}
