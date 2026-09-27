#!/usr/bin/env bash
# verify-hammer tap — tap a clickable element by accessible label, no coordinates.
# Usage:
#   helpers/tap.sh "Testnet"                  # tap the match
#   helpers/tap.sh "Connect Wallet" --check   # report the match WITHOUT tapping (readiness probe)
# Matching (clickable nodes only): exact content-desc > contained text > substring match; ties go
# to the smallest bounds (specific beats container). Prints what it matched, or all clickable
# labels on screen when nothing matches.
set -eu
[ $# -ge 1 ] || { sed -n '2,7p' "$0"; exit 2; }
QUERY=$1
MODE=${2:-}
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

adb shell uiautomator dump --compressed /sdcard/hammer-ui.xml >/dev/null 2>&1
adb shell cat /sdcard/hammer-ui.xml > /tmp/hammer-ui-dump.xml

MATCH=$(python3 "$SCRIPT_DIR/tap_match.py" "$QUERY" /tmp/hammer-ui-dump.xml) || exit 1

CX=$(echo "$MATCH" | awk '{print $1}')
CY=$(echo "$MATCH" | awk '{print $2}')
LABEL=$(echo "$MATCH" | cut -d' ' -f3-)

if [ "$MODE" = "--check" ]; then
  echo "FOUND: $LABEL"
  exit 0
fi

adb shell input tap "$CX" "$CY"
echo "tapped ($CX,$CY) -> $LABEL"
