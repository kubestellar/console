#!/bin/bash
# Development startup script for KubeStellar Console

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== KubeStellar Console Development Server ===${NC}"

# Check required environment variables
if [ -z "$GITHUB_CLIENT_ID" ]; then
    echo -e "${RED}Error: GITHUB_CLIENT_ID is not set${NC}"
    echo ""
    echo "To create a GitHub OAuth App:"
    echo "1. Go to https://github.com/settings/developers"
    echo "2. Click 'New OAuth App'"
    echo "3. Set the following:"
    echo "   - Application name: KubeStellar Console (Dev)"
    echo "   - Homepage URL: http://localhost:5174"
    echo "   - Authorization callback URL: http://localhost:8080/auth/github/callback"
    echo "4. Copy the Client ID and generate a Client Secret"
    echo ""
    echo "Then set the environment variables:"
    echo "  export GITHUB_CLIENT_ID=<your-client-id>"
    echo "  export GITHUB_CLIENT_SECRET=<your-client-secret>"
    exit 1
fi

if [ -z "$GITHUB_CLIENT_SECRET" ]; then
    echo -e "${RED}Error: GITHUB_CLIENT_SECRET is not set${NC}"
    exit 1
fi

# Set development defaults
export DEV_MODE=true
export PORT=${PORT:-8080}
export FRONTEND_URL=${FRONTEND_URL:-http://localhost:5174}

# Create data directory if it doesn't exist
mkdir -p ./data

echo -e "${GREEN}Configuration:${NC}"
echo "  Backend Port: $PORT"
echo "  Frontend URL: $FRONTEND_URL"
echo "  Database: ./data/console.db"
echo "  MCP Ops: ${KUBESTELLAR_OPS_PATH:-kubestellar-ops}"
echo "  MCP Deploy: ${KUBESTELLAR_DEPLOY_PATH:-kubestellar-deploy}"
echo ""

# Clear ports if in use (kill existing processes)
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}Port $PORT is in use, killing existing process...${NC}"
    lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
    sleep 1
fi

if lsof -Pi :5174 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}Port 5174 is in use, killing existing process...${NC}"
    lsof -ti:5174 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start backend
echo -e "${GREEN}Starting backend...${NC}"
GOWORK=off go run ./cmd/console --dev &
BACKEND_PID=$!

# Wait a bit for backend to start
sleep 2

# Start frontend
echo -e "${GREEN}Starting frontend...${NC}"
(cd web && npm run dev) &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}=== Console is running ===${NC}"
echo ""
echo "  Frontend: http://localhost:5174"
echo "  Backend:  http://localhost:$PORT"
echo "  API:      http://localhost:$PORT/api"
echo ""
echo "Press Ctrl+C to stop"

# Wait for either process to exit
wait
