import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { SupervisorDb } from "../src/db/db.js";

describe("push_devices", () => {
  it("upserts and lists devices", () => {
    const tmpRoot = join(process.cwd(), ".tmp-push-devices-test", randomUUID());
    mkdirSync(tmpRoot, { recursive: true });
    const dbPath = join(tmpRoot, "test.db");
    const db = new SupervisorDb(dbPath);
    const first = db.upsertPushDevice({
      deviceId: "device-a",
      platform: "android",
      pushToken: "token-1",
      manufacturer: "OPPO",
    });
    expect(first.device_id).toBe("device-a");
    const second = db.upsertPushDevice({
      deviceId: "device-a",
      platform: "android",
      pushToken: "token-2",
      manufacturerPushToken: "oppo-reg-1",
      manufacturer: "OPPO",
    });
    expect(second.push_token).toBe("token-2");
    expect(second.manufacturer_push_token).toBe("oppo-reg-1");
    expect(db.listPushDevices()).toHaveLength(1);
    expect(db.deletePushDevice("device-a")).toBe(true);
    expect(db.listPushDevices()).toHaveLength(0);
  });
});
