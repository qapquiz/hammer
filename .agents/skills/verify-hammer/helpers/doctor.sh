#!/usr/bin/env bash
# verify-hammer doctor — read-only health check. Run this first whenever anything looks off.
# Checks: device attached, Hammer installed, Metro answering on 8081, Hammer in foreground.
set -u
fail=0

command -v adb >/dev/null 2>&1 || { echo "FAIL: adb not on PATH"; exit 1; }

if [ "$(adb get-state 2>/dev/null)" = "device" ]; then
  echo "PASS: device attached ($(adb devices | sed -n '2p' | awk '{print $1}'))"
else
  echo "FAIL: no device/emulator attached — boot the 'solana-mobile' AVD"
  fail=1
fi

if adb shell pm path com.anonymous.hammer >/dev/null 2>&1; then
  echo "PASS: com.anonymous.hammer installed"
else
  echo "FAIL: com.anonymous.hammer not installed — build/install with: npm run android"
  fail=1
fi

status=$(curl -s --max-time 3 http://localhost:8081/status 2>/dev/null || true)
if [ "$status" = "packager-status:running" ]; then
  echo "PASS: Metro answering on localhost:8081"
else
  echo "FAIL: Metro not answering on 8081 — run helpers/launch.sh (starts tmux session 'metro-verify')"
  fail=1
fi

top=$(adb shell dumpsys activity activities 2>/dev/null | grep -o 'topResumedActivity=ActivityRecord{[^ ]* u0 [^ ]*' | awk '{print $NF}')
if [ "$top" = "com.anonymous.hammer/.MainActivity" ]; then
  echo "PASS: Hammer MainActivity is in the foreground"
else
  echo "WARN: foreground activity is '${top:-none}' — the app is not open; run helpers/launch.sh"
fi

exit "$fail"
