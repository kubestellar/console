#!/bin/bash
# KubeStellar Console - OAuth Mode Startup
# Requires GitHub OAuth credentials in .env or environment
#
# Setup:
#   1. Create a GitHub OAuth App at https://github.com/settings/developers
#      - Homepage URL: http://localhost:5174
#      - Callback URL: http://localhost:5174/auth/github/callback
#   2. Create a .env file:
#      GITHUB_CLIENT_ID=<your-client-id>
#      GITHUB_CLIENT_SECRET=<your-client-secret>
#   3. Run: ./startup-oauth.sh

set -e
cd "$(dirname "$0")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${GREEN}=== KubeStellar Console - OAuth Mode ===${NC}"
echo ""

# Load .env file if it exists
if [ -f .env ]; then
    echo -e "${GREEN}Loading .env file...${NC}"
    while IFS='=' read -r key value; do
        [[ $key =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        export "$key=$value"
    done < .env
fi

# Check required OAuth credentials
if [ -z "$GITHUB_CLIENT_ID" ]; then
    echo -e "${RED}Error: GITHUB_CLIENT_ID is not set${NC}"
    echo ""
    echo "Create a .env file with:"
    echo "  GITHUB_CLIENT_ID=<your-client-id>"
    echo "  GITHUB_CLIENT_SECRET=<your-client-secret>"
    echo ""
    echo "Or create a GitHub OAuth App at:"
    echo "  https://github.com/settings/developers"
    echo "  Homepage URL: http://localhost:5174"
    echo "  Callback URL: http://localhost:5174/auth/github/callback"
    exit 1
fi

if [ -z "$GITHUB_CLIENT_SECRET" ]; then
    echo -e "${RED}Error: GITHUB_CLIENT_SECRET is not set${NC}"
    exit 1
fi

# Generate JWT_SECRET if not set (production mode requires it)
if [ -z "$JWT_SECRET" ]; then
    export JWT_SECRET=$(openssl rand -hex 32)
    echo -e "${YELLOW}Generated random JWT_SECRET (set JWT_SECRET in .env to persist across restarts)${NC}"
fi

# Environment
export DEV_MODE=false
export SKIP_ONBOARDING=true
export FRONTEND_URL=http://localhost:5174

# Create data directory
mkdir -p ./data

echo -e "${GREEN}Configuration:${NC}"
echo "  Mode: OAuth (real GitHub login)"
echo "  GitHub Client ID: ${GITHUB_CLIENT_ID:0:8}..."
echo "  Backend Port: 8080"
echo "  Frontend URL: $FRONTEND_URL"
echo ""

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

# Start backend (NO --dev flag, uses real OAuth)
echo -e "${GREEN}Starting backend (OAuth mode)...${NC}"
GOWORK=off go run ./cmd/console &
BACKEND_PID=$!
sleep 2

# Start frontend
echo -e "${GREEN}Starting frontend...${NC}"
(cd web && npm run dev -- --port 5174) &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}=== Console is running in OAUTH mode ===${NC}"
echo ""
echo -e "  Frontend: ${CYAN}http://localhost:5174${NC}"
echo -e "  Backend:  ${CYAN}http://localhost:8080${NC}"
echo -e "  Auth:     GitHub OAuth (real login)"
echo ""
echo "Press Ctrl+C to stop"

wait
