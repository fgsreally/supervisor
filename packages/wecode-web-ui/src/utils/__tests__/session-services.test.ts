import { describe, expect, it } from "vitest";
import { parseSessionServicesFromMeta } from "../session-services";

describe("parseSessionServicesFromMeta", () => {
  it("derives active state without persisting status", () => {
    const services = parseSessionServicesFromMeta({
      services: {
        startCommand: "vite --port ${PORT1}",
        services: [{ name: "web", port: 4417, jobId: "job-1", pid: 30680 }],
        views: [{ name: "Home", service: "web", port: 4417, path: "/" }],
      },
    });

    expect(services?.status).toBe("active");
    expect(services?.views).toEqual([{ name: "Home", service: "web", port: 4417, path: "/" }]);
  });

  it("derives idle state for stopped registrations without status", () => {
    const services = parseSessionServicesFromMeta({
      services: {
        startCommand: "vite --port ${PORT1}",
        services: [{ name: "web", port: 4417, pid: null }],
        views: [{ name: "Home", service: "web", port: 4417, path: "/" }],
      },
    });

    expect(services?.status).toBe("idle");
    expect(services?.views).toHaveLength(1);
  });
});
