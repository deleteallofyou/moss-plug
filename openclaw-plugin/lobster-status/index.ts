import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StateStore } from "./src/state-store.js";
import { deriveStatus } from "./src/derive-state.js";
import type { LobsterEventType, LobsterSnapshot } from "./src/types.js";

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

function inferSnapshotFromGatewayLog(): LobsterSnapshot | null {
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

export default function register(api: any) {
  const pluginCfg = api?.config?.plugins?.entries?.["lobster-status"]?.config ?? {};

  const cfg = {
    routePath: pluginCfg.routePath || "/lobster/status",
    healthPath: pluginCfg.healthPath || "/lobster/health",
    readToken: pluginCfg.readToken,
    thinkingTtlMs: pluginCfg.thinkingTtlMs || 6 * 60 * 1000,
    replyingTtlMs: pluginCfg.replyingTtlMs || 20 * 1000,
    stateFile: pluginCfg.stateFile,
    deviceName: pluginCfg.deviceName || "lobster-display",
  };

  const store = new StateStore(cfg.stateFile);

  function update(lastEvent: LobsterEventType, extra: Record<string, unknown> = {}) {
    store.set({
      lastEvent,
      ts: Date.now(),
      ...extra,
    });
  }

  function getSnapshot() {
    const stored = store.get();
    const inferred = inferSnapshotFromGatewayLog();

    if (inferred && (!stored || inferred.ts >= stored.ts)) {
      store.set(inferred);
      return inferred;
    }

    return stored;
  }

  api.registerHook("gateway:startup", async () => {
    update("gateway:startup", { source: "plugin" });
  }, {
    name: "lobster-status.gateway-startup",
    description: "Seed status on gateway startup",
  });

  api.registerHook("message:received", async () => {
    update("message:received", { source: "hook" });
  }, {
    name: "lobster-status.message-received",
    description: "Mark device as thinking on inbound message",
  });

  api.registerHook("message:sent", async () => {
    update("message:sent", { source: "hook" });
  }, {
    name: "lobster-status.message-sent",
    description: "Mark device as replying on outbound message",
  });

  api.registerHook("command:new", async () => {
    update("command:new", { source: "command" });
  }, {
    name: "lobster-status.command-new",
    description: "Reset to idle on /new",
  });

  api.registerHook("command:reset", async () => {
    update("command:reset", { source: "command" });
  }, {
    name: "lobster-status.command-reset",
    description: "Reset to idle on /reset",
  });

  api.registerHook("command:stop", async () => {
    update("command:stop", { source: "command" });
  }, {
    name: "lobster-status.command-stop",
    description: "Set sleeping on /stop",
  });

  api.registerHttpRoute({
    path: cfg.routePath,
    auth: "plugin",
    match: "exact",
    handler: async (req: any, res: any) => {
      if (cfg.readToken) {
        const auth = req.headers["authorization"];
        if (auth !== `Bearer ${cfg.readToken}`) {
          res.statusCode = 401;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "unauthorized" }));
          return true;
        }
      }

      const payload = deriveStatus(getSnapshot(), cfg);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify(payload));
      return true;
    },
  });

  api.registerHttpRoute({
    path: cfg.healthPath,
    auth: "plugin",
    match: "exact",
    handler: async (_req: any, res: any) => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: true, plugin: "lobster-status", logPath: getTodayLogPath() }));
      return true;
    },
  });
}
