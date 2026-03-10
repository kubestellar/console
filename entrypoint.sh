#!/bin/sh
# Container entrypoint: starts backend on port 8081 with watchdog on port 8080.
# The watchdog serves a "Reconnecting..." page if the backend crashes or restarts.
# The shell stays as PID 1 so the signal trap can cleanly stop both processes.

BACKEND_PORT=${BACKEND_PORT:-8081}

# Start backend in the background
BACKEND_PORT=$BACKEND_PORT ./console &
BACKEND_PID=$!

# Start watchdog in the background
./console --watchdog --backend-port "$BACKEND_PORT" &
WATCHDOG_PID=$!

# Trap signals to forward to children and clean up
cleanup() {
    kill $WATCHDOG_PID 2>/dev/null
    kill $BACKEND_PID 2>/dev/null
    wait $WATCHDOG_PID 2>/dev/null
    wait $BACKEND_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

# Wait for either process to exit, then clean up both
wait -n $BACKEND_PID $WATCHDOG_PID 2>/dev/null || wait $BACKEND_PID
cleanup
