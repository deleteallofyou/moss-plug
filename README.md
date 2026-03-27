# moss-desktop

这是一个桌面状态终端原型。

现在它已经不是“纯本地假状态”了，而是升级成了：

- `http://127.0.0.1:8848` 继续作为本地桌面页面入口
- `server.js` 继续负责本地静态页面和桥接接口
- `/api/status` 会**优先读取 OpenClaw 真状态**
- 如果 OpenClaw 插件还没接好，才会**自动回退到本地模拟状态**

这样你不用改使用习惯，也不用在页面和 OpenClaw 之间直接处理跨域。

---

## 目录说明

- `index.html`：桌面状态 UI
- `server.js`：本地桥接服务（优先代理 OpenClaw 真状态）
- `启动.bat`：一键启动本地页面服务并打开浏览器
- `enable-openclaw-live.bat`：一键把 `lobster-status` 插件接进 OpenClaw
- `data/state.json`：本地模拟状态存档（作为回退源）
- `openclaw-plugin/lobster-status/`：OpenClaw 真状态插件

---

## 最快打开方式

### 只看页面 / 本地模拟模式

直接双击：

- `启动.bat`

然后浏览器访问：

- `http://127.0.0.1:8848`

如果 OpenClaw 真联动还没接好，页面会自动回退到本地模拟状态。

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

此时页面会优先读取：

- `http://127.0.0.1:18789/lobster/status`

健康检查：

- `http://127.0.0.1:18789/lobster/health`

---

## 真联动接好后的状态逻辑

插件会监听这些 OpenClaw 事件：

- `gateway:startup`
- `message:received`
- `message:sent`
- `command:new`
- `command:reset`
- `command:stop`

桌面页会把它们映射成：

- 空闲中
- 思考中
- 回复中
- 休眠中

---

## 本地桥接服务的工作方式

`server.js` 现在是一个“桥接层”：

- `GET /api/status`：优先拉取 OpenClaw 真状态；失败时回退到本地模拟状态
- `GET /api/health`：返回本地服务健康情况，同时带上 OpenClaw 真联动探测结果
- `GET /api/bridge`：查看当前桥接状态
- `POST /api/mode` / `POST /api/state` / `POST /api/event`：继续保留本地模拟能力，方便 UI 调试

所以这套结构很适合后面继续扩展：

- 桌面网页版
- 树莓派小屏版
- 硬件外壳版
- 其他设备只要会读 HTTP JSON，都可以直接接

---

## 可选环境变量

如果你的 OpenClaw 不是默认本机地址，可以在启动 `server.js` 之前设置：

- `OPENCLAW_BASE_URL`，默认 `http://127.0.0.1:18789`
- `OPENCLAW_STATUS_PATH`，默认 `/lobster/status`
- `OPENCLAW_HEALTH_PATH`，默认 `/lobster/health`
- `OPENCLAW_READ_TOKEN`，默认留空

示例：

```bat
set OPENCLAW_BASE_URL=http://192.168.1.5:18789
node server.js
```

---

## 下一步建议

下一步可以继续做这几件事：

1. 给页面加“当前数据源”提示（真联动 / 本地回退）
2. 给插件补更细的状态维度（如工具调用中 / 出错中 / 静默中）
3. 做成树莓派常驻小屏版本
4. 补一个插件配置项，让不同设备可以读不同 route 或 token
