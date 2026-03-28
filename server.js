const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { URL, pathToFileURL } = require('node:url');

const HOST = '127.0.0.1';
const PORT = 8848;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const OPENCLAW_BASE_URL = process.env.OPENCLAW_BASE_URL || 'http://127.0.0.1:18789';
const OPENCLAW_STATUS_PATH = process.env.OPENCLAW_STATUS_PATH || '/lobster/status';
const OPENCLAW_HEALTH_PATH = process.env.OPENCLAW_HEALTH_PATH || '/lobster/health';
const OPENCLAW_STREAM_PATH = process.env.OPENCLAW_STREAM_PATH || '/lobster/stream';
const OPENCLAW_DEVICE_EVENT_PATH = process.env.OPENCLAW_DEVICE_EVENT_PATH || '/lobster/device-event';
const OPENCLAW_READ_TOKEN = process.env.OPENCLAW_READ_TOKEN || '';
const OPENCLAW_WRITE_TOKEN = process.env.OPENCLAW_WRITE_TOKEN || '';
const OPENCLAW_SESSION_ROOT = process.env.OPENCLAW_SESSION_ROOT || path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions');
const OPENCLAW_CONFIG_FILE = process.env.OPENCLAW_CONFIG_FILE || path.join(os.homedir(), '.openclaw', 'openclaw.json');
const OPENCLAW_GATEWAY_HELPER = process.env.OPENCLAW_GATEWAY_HELPER || path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'openclaw', 'dist', 'call-DTKTDk3E.js');
const DESKTOP_CHAT_SESSION_KEY = process.env.DESKTOP_CHAT_SESSION_KEY || 'lobster:desktop';
const CHAT_POLL_WINDOW_MS = 45 * 1000;
const CHAT_STREAM_INTERVAL_MS = 1200;
const CHAT_STREAM_HEARTBEAT_MS = 15000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const STATE_META = {
  idle: {
    emoji: '😊',
    title: '空闲中',
    mood: 'calm',
    moodLabel: '轻松',
    message: '我在桌面待命，有事可以随时叫我。',
    pill: '在线 · 待命中',
    bg1: '#43cea2',
    bg2: '#185a9d',
  },
  thinking: {
    emoji: '🤔',
    title: '思考中',
    mood: 'focused',
    moodLabel: '专注',
    message: '收到新消息，正在思考怎么回复。',
    pill: '在线 · 深度思考',
    bg1: '#667eea',
    bg2: '#764ba2',
  },
  replying: {
    emoji: '✍️',
    title: '回复中',
    mood: 'bright',
    moodLabel: '投入',
    message: '刚刚完成回复，正在回到待命状态。',
    pill: '在线 · 正在输出',
    bg1: '#f7971e',
    bg2: '#ffd200',
  },
  sleeping: {
    emoji: '😴',
    title: '休眠中',
    mood: 'sleepy',
    moodLabel: '安静',
    message: '我已进入静默状态，等你再次唤醒。',
    pill: '低功耗 · 静默待机',
    bg1: '#232526',
    bg2: '#414345',
  },
  error: {
    emoji: '⚠️',
    title: '异常中',
    mood: 'alert',
    moodLabel: '警觉',
    message: '状态桥接出现异常，请检查本地服务。',
    pill: '连接异常 · 等待恢复',
    bg1: '#cb2d3e',
    bg2: '#ef473a',
  },
  offline: {
    emoji: '🫥',
    title: '离线中',
    mood: 'sleepy',
    moodLabel: '静默',
    message: '本地服务暂未启动，先把我叫醒吧。',
    pill: '离线 · 未连接',
    bg1: '#485563',
    bg2: '#29323c',
  },
};

const DEMO_SEQUENCE = ['idle', 'thinking', 'replying', 'idle', 'sleeping'];
const THINKING_TTL_MS = 6 * 60 * 1000;
const REPLYING_TTL_MS = 20 * 1000;

function ensureDefaultStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(STATE_FILE)) {
    const now = Date.now();
    const initial = {
      sourceMode: 'event-sim',
      manualState: 'idle',
      demoStartedAt: now,
      lastEvent: 'gateway:startup',
      lastEventTs: now,
      deviceName: 'moss-desktop',
      chatSessionKey: DESKTOP_CHAT_SESSION_KEY,
      chatResetCount: 0,
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function loadStore() {
  ensureDefaultStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return {
      sourceMode: 'event-sim',
      manualState: 'idle',
      demoStartedAt: Date.now(),
      lastEvent: 'gateway:startup',
      lastEventTs: Date.now(),
      deviceName: 'moss-desktop',
      chatSessionKey: DESKTOP_CHAT_SESSION_KEY,
      chatResetCount: 0,
      ...parsed,
    };
  } catch {
    const now = Date.now();
    return {
      sourceMode: 'event-sim',
      manualState: 'idle',
      demoStartedAt: now,
      lastEvent: 'gateway:startup',
      lastEventTs: now,
      deviceName: 'moss-desktop',
      chatSessionKey: DESKTOP_CHAT_SESSION_KEY,
      chatResetCount: 0,
    };
  }
}

function saveStore(store) {
  ensureDefaultStore();
  fs.writeFileSync(STATE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function withMeta(stateKey, extra = {}) {
  const meta = STATE_META[stateKey] || STATE_META.error;
  return {
    online: true,
    state: stateKey,
    emoji: meta.emoji,
    title: meta.title,
    mood: meta.mood,
    moodLabel: meta.moodLabel,
    message: meta.message,
    pill: meta.pill,
    bg1: meta.bg1,
    bg2: meta.bg2,
    ...extra,
  };
}

function deriveEventState(store) {
  const now = Date.now();
  const lastEvent = store.lastEvent || 'gateway:startup';
  const lastEventTs = Number(store.lastEventTs || now);
  const ageMs = Math.max(0, now - lastEventTs);

  if (lastEvent === 'command:stop') {
    return withMeta('sleeping', {
      mode: 'event-sim',
      modeLabel: '事件模拟模式',
      lastEvent,
      lastEventTs,
      ageMs,
    });
  }

  if (lastEvent === 'message:sent' && ageMs < REPLYING_TTL_MS) {
    return withMeta('replying', {
      mode: 'event-sim',
      modeLabel: '事件模拟模式',
      lastEvent,
      lastEventTs,
      ageMs,
    });
  }

  if (lastEvent === 'message:received' && ageMs < THINKING_TTL_MS) {
    return withMeta('thinking', {
      mode: 'event-sim',
      modeLabel: '事件模拟模式',
      lastEvent,
      lastEventTs,
      ageMs,
    });
  }

  return withMeta('idle', {
    mode: 'event-sim',
    modeLabel: '事件模拟模式',
    lastEvent,
    lastEventTs,
    ageMs,
  });
}

function deriveLocalStatus(store) {
  const now = Date.now();
  const deviceName = store.deviceName || 'moss-desktop';

  let payload;
  if (store.sourceMode === 'demo') {
    const startedAt = Number(store.demoStartedAt || now);
    const step = Math.floor(Math.max(0, now - startedAt) / 5000);
    const stateKey = DEMO_SEQUENCE[step % DEMO_SEQUENCE.length];
    payload = withMeta(stateKey, {
      mode: 'demo',
      modeLabel: '自动演示模式',
      lastEvent: 'demo:tick',
      lastEventTs: startedAt,
      ageMs: Math.max(0, now - startedAt),
      bridgeStatus: 'fallback',
    });
  } else if (store.sourceMode === 'manual') {
    const stateKey = store.manualState || 'idle';
    payload = withMeta(stateKey, {
      mode: 'manual',
      modeLabel: '手动状态模式',
      lastEvent: `manual:${stateKey}`,
      lastEventTs: Number(store.lastEventTs || now),
      ageMs: Math.max(0, now - Number(store.lastEventTs || now)),
      bridgeStatus: 'fallback',
    });
  } else {
    payload = {
      ...deriveEventState(store),
      bridgeStatus: 'fallback',
    };
  }

  return {
    version: 1,
    deviceName,
    updatedAt: new Date(now).toISOString(),
    polledAt: new Date(now).toISOString(),
    serverTime: now,
    openclawBaseUrl: OPENCLAW_BASE_URL,
    openclawStatusPath: OPENCLAW_STATUS_PATH,
    openclawHealthPath: OPENCLAW_HEALTH_PATH,
    ...payload,
  };
}

function normalizeRoutePath(routePath) {
  if (!routePath) return '/';
  return routePath.startsWith('/') ? routePath : `/${routePath}`;
}

function buildOpenClawUrl(routePath) {
  return new URL(normalizeRoutePath(routePath), OPENCLAW_BASE_URL).toString();
}

async function fetchOpenClawJson(routePath) {
  const headers = {
    accept: 'application/json',
  };

  if (OPENCLAW_READ_TOKEN) {
    headers.authorization = `Bearer ${OPENCLAW_READ_TOKEN}`;
  }

  const response = await fetch(buildOpenClawUrl(routePath), {
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`OpenClaw HTTP ${response.status}`);
  }

  return response.json();
}

async function forwardDeviceEventToOpenClaw(body) {
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json; charset=utf-8',
  };

  if (OPENCLAW_WRITE_TOKEN) {
    headers.authorization = `Bearer ${OPENCLAW_WRITE_TOKEN}`;
  }

  const response = await fetch(buildOpenClawUrl(OPENCLAW_DEVICE_EVENT_PATH), {
    method: 'POST',
    headers,
    cache: 'no-store',
    body: JSON.stringify(body || {}),
  });

  if (!response.ok) {
    throw new Error(`OpenClaw HTTP ${response.status}`);
  }

  return response.json();
}

let gatewayHelperPromise = null;

function readGatewayTokenFromConfig() {
  if (OPENCLAW_WRITE_TOKEN) return OPENCLAW_WRITE_TOKEN;
  if (OPENCLAW_READ_TOKEN) return OPENCLAW_READ_TOKEN;

  try {
    const config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_FILE, 'utf8'));
    return config?.gateway?.auth?.token || '';
  } catch {
    return '';
  }
}

