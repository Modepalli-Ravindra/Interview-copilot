#!/bin/sh
# Supervisor for the single-container Render deploy.
# Starts OmniRoute (:20128, internal AI gateway) and the InterviewPilot
# backend ($PORT, public) in one process tree, forwards signals, and
# restarts a child if it exits.
set -eu

# OmniRoute always stays internal on 20128.
OMNIROUTE_PORT=20128
# Render free = 512MB total RAM. Cap OmniRoute's V8 heap (image default 1024
# would OOM). Override via env if you tune it on a paid instance.
OMNIROUTE_MEMORY_MB="${OMNIROUTE_MEMORY_MB:-320}"
# Backend public port: Render injects PORT (e.g. 10000). Local fallback 3000.
BACKEND_PORT="${PORT:-3000}"
# Backend gets a modest heap; the rest of the 512MB belongs to OmniRoute.
BACKEND_MEMORY_MB="${BACKEND_MEMORY_MB:-96}"

echo "[supervisor] starting OmniRoute on :${OMNIROUTE_PORT} (heap ${OMNIROUTE_MEMORY_MB}MB)"
(
  cd /app
  export PORT="${OMNIROUTE_PORT}"
  export NODE_OPTIONS="--max-old-space-size=${OMNIROUTE_MEMORY_MB}"
  exec node dev/run-standalone.mjs
) &
OMNI_PID=$!

# Give OmniRoute a beat to bind before the backend starts calling it.
# (The provider router also retries and falls back to mock, so early
# requests never break.)
sleep 2

echo "[supervisor] starting InterviewPilot backend on :${BACKEND_PORT}"
(
  cd /app/interviewpilot
  export PORT="${BACKEND_PORT}"
  export NODE_OPTIONS="--max-old-space-size=${BACKEND_MEMORY_MB}"
  exec node dist/server.js
) &
BACKEND_PID=$!

shutdown() {
  echo "[supervisor] shutting down..."
  kill -TERM "$OMNI_PID" "$BACKEND_PID" 2>/dev/null || true
  wait "$OMNI_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

# Keep both alive; restart any child that exits (Render itself restarts the
# container too, but a self-healing supervisor avoids downtime between polls).
while :; do
  if ! kill -0 "$OMNI_PID" 2>/dev/null; then
    echo "[supervisor] OmniRoute exited; restarting"
    (
      cd /app
      export PORT="${OMNIROUTE_PORT}"
      export NODE_OPTIONS="--max-old-space-size=${OMNIROUTE_MEMORY_MB}"
      exec node dev/run-standalone.mjs
    ) &
    OMNI_PID=$!
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "[supervisor] backend exited; restarting"
    (
      cd /app/interviewpilot
      export PORT="${BACKEND_PORT}"
      export NODE_OPTIONS="--max-old-space-size=${BACKEND_MEMORY_MB}"
      exec node dist/server.js
    ) &
    BACKEND_PID=$!
  fi
  sleep 3
done
