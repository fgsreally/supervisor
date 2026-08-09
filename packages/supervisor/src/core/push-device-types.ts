export type PushDevicePlatform = "ios" | "android" | "web";

export interface PushDeviceRow {
  id: number;
  device_id: string;
  platform: PushDevicePlatform;
  push_token: string;
  manufacturer_push_token: string | null;
  manufacturer: string | null;
  model: string | null;
  app_version: string | null;
  last_seen: number;
  created_at: number;
  updated_at: number;
}

export interface PushDeviceInput {
  deviceId: string;
  platform: PushDevicePlatform;
  pushToken: string;
  manufacturerPushToken?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  appVersion?: string | null;
}

export interface PushDevicePublic {
  id: number;
  deviceId: string;
  platform: PushDevicePlatform;
  manufacturer: string | null;
  model: string | null;
  appVersion: string | null;
  lastSeen: number;
  createdAt: number;
  updatedAt: number;
}

export function rowToPushDevice(row: PushDeviceRow): PushDevicePublic {
  return {
    id: row.id,
    deviceId: row.device_id,
    platform: row.platform,
    manufacturer: row.manufacturer,
    model: row.model,
    appVersion: row.app_version,
    lastSeen: row.last_seen,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
