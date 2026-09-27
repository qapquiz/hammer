#!/usr/bin/env bash
# verify-hammer launch — bring up Metro + the Hammer dev-client session on the emulator.
# Idempotent: reuses Metro already answering on 8081; starts tmux session 'metro-verify' otherwise.
# Safe to re-run: each run restarts the JS session (force-stop + deep link) for a fresh bundle.
set -eu
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)
SESSION=metro-verify

if [ "$(curl -s --max-time 2 http://localhost:8081/status 2>/dev/null || true)" != "packager-status:running" ]; then
  if command -v tmux >/dev/null 2>&1; then
    tmux has-session -t "$SESSION" 2>/dev/null && tmux kill-session -t "$SESSION" || true
    tmux new-session -d -s "$SESSION" -c "$REPO" "npm run dev"
    echo "Metro starting in tmux session '$SESSION' (attach: tmux attach -t $SESSION)"
  else
    (cd "$REPO" && nohup npm run dev >/tmp/hammer-metro.log 2>&1 &)
    echo "Metro starting in background (log: /tmp/hammer-metro.log)"
  fi
  for _ in $(seq 1 90); do
    [ "$(curl -s --max-time 2 http://localhost:8081/status 2>/dev/null || true)" = "packager-status:running" ] && break
    sleep 1
  done
fi

[ "$(curl -s --max-time 2 http://localhost:8081/status 2>/dev/null || true)" = "packager-status:running" ] || {
  echo "ERROR: Metro did not come up on 8081"
  exit 1
}
echo "PASS: Metro on 8081"

[ "$(adb get-state 2>/dev/null)" = "device" ] || { echo "ERROR: no device attached — boot the 'solana-mobile' AVD first"; exit 1; }

# Route the emulator's localhost:8081 to the host's Metro. Without this the dev client
# can hang on a stale "Bundling NN%..." bar.
adb reverse tcp:8081 tcp:8081 >/dev/null

# Restart the JS session via the dev-client deep link (cold `am start` lands on the
# dev-client launcher instead of the app session).
adb shell am force-stop com.anonymous.hammer
adb shell am start -a android.intent.action.VIEW \
  -d "exp+hammer://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081" \
  com.anonymous.hammer >/dev/null

echo "Session requested. First bundle takes ~60s; poll readiness with:"
echo "  helpers/tap.sh 'Connect Wallet' --check"
