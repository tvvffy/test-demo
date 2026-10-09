#!/bin/bash
# 双击运行教辅工作管理（macOS）
cd "$(dirname "$0")" || exit 1

pause_and_exit() {
  echo
  read -n 1 -s -r -p "按任意键关闭这个窗口"
  echo
  exit "${1:-1}"
}

if ! command -v node >/dev/null 2>&1; then
  echo "没有找到 Node.js。"
  echo "请先打开 https://nodejs.org/zh-cn 下载并安装 LTS 版本，装好后再双击这个文件。"
  pause_and_exit 1
fi

if ! npm ls >/dev/null 2>&1; then
  echo "第一次运行，正在安装需要的组件，大约一两分钟，请保持联网……"
  echo
  if ! npm install --no-audit --no-fund --registry=https://registry.npmmirror.com; then
    echo
    echo "安装没有成功。请把这个窗口截图发给我。"
    pause_and_exit 1
  fi
fi

echo
echo "正在启动，浏览器会自动打开 http://localhost:3000"
echo "使用期间不要关闭这个窗口；用完直接关掉它就行。"
echo
OPEN_BROWSER=1 node --disable-warning=ExperimentalWarning server/index.js
pause_and_exit $?
