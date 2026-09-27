#!/usr/bin/env bash
# verify-hammer capture — save proof artifacts (screenshot + UI dump) under one name.
# Usage: helpers/capture.sh artifacts/cluster-selection/02-testnet-selected
# Files land next to this script's skill dir: .agents/skills/verify-hammer/<name>.png / <name>.ui.xml
# These files are the proof — cleanup must never delete them.
set -eu
[ $# -eq 1 ] || { sed -n '2,5p' "$0"; exit 2; }
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
OUT="$SCRIPT_DIR/../$1"
mkdir -p "$(dirname "$OUT")"

adb exec-out screencap -p > "$OUT.png"
adb shell uiautomator dump --compressed /sdcard/hammer-ui.xml >/dev/null 2>&1
adb shell cat /sdcard/hammer-ui.xml > "$OUT.ui.xml"

echo "captured:"
echo "  $OUT.png"
echo "  $OUT.ui.xml"
