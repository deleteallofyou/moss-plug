import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { normalizeDeviceEventPayload, isLocalhostAddress } from "./src/device-events.js";
import { deriveStatus } from "./src/derive-state.js";
import { SseBus } from "./src/sse-bus.js";
import { StateStore } from "./src/state-store.js";
import type { RuntimeEventType, RuntimeSnapshot } from "./src/types.js";

function getTodayLogPath() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return path.join(os.tmpdir(), "openclaw", `openclaw-${yyyy}-${mm}-${dd}.log`);
}

function parseIsoTs(value: unknown) {
  if (typeof value !== "string") return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function readJsonLogMessage(line: string) {
  try {
    const obj = JSON.parse(line);
    const messageParts = [];
    if (typeof obj?.[0] === "string") messageParts.push(obj[0]);
    if (typeof obj?.[1] === "string") messageParts.push(obj[1]);
    const message = messageParts.join(" ");
    const ts = parseIsoTs(obj?.time) || parseIsoTs(obj?._meta?.date);
    return { message, ts };
  } catch {
    return null;
  }
}

function inferSnapshotFromGatewayLog(): RuntimeSnapshot | null {
  const logPath = getTodayLogPath();
  if (!fs.existsSync(logPath)) {
    return null;
  }

  let content = "";
  try {
    content = fs.readFileSync(logPath, "utf8");
  } catch {
    return null;
  }

  const lines = content.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const parsed = readJsonLogMessage(line);
    if (!parsed?.ts) continue;

    if (parsed.message.includes("received message from")) {
      return {
        lastEvent: "message:received",
        ts: parsed.ts,
        source: "gateway-log",
      };
    }

    if (parsed.message.includes("dispatch complete")) {
      return {
        lastEvent: "message:sent",
        ts: parsed.ts,
        source: "gateway-log",
      };
    }
  }

  return null;
}

function readRecentLines(filePath: string, maxLines = 120) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content.split(/\r?\n/).filter(Boolean).slice(-maxLines);
  } catch {
    return [];
  }
}

function inferSnapshotFromSessionFiles() {
  const sessionRoot = path.join(os.homedir(), ".openclaw", "agents", "main", "sessions");
  if (!fs.existsSync(sessionRoot)) {
    return null;
  }

  try {
    const files = fs.readdirSync(sessionRoot)
      .filter((name) => name.endsWith(".jsonl") && !name.includes(".reset."))
      .map((name) => {
        const filePath = path.join(sessionRoot, name);
        const stat = fs.statSync(filePath);
        return { filePath, mtimeMs: stat.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, 5);

    let latest: RuntimeSnapshot | null = null;
    for (const file of files) {
      const lines = readRecentLines(file.filePath, 150);
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        try {
          const entry = JSON.parse(lines[i]);
          if (entry?.type !== "message") continue;
          const role = entry?.message?.role;
          if (role !== "user" && role !== "assistant") continue;
          const ts = parseIsoTs(entry?.timestamp)
            || parseIsoTs(entry?.message?.timestamp)
            || (typeof entry?.timestamp === "number" ? entry.timestamp : null)
            || (typeof entry?.message?.timestamp === "number" ? entry.message.timestamp : null);
          if (!ts || !Number.isFinite(ts)) continue;

          const snapshot: RuntimeSnapshot = {
            lastEvent: role === "user" ? "message:received" : "message:sent",
            ts,
            source: "session-log",
          };

          if (!latest || snapshot.ts > latest.ts) {
            latest = snapshot;
          }
          break;
        } catch {
          continue;
        }
      }
    }

    return latest;
  } catch {
    return null;
  }
}

function pickLatestSnapshot(...snapshots: Array<RuntimeSnapshot | null | undefined>) {
  return snapshots
    .filter((snapshot): snapshot is RuntimeSnapshot => !!snapshot)
    .sort((a, b) => b.ts - a.ts)[0] ?? null;
}

function readRequestBody(req: IncomingMessage, maxBytes = 8 * 1024) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("invalid_json"));
      }
    });

    req.on("error", reject);
  });
}

function setCors(res: ServerResponse<IncomingMessage>) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "authorization, content-type");
  res.setHeader("access-control-max-age", "86400");
}

