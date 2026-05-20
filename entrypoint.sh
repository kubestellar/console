#!/bin/sh
# Container entrypoint: starts backend on port 8081 with watchdog on port 8080.
# The watchdog serves a "Reconnecting..." page if the backend crashes or restarts.
# The shell stays as PID 1 so the signal trap can cleanly stop both processes.
#
# NOTE: This script must be POSIX-compatible because the runtime image is
# Alpine, which ships BusyBox ash (no bash). Do not use bashisms like
# `wait -n`, `[[ ]]`, or arrays.

BACKEND_PORT=${BACKEND_PORT:-8081}

# Log file on persistent volume for post-mortem debugging (survives pod deletion).
CRASH_LOG="${DATABASE_PATH%/*}/crash.log"

log_crash() {
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*" >> "$CRASH_LOG" 2>/dev/null
    echo "$*" >&2
}

# Start backend in the background
BACKEND_PORT=$BACKEND_PORT ./console &
BACKEND_PID=$!

# Start watcher in the background
./kc-watcher --backend-port "$BACKEND_PORT" &
WATCHDOG_PID=$!

# Trap signals to forward to children and clean up
EXIT_CODE=0
cleanup() {
    kill "$WATCHDOG_PID" 2>/dev/null
    kill "$BACKEND_PID" 2>/dev/null
    wait "$WATCHDOG_PID" 2>/dev/null
    wait "$BACKEND_PID" 2>/dev/null
    exit "$EXIT_CODE"
}
trap cleanup INT TERM

# POSIX-sh: poll for either child to exit, since `wait -n` is a bashism not
# available in Alpine's BusyBox ash. 500ms poll keeps CPU usage negligible.
# CHILD_POLL_SEC: seconds between liveness checks for backend + watchdog.
CHILD_POLL_SEC=0.5
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$WATCHDOG_PID" 2>/dev/null; do
    sleep "$CHILD_POLL_SEC"
done

# Determine which child died and capture its exit code.
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    wait "$BACKEND_PID" 2>/dev/null
    EXIT_CODE=$?
    log_crash "BACKEND EXITED code=$EXIT_CODE pid=$BACKEND_PID"
elif ! kill -0 "$WATCHDOG_PID" 2>/dev/null; then
    wait "$WATCHDOG_PID" 2>/dev/null
    EXIT_CODE=$?
    log_crash "WATCHDOG EXITED code=$EXIT_CODE pid=$WATCHDOG_PID"
fi

# Propagate non-zero exit so K8s sees CrashLoopBackOff instead of "Completed".
if [ "$EXIT_CODE" -eq 0 ]; then
    EXIT_CODE=1
fi
cleanup
