# moss-desktop

一个正在演进中的 **OpenClaw 桌宠 / 小龙虾软件原型**。

当前版本已经不只是状态看板：
- 可以展示 OpenClaw 的实时状态
- 可以持续上报桌宠设备事件
- 可以通过本地 bridge 把消息送进桌宠专用会话，形成 **v0.3 聊天 MVP**

---

## 当前能力

### 1. 实时状态联动
由 `openclaw-plugin/lobster-status` 提供：
- `GET /lobster/status`
- `GET /lobster/health`
- `GET /lobster/stream`
- `POST /lobster/device-event`

状态支持：
- `idle`
- `thinking`
- `replying`
- `sleeping`
- `error`
- `offline`

并且已经修复：
- SSE 卡在旧状态的问题
- TTL 到期不自动回落的问题
- 前后端设备事件协议不一致的问题
- `openclaw-control-ui / webchat` 状态不同步的问题

### 2. 本地 bridge（`server.js`）
本地 bridge 运行在：
- `http://127.0.0.1:8848`

负责：
- 代理状态读取
- 代理实时流
- 代理设备事件写入
- 作为桌宠聊天入口

### 3. v0.3 聊天 MVP
当前已经新增：
- `GET /api/chat/history`
- `GET /api/chat/stream`
- `POST /api/chat/send`
- `POST /api/chat/reset`

设计思路：
- 浏览器不直接连 Gateway WebSocket
- 改由本地 `server.js` 通过 OpenClaw 已安装的 Gateway helper 调用网关
- 使用稳定桌宠会话（默认 `lobster:desktop`）
- 重置会话时生成新的桌宠会话 key

这是一条更适合软件阶段和未来硬件接入的路线。

---

## 目录结构

- `index.html`：桌宠主界面（状态面板 + 聊天面板）
- `server.js`：本地 bridge 服务
- `data/state.json`：本地状态与桌宠会话信息
- `openclaw-plugin/lobster-status/`：OpenClaw 插件
- `DEVELOPMENT_ROADMAP.md`：长期版本路线图
- `启动.bat`：启动本地服务并打开页面
- `enable-openclaw-live.bat`：把插件接入 OpenClaw 并重启 Gateway

---

## 如何启动

### 方式 1：直接启动桌宠本地页
双击：
- `启动.bat`

或手动运行：
```bash
node server.js
```

然后打开：
- `http://127.0.0.1:8848`

> 注意：不要直接用 `file:///D:/moss-desktop/index.html` 打开页面。应该始终通过本地 bridge 访问。

---

## 如何接入 OpenClaw 实时状态

第一次接入时先运行：
- `enable-openclaw-live.bat`

它会：
1. 把 `openclaw-plugin/lobster-status` 接进 OpenClaw
2. 重启 OpenClaw Gateway

之后再启动本地页即可。

---

## 如何测试 v0.3 聊天 MVP

1. 确保 OpenClaw Gateway 正在运行
2. 启动本地 bridge：`node server.js`
3. 打开 `http://127.0.0.1:8848`
4. 在右侧聊天面板输入一句话发送
5. 观察：
   - 状态从 `idle` → `thinking / replying` → `idle`
   - 聊天面板中出现用户消息和小龙虾回复
   - “新会话”按钮会创建新的桌宠专用 session

聊天 API：
- `GET /api/chat/history`
- `GET /api/chat/stream`
- `POST /api/chat/send`
- `POST /api/chat/reset`

---

## 本地 bridge 设计说明

聊天 bridge 不走浏览器直连 Gateway，原因是：
- 直接浏览器 / 原始 WebSocket 接入容易撞上 origin / device identity 限制
- 纯软件阶段更适合让本地 Node 服务做代理
- 以后接硬件时，也更容易把这层直接复用成统一协议层

当前 bridge 通过 OpenClaw 已安装的内部 helper 调用 Gateway：
- `C:/Users/22414/AppData/Roaming/npm/node_modules/openclaw/dist/call-DTKTDk3E.js`

并从：
- `C:/Users/22414/.openclaw/openclaw.json`

读取网关 token。

---

## 当前仍未完成的 v0.3 项

这版已经能聊天，但还只是 MVP。后续仍建议继续补：
- 更好的流式回复（当前以历史轮询为主）
- 更明确的聊天运行态 / run 状态接口
- 消息中的工具事件折叠显示
- 会话列表 / 最近会话切换
- 更像桌宠而不是网页聊天框的 UI 体验

---

## 下一步推荐

优先继续推进：
1. 聊天流式体验优化
2. 桌宠动作 / 表情系统
3. 场景系统
4. 语音输入输出
5. 多设备 / 硬件协议抽象

详见：
- `DEVELOPMENT_ROADMAP.md`

---

## 协作方式

以后可以直接基于路线图推进，例如：
- “按路线图继续做 v0.3”
- “把聊天轮询升级成流式”
- “先做动作系统，不做语音”
- “对照路线图检查当前进度”

默认偏好：
- 写代码和审代码时，优先调用 Codex
- 大功能按阶段推进
- 先保证闭环，再加花活
