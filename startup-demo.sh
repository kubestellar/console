#!/bin/bash
# KubeStellar Console - Demo Mode Startup
# No credentials needed - runs with demo data and dev-user auto-login
#
# Usage:
#   ./startup-demo.sh       # run in foreground
#   ./startup-demo.sh &     # run in background

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Safely kill a project process on a port. Unrelated processes are warned and
# left running to avoid disrupting non-project services.
kill_project_port() {
    local port="$1"
    local pids
    pids=$(lsof -ti ":${port}" 2>/dev/null || true)
    [ -z "$pids" ] && return 0

    local to_kill=()
    for pid in $pids; do
        local cmd
        cmd=$(ps -p "$pid" -o args= 2>/dev/null || true)
        if echo "$cmd" | grep -qF "$SCRIPT_DIR" \
           || echo "$cmd" | grep -q "cmd/console" \
           || echo "$cmd" | grep -q "kc-agent"; then
            to_kill+=("$pid")
            echo -e "${YELLOW}Stopping project process on port ${port} (PID ${pid})...${NC}"
            kill -TERM "$pid" 2>/dev/null || true
        else
            echo -e "${YELLOW}Warning: Port ${port} is in use by an unrelated process (PID ${pid}: ${cmd:-unknown}). Skipping.${NC}"
        fi
    done

    [ ${#to_kill[@]} -eq 0 ] && return 0
    sleep 2

    # Fall back to SIGKILL for project processes that did not exit gracefully
    for pid in "${to_kill[@]}"; do
        kill -9 "$pid" 2>/dev/null || true
    done
}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${GREEN}=== KubeStellar Console - Demo Mode ===${NC}"
echo ""

# Environment
unset CLAUDECODE  # Allow AI Missions to spawn claude-code even when started from a Claude Code session
export DEV_MODE=true
export SKIP_ONBOARDING=true
export FRONTEND_URL=http://localhost:5174

# Create data directory
mkdir -p ./data

# Port cleanup — only kill project processes; unrelated services are left running
for p in 8080 5174; do
    kill_project_port "$p"
done

# Cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start backend (dev mode, no OAuth needed)
echo -e "${GREEN}Starting backend (demo mode)...${NC}"
GOWORK=off go run ./cmd/console --dev &
BACKEND_PID=$!
sleep 2

# Start frontend
echo -e "${GREEN}Starting frontend...${NC}"
(cd web && npm run dev -- --port 5174) &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}=== Console is running in DEMO mode ===${NC}"
echo ""
echo -e "  Frontend: ${CYAN}http://localhost:5174${NC}"
echo -e "  Backend:  ${CYAN}http://localhost:8080${NC}"
echo ""
echo -e "  No login required - auto-signed in as dev-user"
echo -e "  Demo data is shown by default"
echo ""
echo "Press Ctrl+C to stop"

wait
