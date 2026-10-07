#!/usr/bin/env bash
set -euo pipefail

LABEL="todo-viewer"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "LaunchAgent $LABEL removed. Data and state are left untouched."
