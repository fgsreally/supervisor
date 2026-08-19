import { createSign, createPrivateKey, sign } from "node:crypto";

import type { SupervisorSettings } from "../../utils/supervisor-settings.js";
import { decryptApiKey } from "../../utils/encrypt.js";
import { writeLog } from "../../i18n/logs.js";

import type { PushDeviceRow } from "./push-device-types.js";

export interface PushPayload {
  title: string;
  body: string;
  sessionId?: number;
  kind?: "message_complete" | "ask_user" | "live_status";
  data?: Record<string, string>;
}

interface FcmServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cachedFcmToken: { token: string; expiresAt: number } | null = null;

function base64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

async function getFcmAccessToken(account: FcmServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedFcmToken && cachedFcmToken.expiresAt > now + 60) {
    return cachedFcmToken.token;
  }
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  sign.end();
  const signature = sign.sign(account.private_key);
  const jwt = `${unsigned}.${base64Url(signature)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  cachedFcmToken = {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600),
  };
  return json.access_token;
}

function readFcmServiceAccount(settings: SupervisorSettings): FcmServiceAccount | null {
  const jsonEncrypted = settings.pushFcmServiceAccountEncrypted;
  if (!jsonEncrypted) return null;
  try {
    const raw = decryptApiKey(jsonEncrypted);
    const parsed = JSON.parse(raw) as FcmServiceAccount;
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readApnsKey(settings: SupervisorSettings): string | null {
  if (!settings.pushApnsKeyEncrypted) return null;
  try {
    return decryptApiKey(settings.pushApnsKeyEncrypted);
  } catch {
    return null;
  }
}

async function sendFcm(device: PushDeviceRow, payload: PushPayload, settings: SupervisorSettings) {
  const account = readFcmServiceAccount(settings);
  if (!account) return;
  const accessToken = await getFcmAccessToken(account);
  if (!accessToken) return;
  const data: Record<string, string> = {
    ...(payload.data ?? {}),
  };
  if (payload.sessionId !== undefined) data.sessionId = String(payload.sessionId);
  if (payload.kind) data.kind = payload.kind;
  await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: device.push_token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data,
        android: {
          priority: "HIGH",
        },
      },
    }),
  }).catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    writeLog("debug", "runtime.pushFcmFailed", { id: device.device_id, error: detail });
  });
}

async function sendApns(device: PushDeviceRow, payload: PushPayload, settings: SupervisorSettings) {
  const key = readApnsKey(settings);
  const keyId = settings.pushApnsKeyId?.trim();
  const teamId = settings.pushApnsTeamId?.trim();
  const bundleId = settings.pushApnsBundleId?.trim();
  if (!key || !keyId || !teamId || !bundleId) return;

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claim = base64Url(JSON.stringify({ iss: teamId, iat: now }));
  const unsigned = `${header}.${claim}`;
  let jwt: string;
  try {
    const privateKey = createPrivateKey({ key, format: "pem" });
    const signature = sign("sha256", Buffer.from(unsigned), {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    });
    jwt = `${unsigned}.${base64Url(signature)}`;
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    writeLog("debug", "runtime.pushApnsJwtFailed", { error: detail });
    return;
  }

  const host = settings.pushApnsProduction ? "api.push.apple.com" : "api.sandbox.push.apple.com";
  const body = {
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
    },
    sessionId: payload.sessionId,
    kind: payload.kind,
  };
  await fetch(`https://${host}/3/device/${device.push_token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }).catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    writeLog("debug", "runtime.pushApnsFailed", { id: device.device_id, error: detail });
  });
}

/** Remote live status refresh hook — FCM data; client re-posts Live Update notification. */
async function sendAndroidLiveStatusData(
  _device: PushDeviceRow,
  _payload: PushPayload,
  _settings: SupervisorSettings,
) {
  // Reserved: FCM data-only message to refresh Android 16 Live Update when app is backgrounded.
}

export async function sendPushToDevice(
  device: PushDeviceRow,
  payload: PushPayload,
  settings: SupervisorSettings,
): Promise<void> {
  if (device.platform === "android") {
    await sendFcm(device, payload, settings);
    if (payload.kind === "live_status") {
      await sendAndroidLiveStatusData(device, payload, settings);
    }
    return;
  }
  if (device.platform === "ios") {
    await sendApns(device, payload, settings);
  }
}

export function isPushConfigured(settings: SupervisorSettings): boolean {
  return Boolean(
    settings.pushFcmServiceAccountEncrypted ||
    (settings.pushApnsKeyEncrypted &&
      settings.pushApnsKeyId &&
      settings.pushApnsTeamId &&
      settings.pushApnsBundleId),
  );
}
