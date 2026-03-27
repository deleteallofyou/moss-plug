import type {
  DevicePresence,
  LobsterStatusDevicePayload,
  LobsterStatusEventPayload,
  LobsterStatusPayload,
  PersistedPluginState,
  RuntimeSnapshot,
} from "./types.js";

function toIso(ts: number) {
  return new Date(ts).toISOString();
}

function formatDevice(device: DevicePresence | null): LobsterStatusDevicePayload | null {
  if (!device) return null;
  return {
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    source: device.source,
    visible: device.visible,
    lastPath: device.lastPath,
    lastSeenAt: toIso(device.lastSeenAt),
    lastEvent: device.lastEvent,
  };
}

function formatEvent(event: PersistedPluginState["recentDeviceEvents"][number]): LobsterStatusEventPayload {
  return {
    id: event.id,
    deviceId: event.deviceId,
    event: event.event,
    ts: toIso(event.ts),
    meta: event.meta,
  };
}

function deriveCoreState(
  snapshot: RuntimeSnapshot | null,
  cfg: { thinkingTtlMs: number; replyingTtlMs: number },
) {
  const now = Date.now();

  if (!snapshot) {
    return {
      state: "idle",
      mood: "calm",
      title: "空闲中",
      message: "我在桌面待命。",
      updatedAt: toIso(now),
      ageMs: 0,
      lastEvent: "gateway:startup",
    } as const;
  }

  const ageMs = Math.max(0, now - snapshot.ts);

  if (snapshot.lastEvent === "command:stop") {
    return {
      state: "sleeping",
      mood: "sleepy",
      title: "休眠中",
      message: "我已进入静默状态。",
      updatedAt: toIso(snapshot.ts),
      ageMs,
      lastEvent: snapshot.lastEvent,
    } as const;
  }

  if (snapshot.lastEvent === "message:sent" && ageMs < cfg.replyingTtlMs) {
    return {
      state: "replying",
      mood: "bright",
      title: "回复中",
      message: "刚刚完成回复，正在回到待命状态。",
      updatedAt: toIso(snapshot.ts),
      ageMs,
      lastEvent: snapshot.lastEvent,
    } as const;
  }

  if (snapshot.lastEvent === "message:received" && ageMs < cfg.thinkingTtlMs) {
    return {
      state: "thinking",
      mood: "focused",
      title: "思考中",
      message: "收到新消息，正在思考怎么回复。",
      updatedAt: toIso(snapshot.ts),
      ageMs,
      lastEvent: snapshot.lastEvent,
    } as const;
  }

  return {
    state: "idle",
    mood: "calm",
    title: "空闲中",
    message: "我在桌面待命。",
    updatedAt: toIso(snapshot.ts),
    ageMs,
    lastEvent: snapshot.lastEvent,
  } as const;
}

export function deriveStatus(
  state: PersistedPluginState,
  cfg: {
    thinkingTtlMs: number;
    replyingTtlMs: number;
    deviceName?: string;
    streamPath: string;
    deviceEventPath: string;
    enableSse: boolean;
  },
): LobsterStatusPayload {
  const core = deriveCoreState(state.runtimeSnapshot, cfg);
  const devices = Object.values(state.devices)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .map((device) => formatDevice(device) as LobsterStatusDevicePayload);
  const recentDeviceEvents = [...state.recentDeviceEvents]
    .sort((a, b) => b.ts - a.ts)
    .map(formatEvent);

  return {
    version: 2,
    online: true,
    state: core.state,
    mood: core.mood,
    title: core.title,
    message: core.message,
    updatedAt: core.updatedAt,
    ageMs: core.ageMs,
    lastEvent: core.lastEvent,
    deviceName: cfg.deviceName,
    runtimeSnapshot: state.runtimeSnapshot,
    devices,
    recentDeviceEvents,
    activeScene: state.activeScene,
    deviceCount: devices.length,
    device: devices[0] ?? null,
    lastDeviceEvent: recentDeviceEvents[0] ?? null,
    streamPath: cfg.streamPath,
    deviceEventPath: cfg.deviceEventPath,
    sseEnabled: cfg.enableSse,
  };
}
