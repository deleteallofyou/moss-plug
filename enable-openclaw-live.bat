@echo off
setlocal
cd /d "%~dp0"
echo [moss-desktop] 正在把 lobster-status 插件链接到 OpenClaw...
openclaw plugins install -l "%~dp0openclaw-plugin\lobster-status"
if errorlevel 1 (
  echo [moss-desktop] 插件链接失败，请先确认 openclaw 命令可用。
  exit /b 1
)

echo [moss-desktop] 正在重启 OpenClaw Gateway...
openclaw gateway restart
if errorlevel 1 (
  echo [moss-desktop] Gateway 重启失败，请手动执行：openclaw gateway restart
  exit /b 1
)

echo [moss-desktop] 真联动安装完成。
echo [moss-desktop] 现在你可以双击 启动.bat，然后打开 http://127.0.0.1:8848
echo [moss-desktop] 健康检查： http://127.0.0.1:18789/lobster/health
endlocal
