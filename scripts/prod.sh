#!/bin/bash
# Production mode startup script for KubeStellar Console
# Uses real GitHub OAuth instead of dev-user

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( dirname "$SCRIPT_DIR" )"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== KubeStellar Console - Production Mode ===${NC}"

# Load .env file manually (more reliable than source)
if [ -f "$PROJECT_DIR/.env" ]; then
    echo -e "${GREEN}Loading .env file...${NC}"
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ $key =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue
        # Remove quotes from value
        value="${value%\"}"
        value="${value#\"}"
        export "$key=$value"
    done < "$PROJECT_DIR/.env"
fi

# Check required environment variables
if [ -z "$GITHUB_CLIENT_ID" ]; then
    echo -e "${RED}Error: GITHUB_CLIENT_ID is not set${NC}"
    echo ""
    echo "Create a .env file with:"
    echo "  GITHUB_CLIENT_ID=<your-client-id>"
    echo "  GITHUB_CLIENT_SECRET=<your-client-secret>"
    exit 1
fi

if [ -z "$GITHUB_CLIENT_SECRET" ]; then
    echo -e "${RED}Error: GITHUB_CLIENT_SECRET is not set${NC}"
    exit 1
fi

# Production settings - NO dev mode
export DEV_MODE=false
export PORT=${PORT:-8080}
export FRONTEND_URL=${FRONTEND_URL:-http://localhost:5174}

# Create data directory
mkdir -p "$PROJECT_DIR/data"

echo -e "${GREEN}Configuration:${NC}"
echo "  Mode: PRODUCTION (real GitHub OAuth)"
echo "  GitHub Client ID: ${GITHUB_CLIENT_ID:0:8}..."
echo "  Backend Port: $PORT"
echo "  Frontend URL: $FRONTEND_URL"
echo "  Database: $PROJECT_DIR/data/console.db"
echo ""

# Clear ports if in use
for p in $PORT 5174; do
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

# Build backend
echo -e "${GREEN}Building backend...${NC}"
(cd "$PROJECT_DIR" && GOWORK=off go build -o console-server ./cmd/console)

# Start backend with explicit env vars (NO --dev flag)
echo -e "${GREEN}Starting backend (production mode)...${NC}"
GITHUB_CLIENT_ID="$GITHUB_CLIENT_ID" \
GITHUB_CLIENT_SECRET="$GITHUB_CLIENT_SECRET" \
FRONTEND_URL="$FRONTEND_URL" \
DEV_MODE=false \
"$PROJECT_DIR/console-server" &
BACKEND_PID=$!

sleep 2

# Start frontend
echo -e "${GREEN}Starting frontend...${NC}"
(cd "$PROJECT_DIR/web" && npm run dev) &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}=== Console is running in PRODUCTION mode ===${NC}"
echo ""
echo "  Frontend: http://localhost:5174"
echo "  Backend:  http://localhost:$PORT"
echo "  Auth:     GitHub OAuth (real login)"
echo ""
echo "Press Ctrl+C to stop"

wait
