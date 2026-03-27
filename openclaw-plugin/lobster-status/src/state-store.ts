import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  ActiveScene,
  DeviceEvent,
  DevicePresence,
  PersistedPluginState,
  RuntimeSnapshot,
} from "./types.js";

function createDefaultState(): PersistedPluginState {
  return {
    runtimeSnapshot: null,
    devices: {},
    recentDeviceEvents: [],
    activeScene: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRuntimeSnapshot(value: unknown): RuntimeSnapshot | null {
  if (!isRecord(value)) return null;
  if (typeof value.lastEvent !== "string") return null;
  if (typeof value.ts !== "number" || !Number.isFinite(value.ts)) return null;

  return {
    lastEvent: value.lastEvent as RuntimeSnapshot["lastEvent"],
    ts: value.ts,
    source: typeof value.source === "string" ? value.source : undefined,
    channelId: typeof value.channelId === "string" ? value.channelId : undefined,
    conversationId: typeof value.conversationId === "string" ? value.conversationId : undefined,
  };
}

function normalizeDevicePresence(value: unknown, fallbackDeviceId?: string): DevicePresence | null {
  if (!isRecord(value)) return null;

  const deviceId = typeof value.deviceId === "string" ? value.deviceId : fallbackDeviceId;
  if (!deviceId) return null;
  if (typeof value.lastSeenAt !== "number" || !Number.isFinite(value.lastSeenAt)) return null;
  if (typeof value.lastEvent !== "string") return null;

  return {
    deviceId,
    deviceName: typeof value.deviceName === "string" ? value.deviceName : undefined,
    source: typeof value.source === "string" ? value.source : undefined,
    visible: typeof value.visible === "boolean" ? value.visible : undefined,
    lastPath: typeof value.lastPath === "string" ? value.lastPath : undefined,
    lastSeenAt: value.lastSeenAt,
    lastEvent: value.lastEvent as DevicePresence["lastEvent"],
  };
}

function normalizeDeviceEvent(value: unknown): DeviceEvent | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string") return null;
  if (typeof value.deviceId !== "string") return null;
  if (typeof value.event !== "string") return null;
  if (typeof value.ts !== "number" || !Number.isFinite(value.ts)) return null;

  return {
    id: value.id,
    deviceId: value.deviceId,
    event: value.event as DeviceEvent["event"],
    ts: value.ts,
    meta: isRecord(value.meta)
      ? {
          deviceName: typeof value.meta.deviceName === "string" ? value.meta.deviceName : undefined,
          source: typeof value.meta.source === "string" ? value.meta.source : undefined,
          path: typeof value.meta.path === "string" ? value.meta.path : undefined,
          visible: typeof value.meta.visible === "boolean" ? value.meta.visible : undefined,
        }
      : undefined,
  };
}

function normalizeActiveScene(value: unknown): ActiveScene | null {
  if (!isRecord(value)) return null;
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    label: typeof value.label === "string" ? value.label : undefined,
  };
}

function normalizeState(value: unknown): PersistedPluginState {
  if (!isRecord(value)) return createDefaultState();

  const runtimeSnapshot = normalizeRuntimeSnapshot(value.runtimeSnapshot);
  const devices: Record<string, DevicePresence> = {};
  if (isRecord(value.devices)) {
    for (const [deviceId, entry] of Object.entries(value.devices)) {
      const normalized = normalizeDevicePresence(entry, deviceId);
      if (normalized) {
        devices[deviceId] = normalized;
      }
    }
  }

  const recentDeviceEvents = Array.isArray(value.recentDeviceEvents)
    ? value.recentDeviceEvents.map(normalizeDeviceEvent).filter((entry): entry is DeviceEvent => !!entry)
    : [];

  return {
    runtimeSnapshot,
    devices,
    recentDeviceEvents,
    activeScene: normalizeActiveScene(value.activeScene),
  };
}

function migrateLegacyState(value: unknown): PersistedPluginState {
  const legacySnapshot = normalizeRuntimeSnapshot(value);
  if (!legacySnapshot) {
    return createDefaultState();
  }

  return {
    runtimeSnapshot: legacySnapshot,
    devices: {},
    recentDeviceEvents: [],
    activeScene: null,
  };
}

export class StateStore {
  private state: PersistedPluginState = createDefaultState();

  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || path.join(os.homedir(), ".openclaw", "lobster-status", "state.json");
    this.load();
  }

  private ensureDir() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  private load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.state = createDefaultState();
        return;
      }

      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      this.state = isRecord(parsed) && "runtimeSnapshot" in parsed
        ? normalizeState(parsed)
        : migrateLegacyState(parsed);
    } catch {
      this.state = createDefaultState();
    }
  }

  private persist() {
    try {
      this.ensureDir();
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
    } catch {
      // ignore local persistence errors
    }
  }

  getState(): PersistedPluginState {
    return JSON.parse(JSON.stringify(this.state));
  }

  setRuntimeSnapshot(snapshot: RuntimeSnapshot) {
    this.state.runtimeSnapshot = { ...snapshot };
    this.persist();
  }

  addDeviceEvent(event: DeviceEvent, queueLimit = 100) {
    this.state.recentDeviceEvents.push({
      ...event,
      meta: event.meta ? { ...event.meta } : undefined,
    });

    if (this.state.recentDeviceEvents.length > queueLimit) {
      this.state.recentDeviceEvents = this.state.recentDeviceEvents.slice(-queueLimit);
    }

    const existing = this.state.devices[event.deviceId];
    this.state.devices[event.deviceId] = {
      deviceId: event.deviceId,
      deviceName: event.meta?.deviceName ?? existing?.deviceName,
      source: event.meta?.source ?? existing?.source,
      visible: typeof event.meta?.visible === "boolean" ? event.meta.visible : existing?.visible,
      lastPath: event.meta?.path ?? existing?.lastPath,
      lastSeenAt: event.ts,
      lastEvent: event.event,
    };

    this.persist();
  }

  setActiveScene(scene: ActiveScene | null) {
    this.state.activeScene = scene ? { ...scene } : null;
    this.persist();
  }
}
