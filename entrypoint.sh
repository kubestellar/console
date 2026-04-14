#!/bin/sh
# Container entrypoint: starts backend on port 8081 with watchdog on port 8080.
# The watchdog serves a "Reconnecting..." page if the backend crashes or restarts.
# The shell stays as PID 1 so the signal trap can cleanly stop both processes.
#
# NOTE: This script must be POSIX-compatible because the runtime image is
# Alpine, which ships BusyBox ash (no bash). Do not use bashisms like
# `wait -n`, `[[ ]]`, or arrays.

BACKEND_PORT=${BACKEND_PORT:-8081}

# Start backend in the background
BACKEND_PORT=$BACKEND_PORT ./console &
BACKEND_PID=$!

# Start watchdog in the background
./console --watchdog --backend-port "$BACKEND_PORT" &
WATCHDOG_PID=$!

# Trap signals to forward to children and clean up
cleanup() {
    kill "$WATCHDOG_PID" 2>/dev/null
    kill "$BACKEND_PID" 2>/dev/null
    wait "$WATCHDOG_PID" 2>/dev/null
    wait "$BACKEND_PID" 2>/dev/null
    exit 0
}
trap cleanup INT TERM

# POSIX-sh: poll for either child to exit, since `wait -n` is a bashism not
# available in Alpine's BusyBox ash. 500ms poll keeps CPU usage negligible.
# CHILD_POLL_SEC: seconds between liveness checks for backend + watchdog.
CHILD_POLL_SEC=0.5
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$WATCHDOG_PID" 2>/dev/null; do
    sleep "$CHILD_POLL_SEC"
done
cleanup
