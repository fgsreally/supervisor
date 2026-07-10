import { describe, expect, it } from "vitest";
import {
	createSession,
	deleteSession,
	getGlobalResources,
	healthCheck,
	listAgents,
	listProviders,
	listSessions,
} from "@/api";

/**
 * API Integration Tests
 *
 * These tests verify that the API layer correctly communicates
 * with the Supervisor backend.
 *
 * Prerequisites:
 * - Supervisor backend must be running on default port
 * - Or use VITE_API_BASE env var to point to test server
 */

describe("API Integration", () => {
	// Skip unless supervisor is running (SUPERVISOR_INTEGRATION=1 npm run test)
	const itIfBackend = process.env.SUPERVISOR_INTEGRATION === "1" ? it : it.skip;

	itIfBackend("health check should return ok", async () => {
		const result = await healthCheck();
		expect(result.ok).toBe(true);
	});

	itIfBackend("should list sessions", async () => {
		const sessions = await listSessions();
		expect(Array.isArray(sessions)).toBe(true);
	});

	itIfBackend("should create and delete session", async () => {
		const session = await createSession({
			cwd: "/tmp/test",
			meta: { name: "Test Session" },
		});

		expect(session.id).toBeDefined();
		expect(session.status).toBeDefined();

		// Clean up
		await deleteSession(session.id);
	});

	itIfBackend("should list agents", async () => {
		const agents = await listAgents();
		expect(Array.isArray(agents)).toBe(true);
	});

	itIfBackend("should list providers", async () => {
		const providers = await listProviders();
		expect(Array.isArray(providers)).toBe(true);
		// Verify apiKey is stripped
		providers.forEach((p) => {
			expect(p.apiKey).toBeNull();
		});
	});

	itIfBackend("should get global resources", async () => {
		const resources = await getGlobalResources();
		expect(resources).toHaveProperty("skills");
		expect(resources).toHaveProperty("prompts");
		expect(resources).toHaveProperty("extensions");
		expect(Array.isArray(resources.skills)).toBe(true);
		expect(Array.isArray(resources.prompts)).toBe(true);
		expect(Array.isArray(resources.extensions)).toBe(true);
	});
});
