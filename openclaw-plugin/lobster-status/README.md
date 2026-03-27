# lobster-status

这是后续把桌面状态终端接入 OpenClaw 的插件蓝图。

目标：
- 监听 OpenClaw hook 事件
- 暴露 /lobster/status HTTP 接口
- 让桌面端或硬件端读取真实 AI 状态

建议下一步：
1. 先验证 D:\\moss-desktop 的本地原型是否顺眼
2. 再把这个插件目录安装到 OpenClaw
3. 让 index.html 改读 OpenClaw 插件接口，而不是本地 server.js
