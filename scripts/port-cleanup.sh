#!/bin/bash
# KubeStellar Console — Shared Port Cleanup Utilities
#
# Provides kill_project_port() and verify_port_free() for all startup scripts.
# Source this file: source "$(dirname "$0")/scripts/port-cleanup.sh"
#
# kill_project_port <port> [tcp_state]
#   Finds processes on the given port, kills project-owned ones (matching
#   SCRIPT_DIR, cmd/console, or kc-agent), and warns about unrelated ones.
#
# verify_port_free <port>
#   Returns 0 if the port is available, 1 if still occupied (prints error).

# Maximum seconds to wait for a process to exit after SIGTERM
GRACEFUL_SHUTDOWN_WAIT_SECS=3

# Safely kill a project process on a port. Unrelated processes are warned and
# left running to avoid disrupting non-project services. An optional second
# argument restricts lsof to a TCP state (e.g. "TCP:LISTEN") so watchdog
# outgoing connections are not matched.
kill_project_port() {
    local port="$1"
    local tcp_state="${2:-}"
    local pids

    if [ -n "$tcp_state" ]; then
        pids=$(lsof -ti ":${port}" -s "${tcp_state}" 2>/dev/null || true)
    else
        pids=$(lsof -ti ":${port}" 2>/dev/null || true)
    fi
    [ -z "$pids" ] && return 0

    local to_kill=()
    for pid in $pids; do
        local cmd
        cmd=$(ps -p "$pid" -o args= 2>/dev/null || true)
        # Match project processes by script directory, Go binary path, agent name,
        # or Go temp binaries (go run compiles to /tmp paths like /var/folders/.../exe/console)
        if echo "$cmd" | grep -qF "${SCRIPT_DIR:-__no_match__}" \
           || echo "$cmd" | grep -q "cmd/console" \
           || echo "$cmd" | grep -q "kc-agent" \
           || echo "$cmd" | grep -q "kubestellar.*console" \
           || echo "$cmd" | grep -q "/exe/console"; then
            to_kill+=("$pid")
            echo -e "${YELLOW:-}Stopping stale project process on port ${port} (PID ${pid})...${NC:-}"
            kill -TERM "$pid" 2>/dev/null || true
        else
            echo -e "${YELLOW:-}Warning: Port ${port} is in use by an unrelated process (PID ${pid}: ${cmd:-unknown}). Skipping.${NC:-}"
        fi
    done

    [ ${#to_kill[@]} -eq 0 ] && return 0

    # Wait for graceful shutdown before resorting to SIGKILL
    local waited=0
    while [ $waited -lt $GRACEFUL_SHUTDOWN_WAIT_SECS ]; do
        local all_exited=true
        for pid in "${to_kill[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                all_exited=false
                break
            fi
        done
        if [ "$all_exited" = true ]; then
            return 0
        fi
        sleep 1
        waited=$((waited + 1))
    done

    # Fall back to SIGKILL for project processes that did not exit gracefully
    for pid in "${to_kill[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${YELLOW:-}Force-killing stale process on port ${port} (PID ${pid})...${NC:-}"
            kill -9 "$pid" 2>/dev/null || true
        fi
    done

    # Brief wait for SIGKILL to take effect
    sleep 1
}

# Verify a port is free of PROJECT processes after cleanup. Returns 0 if free
# (or only unrelated processes remain), 1 if a project process still holds it.
# Unrelated processes (e.g., Chrome helpers) are warned but don't block startup.
verify_port_free() {
    local port="$1"
    local tcp_state="${2:-}"
    local pids

    if [ -n "$tcp_state" ]; then
        pids=$(lsof -ti ":${port}" -s "${tcp_state}" 2>/dev/null || true)
    else
        pids=$(lsof -ti ":${port}" 2>/dev/null || true)
    fi

    [ -z "$pids" ] && return 0

    local project_blocking=false
    for pid in $pids; do
        local cmd
        cmd=$(ps -p "$pid" -o args= 2>/dev/null || true)
        # Check if this is a project process (including Go temp binaries from go run)
        if echo "$cmd" | grep -qF "${SCRIPT_DIR:-__no_match__}" \
           || echo "$cmd" | grep -q "cmd/console" \
           || echo "$cmd" | grep -q "kc-agent" \
           || echo "$cmd" | grep -q "kubestellar.*console" \
           || echo "$cmd" | grep -q "/exe/console"; then
            echo -e "${RED:-}Error: Port ${port} still held by project process (PID ${pid}: ${cmd:-unknown})${NC:-}"
            echo -e "${RED:-}  kill ${pid}${NC:-}"
            project_blocking=true
        else
            echo -e "${YELLOW:-}Note: Port ${port} also used by unrelated process (PID ${pid}: ${cmd:-unknown}) — ignoring.${NC:-}"
        fi
    done

    if [ "$project_blocking" = true ]; then
        return 1
    fi
    return 0
}
