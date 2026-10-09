@echo off
chcp 65001 >nul
title 教辅工作管理
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 没有找到 Node.js。
  echo 请先打开 https://nodejs.org/zh-cn 下载并安装 LTS 版本，装好后再双击这个文件。
  echo.
  pause
  exit /b 1
)

call npm ls >nul 2>nul
if errorlevel 1 (
  echo 第一次运行，正在安装需要的组件，大约一两分钟，请保持联网……
  echo.
  call npm install --no-audit --no-fund --registry=https://registry.npmmirror.com
  if errorlevel 1 (
    echo.
    echo 安装没有成功。请把这个窗口截图发给我。
    echo.
    pause
    exit /b 1
  )
)

echo.
echo 正在启动，浏览器会自动打开 http://localhost:3000
echo 使用期间不要关闭这个窗口；用完直接关掉它就行。
echo.
set OPEN_BROWSER=1
node --disable-warning=ExperimentalWarning server\index.js
echo.
pause
