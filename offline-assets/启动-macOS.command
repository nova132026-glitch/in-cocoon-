#!/bin/zsh
cd "$(dirname "$0")" || exit 1
if command -v ruby >/dev/null 2>&1; then
  (sleep 1; open "http://127.0.0.1:4173") &
  exec ruby -run -e httpd . -p 4173 -b 127.0.0.1
fi
if command -v python3 >/dev/null 2>&1; then
  (sleep 1; open "http://127.0.0.1:4173") &
  exec python3 -m http.server 4173 --bind 127.0.0.1
fi
echo "没有找到系统自带的本地服务工具，请直接双击 index.html。"
read -k 1 "?按任意键退出。"
