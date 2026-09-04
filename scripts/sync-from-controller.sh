#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if /usr/bin/env node "$ROOT/scripts/sync.js"; then
  osascript -e 'display notification "Pads aktualisiert" with title "Soundboard"'
else
  osascript -e 'display notification "Sync fehlgeschlagen — Log im Terminal" with title "Soundboard"'
  exit 1
fi
