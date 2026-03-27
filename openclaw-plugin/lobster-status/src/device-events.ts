import crypto from "node:crypto";
import type { DeviceEvent, DeviceEventName, DeviceEventMeta } from "./types.js";

const ALLOWED_DEVICE_EVENTS = new Set<DeviceEventName>([
  "page_load",
  "visibility_change",
  "pet_click",
  "heartbeat",
]);

const MAX_META_KEYS = 8;
const MAX_STRING_LENGTH = 240;

function truncateString(value: string) {
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
}

function sanitizeMetaValue(value: unknown): string | number | boolean | null {
  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value === null) return null;
  return truncateString(String(value));
}

function sanitizeMeta(meta: unknown): DeviceEventMeta | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return undefined;
  }

  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(meta).slice(0, MAX_META_KEYS)) {
    sanitized[key] = sanitizeMetaValue(value);
  }

  return {
    deviceName: typeof sanitized.deviceName === "string" ? sanitized.deviceName : undefined,
    source: typeof sanitized.source === "string" ? sanitized.source : undefined,
    path: typeof sanitized.path === "string" ? sanitized.path : undefined,
    visible: typeof sanitized.visible === "boolean" ? sanitized.visible : undefined,
  };
}

function normalizeDeviceId(value: unknown) {
  if (typeof value !== "string") return "lobster-desktop";
  const trimmed = value.trim();
  if (!trimmed) return "lobster-desktop";
  return truncateString(trimmed);
}

function normalizeTimestamp(value: unknown, now: number) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  return now;
}

export function isAllowedDeviceEvent(value: unknown): value is DeviceEventName {
  return typeof value === "string" && ALLOWED_DEVICE_EVENTS.has(value as DeviceEventName);
}

export function normalizeDeviceEventPayload(
  body: unknown,
  now = Date.now(),
): { ok: true; event: DeviceEvent } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }

  const eventName = (body as Record<string, unknown>).event;
  if (!isAllowedDeviceEvent(eventName)) {
    return { ok: false, error: "invalid_event" };
  }

  const directMeta: DeviceEventMeta = {
    deviceName: typeof (body as Record<string, unknown>).deviceName === "string"
      ? truncateString(((body as Record<string, unknown>).deviceName as string).trim())
      : undefined,
    source: typeof (body as Record<string, unknown>).source === "string"
      ? truncateString(((body as Record<string, unknown>).source as string).trim())
      : undefined,
    path: typeof (body as Record<string, unknown>).path === "string"
      ? truncateString(((body as Record<string, unknown>).path as string).trim())
      : undefined,
    visible: typeof (body as Record<string, unknown>).visible === "boolean"
      ? (body as Record<string, unknown>).visible as boolean
      : undefined,
  };

  const nestedMeta = sanitizeMeta((body as Record<string, unknown>).meta);

  return {
    ok: true,
    event: {
      id: crypto.randomUUID(),
      deviceId: normalizeDeviceId((body as Record<string, unknown>).deviceId),
      event: eventName,
      ts: normalizeTimestamp((body as Record<string, unknown>).ts, now),
      meta: {
        ...nestedMeta,
        ...Object.fromEntries(Object.entries(directMeta).filter(([, value]) => value !== undefined)),
      },
    },
  };
}

export function isLocalhostAddress(remoteAddress?: string | null) {
  if (!remoteAddress) return false;
  return (
    remoteAddress === "127.0.0.1"
    || remoteAddress === "::1"
    || remoteAddress === "::ffff:127.0.0.1"
  );
}
