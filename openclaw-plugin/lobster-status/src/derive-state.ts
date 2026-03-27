import type { LobsterSnapshot, LobsterStatusPayload } from "./types.js";

export function deriveStatus(
  snapshot: LobsterSnapshot | null,
  cfg: {
    thinkingTtlMs: number;
    replyingTtlMs: number;
    deviceName?: string;
  },
): LobsterStatusPayload {
  const now = Date.now();

  if (!snapshot) {
    return {
      version: 1,
      online: true,
      state: "idle",
      mood: "calm",
      title: "空闲中",
      message: "我在桌面待命。",
      updatedAt: new Date(now).toISOString(),
      ageMs: 0,
      lastEvent: "gateway:startup",
      deviceName: cfg.deviceName,
    };
  }

  const ageMs = now - snapshot.ts;

  if (snapshot.lastEvent === "command:stop") {
    return {
      version: 1,
      online: true,
      state: "sleeping",
      mood: "sleepy",
      title: "休眠中",
      message: "我已进入静默状态。",
      updatedAt: new Date(snapshot.ts).toISOString(),
      ageMs,
      lastEvent: snapshot.lastEvent,
      deviceName: cfg.deviceName,
    };
  }

  if (snapshot.lastEvent === "message:sent" && ageMs < cfg.replyingTtlMs) {
    return {
      version: 1,
      online: true,
      state: "replying",
      mood: "bright",
      title: "回复中",
      message: "刚刚完成回复，正在回到待命状态。",
      updatedAt: new Date(snapshot.ts).toISOString(),
      ageMs,
      lastEvent: snapshot.lastEvent,
      deviceName: cfg.deviceName,
    };
  }

  if (snapshot.lastEvent === "message:received" && ageMs < cfg.thinkingTtlMs) {
    return {
      version: 1,
      online: true,
      state: "thinking",
      mood: "focused",
      title: "思考中",
      message: "收到新消息，正在思考怎么回复。",
      updatedAt: new Date(snapshot.ts).toISOString(),
      ageMs,
      lastEvent: snapshot.lastEvent,
      deviceName: cfg.deviceName,
    };
  }

  return {
    version: 1,
    online: true,
    state: "idle",
    mood: "calm",
    title: "空闲中",
    message: "我在桌面待命。",
    updatedAt: new Date(snapshot.ts).toISOString(),
    ageMs,
    lastEvent: snapshot.lastEvent,
    deviceName: cfg.deviceName,
  };
}
