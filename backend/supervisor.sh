#!/bin/sh
# Supervisor for the single-container Render deploy (explicit PID 1).
#
# Starts OmniRoute (:20128, internal AI gateway) and the InterviewPilot
# backend ($PORT, public) in one process tree, forwards SIGTERM/SIGINT,
# reaps children (no zombies), restarts a child that exits, and FAILS the
# container (non-zero exit) when the backend cannot stay alive so Render
# surfaces a clear error instead of a silent crash loop.
#
# SAFETY: this script only ever prints the NAMES of secrets (set/unset),
# never their values. It never prints JWT_SECRET, SUPABASE_* keys,
# S3 secrets or AI credentials.

# OmniRoute always stays internal on 20128.
OMNIROUTE_PORT=20128
# Render free = 512MB total RAM. Cap OmniRoute's V8 heap (image default 1024
# would OOM). Override via env if you tune it on a paid instance.
OMNIROUTE_MEMORY_MB="${OMNIROUTE_MEMORY_MB:-320}"
# Backend public port: Render injects PORT (e.g. 10000). Local fallback 3000.
BACKEND_PORT="${PORT:-3000}"
# Backend gets a modest heap; the rest of the 512MB belongs to OmniRoute.
BACKEND_MEMORY_MB="${BACKEND_MEMORY_MB:-96}"
# Fail-fast guard: if the backend exits within this many seconds of starting,
# MAX times in a row, the supervisor gives up and exits non-zero.
BACKEND_MIN_UP_SECONDS="${BACKEND_MIN_UP_SECONDS:-10}"
BACKEND_MAX_FAST_FAILS="${BACKEND_MAX_FAST_FAILS:-3}"
# Give OmniRoute a beat to bind before the backend starts calling it.
OMNIROUTE_START_SLEEP="${OMNIROUTE_START_SLEEP:-2}"

echo "[supervisor] script started"
echo "[supervisor] current user: $(id -un 2>/dev/null || echo unknown) (uid $(id -u 2>/dev/null || echo '?'))"
echo "[supervisor] working directory: $(pwd 2>/dev/null || echo '?')"
echo "[supervisor] PORT=${BACKEND_PORT} OMNIROUTE_PORT=${OMNIROUTE_PORT}"
echo "[supervisor] heap: omniroute=${OMNIROUTE_MEMORY_MB}MB backend=${BACKEND_MEMORY_MB}MB"
echo "[supervisor] env presence: JWT_SECRET=$([ -n "${JWT_SECRET:-}" ] && echo set || echo unset) FRONTEND_URL=$([ -n "${FRONTEND_URL:-}" ] && echo set || echo unset) SUPABASE_URL=$([ -n "${SUPABASE_URL:-}" ] && echo set || echo unset) SUPABASE_KEY=$([ -n "${SUPABASE_KEY:-}" ] && echo set || echo unset) SUPABASE_SERVICE_ROLE_KEY=$([ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && echo set || echo unset) SUPABASE_S3_ACCESS_KEY=$([ -n "${SUPABASE_S3_ACCESS_KEY:-}" ] && echo set || echo unset) SUPABASE_S3_SECRET_KEY=$([ -n "${SUPABASE_S3_SECRET_KEY:-}" ] && echo set || echo unset) OMNIROUTE_URL=$([ -n "${OMNIROUTE_URL:-}" ] && echo set || echo unset)"

echo "[supervisor] checking OmniRoute runtime: /app/dev/run-standalone.mjs $([ -f /app/dev/run-standalone.mjs ] && echo present || echo MISSING)"
echo "[supervisor] checking backend runtime: /app/interviewpilot/dist/server.js $([ -f /app/interviewpilot/dist/server.js ] && echo present || echo MISSING)"
echo "[supervisor] checking backend deps: /app/interviewpilot/node_modules $([ -d /app/interviewpilot/node_modules ] && echo present || echo MISSING)"

echo "[supervisor] starting OmniRoute on :${OMNIROUTE_PORT}"
(
  cd /app || exit 1
  export PORT="${OMNIROUTE_PORT}"
  export NODE_OPTIONS="--max-old-space-size=${OMNIROUTE_MEMORY_MB}"
  exec node dev/run-standalone.mjs
) &
OMNI_PID=$!
echo "[supervisor] OmniRoute PID ${OMNI_PID}"

sleep "${OMNIROUTE_START_SLEEP}"

