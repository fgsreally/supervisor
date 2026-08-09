import type { SupervisorDb } from "../db/db.js";
import { readSupervisorSettings } from "../utils/supervisor-settings.js";

import { sendPushToDevice, type PushPayload } from "./push-gateway.js";
import type { PushDeviceInput } from "./push-device-types.js";
import { rowToPushDevice } from "./push-device-types.js";
import type { PushDeviceRow } from "./push-device-types.js";

export class PushDeviceRegistry {
  constructor(private readonly db: SupervisorDb) {}

  upsert(input: PushDeviceInput) {
    return this.db.upsertPushDevice(input);
  }

  remove(deviceId: string): boolean {
    return this.db.deletePushDevice(deviceId);
  }

  list() {
    return this.db.listPushDevices().map(rowToPushDevice);
  }

  touch(deviceId: string) {
    this.db.touchPushDevice(deviceId);
  }
}

export class PushNotificationDispatcher {
  constructor(
    private readonly db: SupervisorDb,
    private readonly registry: PushDeviceRegistry,
  ) {}

  async notifyAll(payload: PushPayload): Promise<void> {
    const settings = readSupervisorSettings();
    const devices = this.db.listPushDevices();
    if (devices.length === 0) return;
    await Promise.all(devices.map((device) => sendPushToDevice(device, payload, settings)));
  }

  async notifySession(sessionId: number, payload: Omit<PushPayload, "sessionId">): Promise<void> {
    const session = this.db.get(sessionId);
    if (!session) return;
    if (session.muted) return;
    const title = session.title?.trim() || `Session #${sessionId}`;
    await this.notifyAll({
      ...payload,
      sessionId,
      title: payload.title || title,
    });
  }
}

export function attachPushDispatcher(
  db: SupervisorDb,
  onEvent: (listener: (sessionId: number, event: unknown) => void) => () => void,
): PushNotificationDispatcher {
  const registry = new PushDeviceRegistry(db);
  const dispatcher = new PushNotificationDispatcher(db, registry);

  onEvent((sessionId, event) => {
    void handleSessionEventForPush(db, dispatcher, sessionId, event).catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      console.debug(`push dispatch failed [${sessionId}]:`, detail);
    });
  });

  return dispatcher;
}

async function handleSessionEventForPush(
  db: SupervisorDb,
  dispatcher: PushNotificationDispatcher,
  sessionId: number,
  event: unknown,
): Promise<void> {
  if (!event || typeof event !== "object") return;
  const typed = event as { type?: string; toolName?: string; args?: Record<string, unknown> };

  if (typed.type === "agent_end") {
    await dispatcher.notifySession(sessionId, {
      kind: "message_complete",
      title: "",
      body: "新消息已完成",
    });
    return;
  }

  if (typed.type === "tool_execution_start" && typed.toolName === "ask") {
    const prompt =
      typeof typed.args?.prompt === "string"
        ? typed.args.prompt
        : typeof typed.args?.question === "string"
          ? typed.args.question
          : "请在聊天中选择一项并确认";
    await dispatcher.notifySession(sessionId, {
      kind: "ask_user",
      title: "",
      body: `请选择：${prompt.slice(0, 120)}`,
    });
  }

  if (typed.type === "agent_start") {
    const session = db.get(sessionId);
    const title = session?.title?.trim() || `Session #${sessionId}`;
    await dispatcher.notifySession(sessionId, {
      kind: "live_status",
      title,
      body: "思考中",
      data: { phase: "thinking" },
    });
  }
}

export type { PushDeviceRow };
