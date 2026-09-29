#!/usr/bin/env bash
# Lifecycle helper for the verify-hammer-web skill.
#
# Usage:
#   verify.sh start [port]   # start OUR OWN expo web instance (default port 8082), wait until ready
#   verify.sh doctor [port]  # read-only health check of OUR instance
#   verify.sh stop  [port]   # stop OUR instance (process group from pidfile), wait for port to free
#
# Never kills by process name. Only ever touches the process group recorded in its own pidfile,
# so it cannot harm an instance the user started (e.g. `bun run web` on port 8081).
set -euo pipefail

usage() { echo "usage: verify.sh start|doctor|stop [port]" >&2; exit 2; }
cmd="${1:-}"; [ $# -ge 1 ] && shift || usage
PORT="${1:-8082}"
PIDFILE="/tmp/hammer-web-verify-${PORT}.pid"
LOGFILE="/tmp/hammer-web-verify-${PORT}.log"
URL="http://localhost:${PORT}"
# Script lives at <repo>/.agents/skills/verify-hammer-web/helpers/verify.sh
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

listener_pid() { ss -tlnp 2>/dev/null | grep ":${PORT} " | sed -n 's/.*pid=\([0-9]*\),.*/\1/p' | head -1; }
port_busy() { ss -tln 2>/dev/null | grep -q ":${PORT} "; }

case "$cmd" in
  start)
    if port_busy; then
      echo "FAIL: port ${PORT} already in use (possibly the user's instance) — pick another port, do NOT attach to it" >&2
      exit 1
    fi
    cd "$ROOT"
    setsid bunx expo start --web --port "$PORT" >"$LOGFILE" 2>&1 &
    echo $! > "$PIDFILE"
    for _ in $(seq 1 120); do
      if grep -q "Waiting on ${URL}" "$LOGFILE" 2>/dev/null; then
        echo "ready: ${URL} (pid $(cat "$PIDFILE"), log ${LOGFILE})"
        exit 0
      fi
      sleep 1
    done
    echo "FAIL: metro not ready after 120s; log: ${LOGFILE}" >&2
    exit 1
    ;;
  doctor)
    fail=0
    if curl -sf "$URL" | grep -q "<title>Hammer</title>"; then
      echo "ok: ${URL} serves the Hammer index"
    else
      echo "FAIL: no Hammer index at ${URL}" >&2; fail=1
    fi
    pid="$(cat "$PIDFILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "ok: recorded instance running (pid ${pid})"
    else
      echo "FAIL: no instance recorded at ${PIDFILE} — this server was not started by verify.sh" >&2; fail=1
    fi
    listener="$(listener_pid || true)"
    if [ -n "${listener:-}" ] && [ -n "$pid" ]; then
      our_g="$(ps -o pgid= -p "$pid" | tr -d ' ')"
      lis_g="$(ps -o pgid= -p "$listener" | tr -d ' ')"
      if [ "$our_g" = "$lis_g" ]; then
        echo "ok: port ${PORT} owned by our process group (listener pid ${listener})"
      else
        echo "FAIL: port ${PORT} is owned by foreign process (listener pid ${listener}, pgid ${lis_g:-?} != ${our_g:-?})" >&2; fail=1
      fi
    else
      echo "FAIL: nothing listening on port ${PORT}" >&2; fail=1
    fi
    if [ -f "$LOGFILE" ] && grep -q "Waiting on ${URL}" "$LOGFILE"; then
      echo "ok: metro log reports ready"
    else
      echo "FAIL: metro log missing ready line (${LOGFILE})" >&2; fail=1
    fi
    exit "$fail"
    ;;
  stop)
    pid="$(cat "$PIDFILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      pgid="$(ps -o pgid= -p "$pid" | tr -d ' ')"
      kill -- "-${pgid}" 2>/dev/null || true
    fi
    rm -f "$PIDFILE"
    for _ in $(seq 1 15); do
      port_busy || { echo "stopped; port ${PORT} free"; exit 0; }
      sleep 1
    done
    echo "WARN: port ${PORT} still in use after stop" >&2
    exit 1
    ;;
  *) usage ;;
esac