async function loadGatewayHelper() {
  if (!gatewayHelperPromise) {
    gatewayHelperPromise = import(pathToFileURL(OPENCLAW_GATEWAY_HELPER).href);
  }
  return gatewayHelperPromise;
}

async function callGatewayMethod(method, params = {}, timeoutMs = 45000) {
  const token = readGatewayTokenFromConfig();
  if (!token) {
    throw new Error('OpenClaw gateway token is unavailable.');
  }

  const helper = await loadGatewayHelper();
  const gatewayCall = helper.i || helper.r;
  if (typeof gatewayCall !== 'function') {
    throw new Error('OpenClaw gateway helper did not expose a callable API.');
  }

  return gatewayCall({
    url: OPENCLAW_BASE_URL.replace(/^http/, 'ws'),
    token,
    method,
    params,
    timeoutMs,
  });
}

function getCurrentChatSessionKey() {
  const store = loadStore();
  return store.chatSessionKey || DESKTOP_CHAT_SESSION_KEY;
}

function createNextChatSessionKey() {
  return `${DESKTOP_CHAT_SESSION_KEY}:${Date.now()}`;
}

function extractTextParts(content) {
  if (!Array.isArray(content)) return [];
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      if (part.type === 'text' && typeof part.text === 'string') return part.text;
      if (part.type === 'input_text' && typeof part.text === 'string') return part.text;
      if (part.type === 'output_text' && typeof part.text === 'string') return part.text;
      return '';
    })
    .filter(Boolean);
}

function extractMessageText(message) {
  return extractTextParts(message?.content).join('\n').trim();
}

function normalizeChatMessage(message) {
  const role = message?.role;
  const timestamp = message?.timestamp || null;
  const id = message?.__openclaw?.id || `${role || 'message'}-${timestamp || Date.now()}`;

  if (role === 'assistant' && message?.stopReason === 'error' && message?.errorMessage) {
    return {
      id,
      role: 'system',
      text: `本轮回复失败：${message.errorMessage}`,
      timestamp,
      senderLabel: null,
      isError: true,
    };
  }

  if (role !== 'user' && role !== 'assistant') {
    return null;
  }

  const text = extractMessageText(message);
  if (!text) {
    return null;
  }

  return {
    id,
    role,
    text,
    timestamp,
    senderLabel: message?.senderLabel || null,
    isError: false,
  };
}

