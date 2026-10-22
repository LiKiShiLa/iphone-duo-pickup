#!/bin/bash
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "請先從 https://nodejs.org 安裝 Node.js 20 或更新版本。"
  read -r -p "按 Enter 結束"
  exit 1
fi
(sleep 1; open http://localhost:3000) &
node server.js
