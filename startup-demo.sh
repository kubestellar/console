#!/bin/bash
# KubeStellar Console - Demo Mode Startup
# No credentials needed - runs with demo data and dev-user auto-login
#
# Usage:
#   ./startup-demo.sh       # run in foreground
#   ./startup-demo.sh &     # run in background

set -e
cd "$(dirname "$0")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${GREEN}=== KubeStellar Console - Demo Mode ===${NC}"
echo ""

# Environment
export DEV_MODE=true
export SKIP_ONBOARDING=true
export FRONTEND_URL=http://localhost:5174

# Create data directory
mkdir -p ./data

# Port cleanup
for p in 8080 5174; do
    if lsof -Pi :$p -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}Port $p is in use, killing existing process...${NC}"
        lsof -ti:$p | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
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