function inferChatPending(historyMessages, visibleMessages) {
  const lastVisibleAssistantTs = [...visibleMessages]
    .reverse()
    .find((entry) => entry.role === 'assistant')?.timestamp;
  const lastVisibleUserTs = [...visibleMessages]
    .reverse()
    .find((entry) => entry.role === 'user')?.timestamp;

  const lastHistory = Array.isArray(historyMessages) ? historyMessages[historyMessages.length - 1] : null;
  if (!lastHistory) return false;

  if (lastHistory.role === 'assistant' && lastHistory.stopReason === 'error') {
    return false;
  }

  if (lastVisibleUserTs && (!lastVisibleAssistantTs || lastVisibleAssistantTs < lastVisibleUserTs)) {
    return true;
  }

  if (lastHistory.role === 'user') return true;
  if (lastHistory.role === 'toolResult') return true;
  if (lastHistory.role === 'assistant' && !extractMessageText(lastHistory)) return true;
  return false;
}

function readRecentSessionMessageState(sessionId) {
  if (!sessionId) return null;

  const filePath = path.join(OPENCLAW_SESSION_ROOT, `${sessionId}.jsonl`);
  const lines = readRecentLines(filePath, 80);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const entry = JSON.parse(lines[i]);
      if (entry?.type !== 'message' || !entry?.message) continue;
      const message = entry.message;
      if (message.role === 'assistant' && message.stopReason === 'error' && message.errorMessage) {
        return {
          kind: 'error',
          timestamp: message.timestamp || entry.timestamp || null,
          text: `本轮回复失败：${message.errorMessage}`,
        };
      }
      if (message.role === 'assistant' && extractMessageText(message)) {
        return {
          kind: 'assistant',
          timestamp: message.timestamp || entry.timestamp || null,
        };
      }
      if (message.role === 'user') {
        return {
          kind: 'user',
          timestamp: message.timestamp || entry.timestamp || null,
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function resolveChatHistoryPayload(limit = 24) {
  const sessionKey = getCurrentChatSessionKey();
  const history = await callGatewayMethod('chat.history', {
    sessionKey,
    limit: Math.max(1, Math.min(Number(limit) || 24, 60)),
  }, 30000);

  const visibleMessages = (Array.isArray(history?.messages) ? history.messages : [])
    .map(normalizeChatMessage)
    .filter(Boolean);

  const latestSessionState = readRecentSessionMessageState(history?.sessionId);
  let pending = inferChatPending(history?.messages, visibleMessages);
  let lastError = visibleMessages[visibleMessages.length - 1]?.isError
    ? visibleMessages[visibleMessages.length - 1]
    : null;

  if (latestSessionState?.kind === 'error') {
    pending = false;
    lastError = {
      id: `error-${history?.sessionId || 'session'}`,
      role: 'system',
      text: latestSessionState.text,
      timestamp: latestSessionState.timestamp,
      senderLabel: null,
      isError: true,
    };

    if (!visibleMessages.find((entry) => entry.id === lastError.id || (entry.role === 'system' && entry.text === lastError.text && entry.timestamp === lastError.timestamp))) {
      visibleMessages.push(lastError);
    }
  }

  const lastMessage = visibleMessages[visibleMessages.length - 1] || null;

  return {
    ok: true,
    sessionKey,
    sessionId: history?.sessionId || null,
    thinkingLevel: history?.thinkingLevel || null,
    pending,
    status: lastError ? 'error' : (pending ? 'thinking' : 'idle'),
    lastMessage,
    lastError,
    messages: visibleMessages,
    chatHistoryPath: '/api/chat/history',
    chatSendPath: '/api/chat/send',
    chatResetPath: '/api/chat/reset',
    chatStreamPath: '/api/chat/stream',
  };
}

function writeSseEvent(res, eventName, payload) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function streamChatSnapshots(req, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });

  let closed = false;
  let lastSignature = '';

  const pushSnapshot = async () => {
    if (closed) return;
    try {
      const payload = await resolveChatHistoryPayload(24);
      const signature = JSON.stringify({
        sessionKey: payload.sessionKey,
        status: payload.status,
        pending: payload.pending,
        messageIds: payload.messages.map((entry) => entry.id),
        lastError: payload.lastError?.id || null,
      });

      if (signature !== lastSignature) {
        lastSignature = signature;
        writeSseEvent(res, 'chat', payload);
      }
    } catch (error) {
      writeSseEvent(res, 'chat_error', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const heartbeatTimer = setInterval(() => {
    if (!closed) {
      res.write(': keep-alive\n\n');
    }
  }, CHAT_STREAM_HEARTBEAT_MS);

  const streamTimer = setInterval(() => {
    pushSnapshot();
  }, CHAT_STREAM_INTERVAL_MS);

  pushSnapshot();

  req.on('close', () => {
    closed = true;
    clearInterval(streamTimer);
    clearInterval(heartbeatTimer);
  });
}

async function sendChatMessage(message) {
  const text = String(message || '').trim();
  if (!text) {
    throw new Error('message_required');
  }

  const sessionKey = getCurrentChatSessionKey();
  const helper = await loadGatewayHelper();
  const randomId = typeof helper.c === 'function' ? helper.c : () => String(Date.now());
  const result = await callGatewayMethod('chat.send', {
    sessionKey,
    message: text,
    deliver: false,
    idempotencyKey: randomId(),
  }, 45000);

  return {
    ok: true,
    sessionKey,
    runId: result?.runId || null,
    status: result?.status || 'started',
  };
}

function resetChatSession() {
  const store = loadStore();
  const nextSessionKey = createNextChatSessionKey();
  store.chatSessionKey = nextSessionKey;
  store.chatResetCount = Number(store.chatResetCount || 0) + 1;
  saveStore(store);
  return {
    ok: true,
    sessionKey: nextSessionKey,
    resetCount: store.chatResetCount,
    messages: [],
    pending: false,
    status: 'idle',
  };
}

function proxyOpenClawStream(req, res) {
  const target = new URL(buildOpenClawUrl(OPENCLAW_STREAM_PATH));
  const client = target.protocol === 'https:' ? https : http;
  const headers = {
    accept: 'text/event-stream',
    'cache-control': 'no-cache',
  };

  if (OPENCLAW_READ_TOKEN) {
    headers.authorization = `Bearer ${OPENCLAW_READ_TOKEN}`;
  }

  const upstreamReq = client.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    path: `${target.pathname}${target.search}`,
    method: 'GET',
    headers,
  }, (upstreamRes) => {
    if (upstreamRes.statusCode !== 200) {
      let errorBody = '';
      upstreamRes.setEncoding('utf8');
      upstreamRes.on('data', (chunk) => {
        errorBody += chunk;
      });
      upstreamRes.on('end', () => {
        sendJson(res, 502, {
          error: 'stream_unavailable',
          status: upstreamRes.statusCode,
          message: errorBody || 'OpenClaw stream unavailable',
        });
      });
      return;
    }

    res.writeHead(200, {
      'content-type': upstreamRes.headers['content-type'] || 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    upstreamRes.on('data', (chunk) => res.write(chunk));
    upstreamRes.on('end', () => res.end());
    upstreamRes.on('error', (error) => {
      if (!res.writableEnded) {
        res.write(`event: bridge_error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
        res.end();
      }
    });
  });

  upstreamReq.on('error', (error) => {
    if (!res.headersSent) {
      sendJson(res, 502, {
        error: 'stream_proxy_failed',
        message: error.message,
      });
      return;
    }

    if (!res.writableEnded) {
      res.write(`event: bridge_error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
      res.end();
    }
  });

  req.on('close', () => {
    upstreamReq.destroy();
  });

  upstreamReq.end();
}

function normalizeLiveStatus(payload) {
  const now = Date.now();
  const stateKey = payload?.state && STATE_META[payload.state] ? payload.state : 'error';
  const meta = STATE_META[stateKey] || STATE_META.error;
  const title = payload?.title || meta.title;

  return {
    version: Number(payload?.version || 2),
    deviceName: payload?.deviceName || 'moss-desktop',
    updatedAt: payload?.updatedAt || new Date(now).toISOString(),
    polledAt: new Date(now).toISOString(),
    serverTime: now,
    online: payload?.online !== false,
    state: stateKey,
    emoji: meta.emoji,
    title,
    mood: payload?.mood || meta.mood,
    moodLabel: meta.moodLabel,
    message: payload?.message || meta.message,
    pill: `OpenClaw 实时联动 · ${title}`,
    bg1: meta.bg1,
    bg2: meta.bg2,
    mode: 'openclaw-live',
    modeLabel: 'OpenClaw 实时联动',
    lastEvent: payload?.lastEvent || 'gateway:startup',
    ageMs: Number(payload?.ageMs || 0),
    busyForMs: Number(payload?.busyForMs || payload?.ageMs || 0),
    channel: payload?.channel,
    conversationId: payload?.conversationId,
    device: payload?.device || null,
    lastDeviceEvent: payload?.lastDeviceEvent || null,
    activeScene: payload?.activeScene || null,
    bridgeStatus: payload?.bridgeStatus || 'live',
    openclawBaseUrl: OPENCLAW_BASE_URL,
    openclawStatusPath: OPENCLAW_STATUS_PATH,
    openclawHealthPath: OPENCLAW_HEALTH_PATH,
    openclawStreamPath: OPENCLAW_STREAM_PATH,
    openclawDeviceEventPath: OPENCLAW_DEVICE_EVENT_PATH,
  };
}

function readRecentLines(filePath, maxLines = 80) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split(/\r?\n/).filter(Boolean).slice(-maxLines);
  } catch {
    return [];
  }
}

function getLatestSessionActivity() {
  try {
    if (!fs.existsSync(OPENCLAW_SESSION_ROOT)) {
      return null;
    }

    const files = fs.readdirSync(OPENCLAW_SESSION_ROOT)
      .filter((name) => name.endsWith('.jsonl') && !name.includes('.reset.'))
      .map((name) => {
        const filePath = path.join(OPENCLAW_SESSION_ROOT, name);
        const stat = fs.statSync(filePath);
        return { filePath, mtimeMs: stat.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, 3);

    let latest = null;
    for (const file of files) {
      const lines = readRecentLines(file.filePath, 120);
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        try {
          const entry = JSON.parse(lines[i]);
          if (entry?.type !== 'message') continue;
          const role = entry?.message?.role;
          if (role !== 'user' && role !== 'assistant') continue;
          const ts = Date.parse(entry?.timestamp || entry?.message?.timestamp || '');
          if (!Number.isFinite(ts)) continue;
          if (!latest || ts > latest.ts) {
            latest = { role, ts, filePath: file.filePath };
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

function resolveSessionDrivenStatus() {
  const latest = getLatestSessionActivity();
  if (!latest) return null;

  const now = Date.now();
  const ageMs = Math.max(0, now - latest.ts);

  if (latest.role === 'assistant' && ageMs < REPLYING_TTL_MS) {
    return normalizeLiveStatus({
      state: 'replying',
      title: '回复中',
      mood: 'bright',
      message: '刚刚完成回复，正在回到待命状态。',
      updatedAt: new Date(latest.ts).toISOString(),
      ageMs,
      lastEvent: 'session:assistant_message',
      deviceName: 'lobster-display',
      bridgeStatus: 'session-live',
    });
  }

  if (latest.role === 'user' && ageMs < THINKING_TTL_MS) {
    return normalizeLiveStatus({
      state: 'thinking',
      title: '思考中',
      mood: 'focused',
      message: '收到新消息，正在思考怎么回复。',
      updatedAt: new Date(latest.ts).toISOString(),
      ageMs,
      lastEvent: 'session:user_message',
      deviceName: 'lobster-display',
      bridgeStatus: 'session-live',
    });
  }

  return normalizeLiveStatus({
    state: 'idle',
    title: '空闲中',
    mood: 'calm',
    message: '我在桌面待命。',
    updatedAt: new Date(latest.ts).toISOString(),
    ageMs,
    lastEvent: latest.role === 'assistant' ? 'session:assistant_message' : 'session:user_message',
    deviceName: 'lobster-display',
    bridgeStatus: 'session-live',
  });
}

function buildOfflineStatus(error) {
  const now = Date.now();
  const message = error instanceof Error ? error.message : String(error || 'OpenClaw unavailable');

  return {
    version: 2,
    deviceName: 'lobster-display',
    updatedAt: new Date(now).toISOString(),
    polledAt: new Date(now).toISOString(),
    serverTime: now,
    online: false,
    state: 'idle',
    emoji: STATE_META.offline.emoji,
    title: STATE_META.offline.title,
    mood: STATE_META.offline.mood,
    moodLabel: STATE_META.offline.moodLabel,
    message: STATE_META.offline.message,
    pill: STATE_META.offline.pill,
    bg1: STATE_META.offline.bg1,
    bg2: STATE_META.offline.bg2,
    mode: 'offline',
    modeLabel: 'OpenClaw 未连接',
    lastEvent: 'offline',
    ageMs: 0,
    busyForMs: 0,
    bridgeStatus: 'offline',
    device: null,
    devices: [],
    deviceCount: 0,
    lastDeviceEvent: null,
    recentDeviceEvents: [],
    activeScene: null,
    sseEnabled: false,
    streamPath: OPENCLAW_STREAM_PATH,
    deviceEventPath: OPENCLAW_DEVICE_EVENT_PATH,
    openclawBaseUrl: OPENCLAW_BASE_URL,
    openclawStatusPath: OPENCLAW_STATUS_PATH,
    openclawHealthPath: OPENCLAW_HEALTH_PATH,
    openclawStreamPath: OPENCLAW_STREAM_PATH,
    openclawDeviceEventPath: OPENCLAW_DEVICE_EVENT_PATH,
    liveError: message,
  };
}

async function resolveStatusPayload() {
  try {
    const livePayload = await fetchOpenClawJson(OPENCLAW_STATUS_PATH);
    return normalizeLiveStatus(livePayload);
  } catch (error) {
    const store = loadStore();
    if (store.sourceMode === 'demo' || store.sourceMode === 'manual') {
      const fallback = deriveLocalStatus(store);
      return {
        ...fallback,
        liveError: error instanceof Error ? error.message : String(error),
      };
    }

    return buildOfflineStatus(error);
  }
}

async function resolveHealthPayload() {
  try {
    const liveHealth = await fetchOpenClawJson(OPENCLAW_HEALTH_PATH);
    return {
      ok: true,
      port: PORT,
      host: HOST,
      mode: 'openclaw-live',
      openclaw: {
        ok: true,
        baseUrl: OPENCLAW_BASE_URL,
        statusPath: OPENCLAW_STATUS_PATH,
        healthPath: OPENCLAW_HEALTH_PATH,
        streamPath: OPENCLAW_STREAM_PATH,
        deviceEventPath: OPENCLAW_DEVICE_EVENT_PATH,
        payload: liveHealth,
      },
    };
  } catch (error) {
    return {
      ok: true,
      port: PORT,
      host: HOST,
      mode: 'local-fallback',
      openclaw: {
        ok: false,
        baseUrl: OPENCLAW_BASE_URL,
        statusPath: OPENCLAW_STATUS_PATH,
        healthPath: OPENCLAW_HEALTH_PATH,
        streamPath: OPENCLAW_STREAM_PATH,
        deviceEventPath: OPENCLAW_DEVICE_EVENT_PATH,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function sendJson(res, code, payload) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(reqPath, res) {
  const normalizedPath = path.normalize(reqPath);
  const safePath = normalizedPath.replace(/^([.][.][/\\])+/, '');
  const isRootRequest = reqPath === '/' || normalizedPath === '/' || normalizedPath === '\\';
  const filePath = isRootRequest ? path.join(ROOT, 'index.html') : path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader('content-type', MIME_TYPES[ext] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const pathname = requestUrl.pathname;

  try {
    if (req.method === 'GET' && pathname === '/api/status') {
      sendJson(res, 200, await resolveStatusPayload());
      return;
    }

    if (req.method === 'GET' && pathname === '/api/stream') {
      proxyOpenClawStream(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/device-event') {
      const body = await readBody(req);
      try {
        sendJson(res, 200, await forwardDeviceEventToOpenClaw(body));
      } catch (error) {
        sendJson(res, 502, {
          ok: false,
          error: 'device_event_proxy_failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/chat/history') {
      const limit = requestUrl.searchParams.get('limit');
      sendJson(res, 200, await resolveChatHistoryPayload(limit ? Number(limit) : 24));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/chat/stream') {
      streamChatSnapshots(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/chat/send') {
      const body = await readBody(req);
      const result = await sendChatMessage(body.message);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/chat/reset') {
      sendJson(res, 200, resetChatSession());
      return;
    }

    if (req.method === 'GET' && pathname === '/api/store') {
      sendJson(res, 200, loadStore());
      return;
    }

    if (req.method === 'GET' && pathname === '/api/bridge') {
      sendJson(res, 200, await resolveHealthPayload());
      return;
    }

    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, await resolveHealthPayload());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/mode') {
      const body = await readBody(req);
      const mode = body.mode;
      if (!['demo', 'manual', 'event-sim'].includes(mode)) {
        sendJson(res, 400, { error: 'invalid_mode' });
        return;
      }
      const store = loadStore();
      store.sourceMode = mode;
      if (mode === 'demo') {
        store.demoStartedAt = Date.now();
      }
      if (mode === 'event-sim') {
        store.lastEvent = store.lastEvent || 'gateway:startup';
        store.lastEventTs = Date.now();
      }
      saveStore(store);
      sendJson(res, 200, deriveLocalStatus(store));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/state') {
      const body = await readBody(req);
      const state = body.state;
      if (!['idle', 'thinking', 'replying', 'sleeping', 'error'].includes(state)) {
        sendJson(res, 400, { error: 'invalid_state' });
        return;
      }
      const store = loadStore();
      store.sourceMode = 'manual';
      store.manualState = state;
      store.lastEventTs = Date.now();
      saveStore(store);
      sendJson(res, 200, deriveLocalStatus(store));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/event') {
      const body = await readBody(req);
      const event = body.event;
      if (!['gateway:startup', 'message:received', 'message:sent', 'command:new', 'command:reset', 'command:stop'].includes(event)) {
        sendJson(res, 400, { error: 'invalid_event' });
        return;
      }
      const store = loadStore();
      store.sourceMode = 'event-sim';
      store.lastEvent = event;
      store.lastEventTs = Date.now();
      saveStore(store);
      sendJson(res, 200, deriveLocalStatus(store));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/reset') {
      const now = Date.now();
      const previous = loadStore();
      const store = {
        sourceMode: 'event-sim',
        manualState: 'idle',
        demoStartedAt: now,
        lastEvent: 'gateway:startup',
        lastEventTs: now,
        deviceName: 'moss-desktop',
        chatSessionKey: previous.chatSessionKey || DESKTOP_CHAT_SESSION_KEY,
        chatResetCount: Number(previous.chatResetCount || 0),
      };
      saveStore(store);
      sendJson(res, 200, deriveLocalStatus(store));
      return;
    }

    if (req.method === 'GET' && (pathname === '/' || pathname.endsWith('.html') || pathname.endsWith('.js') || pathname.endsWith('.css') || pathname.endsWith('.txt') || pathname.endsWith('.json'))) {
      serveStatic(pathname, res);
      return;
    }

    sendJson(res, 404, { error: 'not_found' });
  } catch (error) {
    sendJson(res, 500, {
      error: 'server_error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

ensureDefaultStore();
server.listen(PORT, HOST, () => {
  console.log(`moss desktop server running at http://${HOST}:${PORT}`);
  console.log(`moss desktop bridge target: ${buildOpenClawUrl(OPENCLAW_STATUS_PATH)}`);
});
