#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
PORT=${1:-8000}
PY="python3"; command -v python3 &>/dev/null || PY="python"
if ! command -v $PY &>/dev/null; then echo "[خطا] python پیدا نشد"; exit 1; fi
echo "هم‌نگار — http://localhost:$PORT/"
echo "پوشه: $(pwd)"
sleep 1
if command -v xdg-open &>/dev/null; then xdg-open "http://localhost:$PORT/" &
elif command -v open &>/dev/null; then open "http://localhost:$PORT/" &
fi
exec $PY -m http.server "$PORT"
