# moss-desktop

这是一个桌面桌宠状态终端原型，现在已经升级到 **v0.2 桥接结构**：

- `http://127.0.0.1:8848` 继续作为本地桌面页面入口
- `server.js` 继续负责本地静态页面和桥接接口
- `openclaw-plugin/lobster-status/` 提供 OpenClaw 侧真实状态桥
- 页面优先走 **SSE 实时流**，失败时自动回退为轮询
- 页面会向 OpenClaw 回传轻量设备事件，为未来接入**实体桌宠**做准备

---

## 目录说明

- `index.html`：桌面状态 UI
- `server.js`：本地桥接服务（代理状态、SSE、设备事件）
- `启动.bat`：一键启动本地页面服务并打开浏览器
- `enable-openclaw-live.bat`：一键把 `lobster-status` 插件接进 OpenClaw
- `data/state.json`：本地模拟状态存档（作为回退源）
- `openclaw-plugin/lobster-status/`：OpenClaw 真状态插件

---

## 当前能力

### 1) OpenClaw → 桌宠

插件监听这些 OpenClaw 事件：

- `gateway:startup`
- `message:received`
- `message:sent`
- `command:new`
- `command:reset`
- `command:stop`

并通过这些接口暴露给桌宠：

- `GET /lobster/status`
- `GET /lobster/health`
- `GET /lobster/stream`

### 2) 桌宠 → OpenClaw

桌面页/浏览器页现在会回传轻量设备事件：

- `page_load`
- `heartbeat`
- `visibility_change`
- `pet_click`

对应接口：

- `POST /lobster/device-event`

这一步是为了后面接：
- 浏览器桌宠
- 任务栏挂件
- 树莓派小屏
- ESP32 / USB 小硬件
- 有动作和灯光反馈的实体桌宠

---

## 本地桥接服务接口

`server.js` 继续作为可选桥接层，供前端统一访问：

- `GET /api/status`：优先拉取 OpenClaw 真状态；失败时回退到本地模拟状态
- `GET /api/health`：查看本地桥接和 OpenClaw 探测结果
- `GET /api/bridge`：桥接详情
- `GET /api/stream`：代理 OpenClaw SSE 状态流
- `POST /api/device-event`：代理设备事件写入
- `POST /api/mode` / `POST /api/state` / `POST /api/event`：保留本地模拟能力

这样网页层既可以走本地桥接，也可以像当前 `index.html` 一样直接连接 OpenClaw 插件端点。

---

## 最快打开方式

### 只看页面 / 本地模拟模式

直接双击：

- `启动.bat`

然后浏览器访问：

- `http://127.0.0.1:8848`

如果 OpenClaw 还没接好，页面会自动回退到本地模拟状态。

---

## 接入 OpenClaw 真联动

第一次接入时，先运行：

- `enable-openclaw-live.bat`

这个脚本会做两件事：

1. 把 `openclaw-plugin/lobster-status` 通过 link 方式安装到 OpenClaw
2. 重启 OpenClaw Gateway

跑完以后，再双击：

- `启动.bat`

然后打开：

- `http://127.0.0.1:8848`

---

## 可选环境变量

如果你的 OpenClaw 不是默认本机地址，可以在启动 `server.js` 前设置：

- `OPENCLAW_BASE_URL`，默认 `http://127.0.0.1:18789`
- `OPENCLAW_STATUS_PATH`，默认 `/lobster/status`
- `OPENCLAW_HEALTH_PATH`，默认 `/lobster/health`
- `OPENCLAW_STREAM_PATH`，默认 `/lobster/stream`
- `OPENCLAW_DEVICE_EVENT_PATH`，默认 `/lobster/device-event`
- `OPENCLAW_READ_TOKEN`，读取状态用
- `OPENCLAW_WRITE_TOKEN`，写设备事件用

示例：

```bat
set OPENCLAW_BASE_URL=http://192.168.1.5:18789
node server.js
```

---

## 下一步建议

现在这套结构已经能往“实体桌宠”继续长了，推荐下一步：

1. 增加 scene/animation 控制接口
2. 给不同设备分配不同 deviceId 和角色
3. 增加硬件心跳与离线判定
4. 做表情屏 / 灯光 / 舵机动作映射
5. 在插件里加入 agent 可调用的控制工具（如 `set_scene`）

一句话总结：
**现在它不只是网页看板，而是一个未来可接实体桌宠的 OpenClaw 桥。**
