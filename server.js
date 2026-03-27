const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { URL } = require('node:url');

const HOST = '127.0.0.1';
const PORT = 8848;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const OPENCLAW_BASE_URL = process.env.OPENCLAW_BASE_URL || 'http://127.0.0.1:18789';
const OPENCLAW_STATUS_PATH = process.env.OPENCLAW_STATUS_PATH || '/lobster/status';
const OPENCLAW_HEALTH_PATH = process.env.OPENCLAW_HEALTH_PATH || '/lobster/health';
const OPENCLAW_READ_TOKEN = process.env.OPENCLAW_READ_TOKEN || '';
const OPENCLAW_SESSION_ROOT = process.env.OPENCLAW_SESSION_ROOT || path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions');

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
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function loadStore() {
  ensureDefaultStore();
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    const now = Date.now();
    return {
      sourceMode: 'event-sim',
      manualState: 'idle',
      demoStartedAt: now,
      lastEvent: 'gateway:startup',
      lastEventTs: now,
      deviceName: 'moss-desktop',
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

function normalizeLiveStatus(payload) {
  const now = Date.now();
  const stateKey = payload?.state && STATE_META[payload.state] ? payload.state : 'error';
  const meta = STATE_META[stateKey] || STATE_META.error;
  const title = payload?.title || meta.title;

  return {
    version: 1,
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
    bridgeStatus: payload?.bridgeStatus || 'live',
    openclawBaseUrl: OPENCLAW_BASE_URL,
    openclawStatusPath: OPENCLAW_STATUS_PATH,
    openclawHealthPath: OPENCLAW_HEALTH_PATH,
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

async function resolveStatusPayload() {
  const sessionPayload = resolveSessionDrivenStatus();
  if (sessionPayload) {
    return sessionPayload;
  }

  try {
    const livePayload = await fetchOpenClawJson(OPENCLAW_STATUS_PATH);
    return normalizeLiveStatus(livePayload);
  } catch (error) {
    const fallback = deriveLocalStatus(loadStore());
    return {
      ...fallback,
      liveError: error instanceof Error ? error.message : String(error),
    };
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
      const store = {
        sourceMode: 'event-sim',
        manualState: 'idle',
        demoStartedAt: now,
        lastEvent: 'gateway:startup',
        lastEventTs: now,
        deviceName: 'moss-desktop',
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
