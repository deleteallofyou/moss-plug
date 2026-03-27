@echo off
setlocal
cd /d "%~dp0"
echo [moss-desktop] 正在启动本地状态服务...
echo [moss-desktop] 如果 OpenClaw 真联动已接好，将优先读取 /lobster/status；否则自动回退到本地模拟。
start "moss-desktop-server" cmd /k node server.js
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:8848
echo [moss-desktop] 已尝试打开浏览器： http://127.0.0.1:8848
echo 如果浏览器没有自动打开，请手动访问上面的地址。
endlocal