function sendJson(res: ServerResponse<IncomingMessage>, code: number, payload: unknown) {
  setCors(res);
  res.statusCode = code;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

function hasBearerToken(req: IncomingMessage, expected?: string) {
  if (!expected) return true;
  return req.headers.authorization === `Bearer ${expected}`;
}

function maybeHandleOptions(req: IncomingMessage, res: ServerResponse<IncomingMessage>) {
  if (req.method !== "OPTIONS") return false;
  setCors(res);
  res.statusCode = 204;
  res.end();
  return true;
}

export default function register(api: any) {
  const pluginCfg = api?.config?.plugins?.entries?.["lobster-status"]?.config ?? {};

  const cfg = {
    routePath: pluginCfg.routePath || "/lobster/status",
    healthPath: pluginCfg.healthPath || "/lobster/health",
    streamPath: pluginCfg.streamPath || "/lobster/stream",
    deviceEventPath: pluginCfg.deviceEventPath || "/lobster/device-event",
    readToken: pluginCfg.readToken,
    writeToken: pluginCfg.writeToken,
    thinkingTtlMs: pluginCfg.thinkingTtlMs || 6 * 60 * 1000,
    replyingTtlMs: pluginCfg.replyingTtlMs || 20 * 1000,
    stateFile: pluginCfg.stateFile,
    deviceName: pluginCfg.deviceName || "lobster-display",
    eventQueueLimit: pluginCfg.eventQueueLimit || 100,
    enableSse: pluginCfg.enableSse !== false,
    writeLocalhostOnly: pluginCfg.writeLocalhostOnly !== false,
  };

  const store = new StateStore(cfg.stateFile);
  const sseBus = cfg.enableSse ? new SseBus() : null;
  let transitionTimer: NodeJS.Timeout | null = null;

  function getTransitionDelay(snapshot: RuntimeSnapshot | null | undefined) {
    if (!snapshot) return null;

    const now = Date.now();
    const ageMs = Math.max(0, now - snapshot.ts);

    if (snapshot.lastEvent === "message:received") {
      const remaining = cfg.thinkingTtlMs - ageMs;
      return remaining > 0 ? remaining + 25 : null;
    }

    if (snapshot.lastEvent === "message:sent") {
      const remaining = cfg.replyingTtlMs - ageMs;
      return remaining > 0 ? remaining + 25 : null;
    }

    return null;
  }

  function scheduleTransitionBroadcast(snapshot: RuntimeSnapshot | null | undefined) {
    if (transitionTimer) {
      clearTimeout(transitionTimer);
      transitionTimer = null;
    }

    const delay = getTransitionDelay(snapshot);
    if (delay == null) return;

    transitionTimer = setTimeout(() => {
      transitionTimer = null;
      broadcastStatus();
    }, delay);
  }

  function getStatusPayload() {
    const state = store.getState();
    const stored = state.runtimeSnapshot;
    const inferred = pickLatestSnapshot(
      inferSnapshotFromGatewayLog(),
      inferSnapshotFromSessionFiles(),
      stored,
    );

    if (inferred && (!stored || inferred.ts >= stored.ts || inferred.source !== stored.source)) {
      store.setRuntimeSnapshot(inferred);
      scheduleTransitionBroadcast(inferred);
      return deriveStatus({ ...state, runtimeSnapshot: inferred }, cfg);
    }

    return deriveStatus(state, cfg);
  }

  function broadcastStatus() {
    if (!sseBus) return;
    const payload = getStatusPayload();
    sseBus.broadcast("status", payload);
    scheduleTransitionBroadcast(payload.runtimeSnapshot);
  }

  function updateRuntime(lastEvent: RuntimeEventType, extra: Partial<RuntimeSnapshot> = {}) {
    const snapshot = {
      lastEvent,
      ts: Date.now(),
      ...extra,
    };
    store.setRuntimeSnapshot(snapshot);
    scheduleTransitionBroadcast(snapshot);
    broadcastStatus();
  }

  scheduleTransitionBroadcast(store.getState().runtimeSnapshot);

  api.registerHook("gateway:startup", async () => {
    updateRuntime("gateway:startup", { source: "plugin" });
  }, {
    name: "lobster-status.gateway-startup",
    description: "Seed status on gateway startup",
  });

  api.registerHook("message:received", async () => {
    updateRuntime("message:received", { source: "hook" });
  }, {
    name: "lobster-status.message-received",
    description: "Mark device as thinking on inbound message",
  });

  api.registerHook("message:sent", async () => {
    updateRuntime("message:sent", { source: "hook" });
  }, {
    name: "lobster-status.message-sent",
    description: "Mark device as replying on outbound message",
  });

  api.registerHook("command:new", async () => {
    updateRuntime("command:new", { source: "command" });
  }, {
    name: "lobster-status.command-new",
    description: "Reset to idle on /new",
  });

  api.registerHook("command:reset", async () => {
    updateRuntime("command:reset", { source: "command" });
  }, {
    name: "lobster-status.command-reset",
    description: "Reset to idle on /reset",
  });

  api.registerHook("command:stop", async () => {
    updateRuntime("command:stop", { source: "command" });
  }, {
    name: "lobster-status.command-stop",
    description: "Set sleeping on /stop",
  });

  api.registerHttpRoute({
    path: cfg.routePath,
    auth: "plugin",
    match: "exact",
    handler: async (req: IncomingMessage, res: ServerResponse<IncomingMessage>) => {
      if (maybeHandleOptions(req, res)) return true;
      if (req.method !== "GET") {
        sendJson(res, 405, { error: "method_not_allowed" });
        return true;
      }
      if (!hasBearerToken(req, cfg.readToken)) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }

      sendJson(res, 200, getStatusPayload());
      return true;
    },
  });

  api.registerHttpRoute({
    path: cfg.healthPath,
    auth: "plugin",
    match: "exact",
    handler: async (req: IncomingMessage, res: ServerResponse<IncomingMessage>) => {
      if (maybeHandleOptions(req, res)) return true;
      if (req.method !== "GET") {
        sendJson(res, 405, { error: "method_not_allowed" });
        return true;
      }

      const state = store.getState();
      sendJson(res, 200, {
        ok: true,
        plugin: "lobster-status",
        version: "0.2.0",
        stream: cfg.enableSse,
        logPath: getTodayLogPath(),
        stateFile: cfg.stateFile ?? null,
        futureHardwareReady: true,
        deviceCount: Object.keys(state.devices).length,
        endpoints: {
          status: cfg.routePath,
          health: cfg.healthPath,
          stream: cfg.streamPath,
          deviceEvent: cfg.deviceEventPath,
        },
      });
      return true;
    },
  });

  api.registerHttpRoute({
    path: cfg.streamPath,
    auth: "plugin",
    match: "exact",
    handler: async (req: IncomingMessage, res: ServerResponse<IncomingMessage>) => {
      if (maybeHandleOptions(req, res)) return true;
      if (req.method !== "GET") {
        sendJson(res, 405, { error: "method_not_allowed" });
        return true;
      }
      if (!cfg.enableSse) {
        sendJson(res, 503, { error: "stream_disabled" });
        return true;
      }
      if (!hasBearerToken(req, cfg.readToken)) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }

      setCors(res);
      sseBus?.addClient(req, res, getStatusPayload());
      return true;
    },
  });

  api.registerHttpRoute({
    path: cfg.deviceEventPath,
    auth: "plugin",
    match: "exact",
    handler: async (req: IncomingMessage, res: ServerResponse<IncomingMessage>) => {
      if (maybeHandleOptions(req, res)) return true;
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "method_not_allowed" });
        return true;
      }

      if (cfg.writeLocalhostOnly && !isLocalhostAddress(req.socket.remoteAddress)) {
        sendJson(res, 403, { error: "localhost_only" });
        return true;
      }

      if (!hasBearerToken(req, cfg.writeToken)) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }

      try {
        const body = await readRequestBody(req);
        const normalized = normalizeDeviceEventPayload(body);
        if (!normalized.ok) {
          sendJson(res, 400, { error: normalized.error });
          return true;
        }

        store.addDeviceEvent(normalized.event, cfg.eventQueueLimit);
        const status = getStatusPayload();

        if (sseBus) {
          sseBus.broadcast("device_event", {
            id: normalized.event.id,
            deviceId: normalized.event.deviceId,
            event: normalized.event.event,
            ts: new Date(normalized.event.ts).toISOString(),
            meta: normalized.event.meta,
          });
          sseBus.broadcast("status", status);
        }

        sendJson(res, 200, {
          ok: true,
          accepted: true,
          queued: true,
          event: {
            id: normalized.event.id,
            deviceId: normalized.event.deviceId,
            event: normalized.event.event,
            ts: new Date(normalized.event.ts).toISOString(),
          },
          status,
        });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = message === "payload_too_large" ? 413 : 400;
        sendJson(res, code, { error: message });
        return true;
      }
    },
  });
}