echo "[supervisor] starting InterviewPilot backend on :${BACKEND_PORT}"
(
  cd /app/interviewpilot || exit 1
  export PORT="${BACKEND_PORT}"
  export NODE_OPTIONS="--max-old-space-size=${BACKEND_MEMORY_MB}"
  exec node dist/server.js
) &
BACKEND_PID=$!
echo "[supervisor] backend PID ${BACKEND_PID}"
BACKEND_START_TS=$(date +%s 2>/dev/null || echo 0)

# Bounded, non-fatal OmniRoute connectivity check. Logs the result so Render
# shows whether the AI gateway is up; never affects the container exit code.
echo "[supervisor] checking OmniRoute connectivity (bounded, non-fatal)"
sleep 5
node -e '
  fetch("http://127.0.0.1:20128/v1/models", { signal: AbortSignal.timeout(3000) })
    .then((r) => {
      console.log("[supervisor] OmniRoute reachable (HTTP " + r.status + ")");
      process.exit(0);
    })
    .catch((e) => {
      const why = (e && e.cause && e.cause.code) || (e && e.message) || "unknown";
      console.log("[supervisor] OmniRoute not reachable yet: " + why + " (backend will retry per request)");
      process.exit(1);
    });
' || echo "[supervisor] OmniRoute not ready at startup check (non-fatal)"

shutdown() {
  echo "[supervisor] shutting down..."
  kill -TERM "$OMNI_PID" "$BACKEND_PID" 2>/dev/null || true
  wait "$OMNI_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
  echo "[supervisor] shutdown complete"
  exit 0
}
trap shutdown TERM INT

BACKEND_FAST_FAILS=0

# Keep both alive; restart any child that exits. Backend gets a bounded
# restart budget; OmniRoute is internal, so it restarts indefinitely but its
# exit codes are logged for visibility.
while :; do
  if ! kill -0 "$OMNI_PID" 2>/dev/null; then
    OMNI_EXIT=0
    wait "$OMNI_PID" 2>/dev/null
    OMNI_EXIT=$?
    echo "[supervisor] child exit code: OmniRoute exited with ${OMNI_EXIT}; restarting"
    sleep 2
    (
      cd /app || exit 1
      export PORT="${OMNIROUTE_PORT}"
      export NODE_OPTIONS="--max-old-space-size=${OMNIROUTE_MEMORY_MB}"
      exec node dev/run-standalone.mjs
    ) &
    OMNI_PID=$!
    echo "[supervisor] OmniRoute PID ${OMNI_PID}"
  fi

  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    BACKEND_EXIT=0
    wait "$BACKEND_PID" 2>/dev/null
    BACKEND_EXIT=$?
    echo "[supervisor] child exit code: backend exited with ${BACKEND_EXIT}"

    now=$(date +%s 2>/dev/null || echo 0)
    elapsed=999
    if [ "${BACKEND_START_TS:-0}" -gt 0 ] && [ "$now" -gt 0 ]; then
      elapsed=$((now - BACKEND_START_TS))
    fi
    if [ "$elapsed" -lt "$BACKEND_MIN_UP_SECONDS" ]; then
      BACKEND_FAST_FAILS=$((BACKEND_FAST_FAILS + 1))
    else
      BACKEND_FAST_FAILS=0
    fi
    echo "[supervisor] backend fast-fail count ${BACKEND_FAST_FAILS}/${BACKEND_MAX_FAST_FAILS} (last uptime ${elapsed}s, limit ${BACKEND_MIN_UP_SECONDS}s)"

    if [ "$BACKEND_FAST_FAILS" -ge "$BACKEND_MAX_FAST_FAILS" ]; then
      if [ "$BACKEND_EXIT" -eq 0 ]; then
        BACKEND_EXIT=1
      fi
      echo "[supervisor] backend cannot stay alive; exiting with code ${BACKEND_EXIT}"
      exit "$BACKEND_EXIT"
    fi

    echo "[supervisor] restarting backend"
    sleep 2
    (
      cd /app/interviewpilot || exit 1
      export PORT="${BACKEND_PORT}"
      export NODE_OPTIONS="--max-old-space-size=${BACKEND_MEMORY_MB}"
      exec node dist/server.js
    ) &
    BACKEND_PID=$!
    BACKEND_START_TS=$(date +%s 2>/dev/null || echo 0)
    echo "[supervisor] backend PID ${BACKEND_PID}"
  fi

  sleep 3
done
