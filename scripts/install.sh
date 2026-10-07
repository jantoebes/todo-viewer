#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$PROJECT_DIR/data"
STATE_DIR="$PROJECT_DIR/.state"
LABEL="todo-viewer"

while [ $# -gt 0 ]; do
  case "$1" in
    --data-dir) DATA_DIR="$2"; shift 2 ;;
    --state-dir) STATE_DIR="$2"; shift 2 ;;
    *) echo "Usage: $0 [--data-dir <dir>] [--state-dir <dir>]" >&2; exit 1 ;;
  esac
done

cd "$PROJECT_DIR"
echo "== todo-viewer install ($PROJECT_DIR) =="

if command -v fnm >/dev/null 2>&1; then
  fnm install "$(cat .node-version)" >/dev/null 2>&1 || true
  eval "$(fnm env)"
  fnm use "$(cat .node-version)"
fi
echo "Node: $(node --version)"

npm ci
npm run build
mkdir -p "$DATA_DIR" "$STATE_DIR"

PLIST_DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs"
mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
sed -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
    -e "s|__NODE__|$(command -v node)|g" \
    -e "s|__DATA_DIR__|$DATA_DIR|g" \
    -e "s|__STATE_DIR__|$STATE_DIR|g" \
    -e "s|__LOG_DIR__|$LOG_DIR|g" \
    launchd/todo-viewer.plist.template >"$PLIST_DEST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DEST"
launchctl enable "gui/$(id -u)/$LABEL"

echo ""
echo "Done: http://localhost:${PORT:-4243}"
echo "Data:  $DATA_DIR"
echo "State: $STATE_DIR"
echo "Logs:  $LOG_DIR/todo-viewer.log"
