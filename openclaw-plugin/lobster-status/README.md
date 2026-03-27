# lobster-status v0.2

`lobster-status` 现在不只是“给网页读一下 OpenClaw 当前状态”的小插件了，
而是一个面向 **桌面桌宠 / 浏览器面板 / 未来实体桌宠硬件** 的轻量桥接层。

## v0.2 做了什么

- 继续监听 OpenClaw hook 事件
- 保留：`GET /lobster/status`
- 保留：`GET /lobster/health`
- 新增：`GET /lobster/stream`（SSE 实时状态流）
- 新增：`POST /lobster/device-event`（桌宠 / 前端 / 硬件事件上报）
- 状态存储从单一快照升级为：
  - `runtimeSnapshot`
  - `devices`
  - `recentDeviceEvents`
  - `activeScene`（预留给未来实体桌宠动作编排）

## 为什么这样设计

这版的目标是把通信路径变成：

```text
OpenClaw ↔ lobster-status 插件 ↔ 桌面前端 / 实体桌宠
```

这样未来不管你接的是：
- 浏览器桌宠
- 常驻任务栏挂件
- USB 小屏
- ESP32 / 树莓派 / 带灯光动作的实体桌宠

都能共用同一套状态协议。

## API

### 1) 读取当前状态

- `GET /lobster/status`

返回 v2 状态载荷，兼容旧版基础字段，并补充：
- `runtimeSnapshot`
- `devices`
- `recentDeviceEvents`
- `device`
- `lastDeviceEvent`
- `activeScene`
- `streamPath`
- `deviceEventPath`
- `sseEnabled`

### 2) 健康检查

- `GET /lobster/health`

### 3) 实时状态流

- `GET /lobster/stream`

SSE 事件：
- `status`
- `device_event`

### 4) 设备事件上报

- `POST /lobster/device-event`

首批白名单事件：
- `page_load`
- `visibility_change`
- `pet_click`
- `heartbeat`

示例：

```json
{
  "deviceId": "lobster-desktop-01",
  "event": "pet_click",
  "deviceName": "moss 桌面页",
  "source": "index.html"
}
```

## 配置项

```json5
{
  plugins: {
    entries: {
      "lobster-status": {
        enabled: true,
        config: {
          routePath: "/lobster/status",
          healthPath: "/lobster/health",
          streamPath: "/lobster/stream",
          deviceEventPath: "/lobster/device-event",
          readToken: "optional-read-token",
          writeToken: "optional-write-token",
          thinkingTtlMs: 360000,
          replyingTtlMs: 20000,
          eventQueueLimit: 100,
          enableSse: true,
          writeLocalhostOnly: true,
          deviceName: "lobster-display"
        }
      }
    }
  }
}
```

## 安全建议

- `readToken` 和 `writeToken` 分开
- 设备写入默认只允许 localhost
- `plugins.allow` 显式信任 `lobster-status`
- 队列做上限，避免设备端刷爆事件

## 下一步（v0.3 方向）

下一版很适合往“实体桌宠”继续长：

- `lobster_set_scene` / `lobster_push_note` 这类插件工具
- 动作场景（开心、思考、睡眠、提醒）
- 多设备同步
- 硬件状态灯、动作舵机、表情屏接入

如果你后面要把它接到实体桌宠，这个 v0.2 结构已经是对的：
**OpenClaw 提供语义状态，设备侧只负责表现和回传交互。**
