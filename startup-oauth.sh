#!/bin/bash
# KubeStellar Console - OAuth Mode Startup
# Requires GitHub OAuth credentials in .env or environment
#
# Can be used two ways:
#   1. Run locally from a cloned repo:  ./startup-oauth.sh
#   2. Bootstrap from scratch via curl:
#        curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/startup-oauth.sh | bash
#        curl -sSL .../startup-oauth.sh | bash -s -- --branch feature-x
#        curl -sSL .../startup-oauth.sh | bash -s -- --tag v1.0.0
#        curl -sSL .../startup-oauth.sh | bash -s -- --release latest
#
# Options (bootstrap mode):
#   --branch, -b <name>    Branch to clone (default: main)
#   --tag, -t <name>       Tag to checkout after cloning
#   --release, -r <name>   Release tag to checkout ("latest" resolves automatically)
#   --dir, -d <path>       Install directory (default: ./kubestellar-console)
#
# Setup:
#   1. Create a GitHub OAuth App at https://github.com/settings/developers
#      - Homepage URL: http://localhost:5174
#      - Callback URL: http://localhost:8080/auth/github/callback
#   2. Create a .env file:
#      GITHUB_CLIENT_ID=<your-client-id>
#      GITHUB_CLIENT_SECRET=<your-client-secret>
#   3. Run: ./startup-oauth.sh

set -e

# --- Bootstrap: clone repo if not already inside one ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"
if [ ! -f "$SCRIPT_DIR/web/package.json" ] || [ ! -d "$SCRIPT_DIR/cmd" ]; then
    REPO_URL="https://github.com/kubestellar/console.git"
    BRANCH="main"
    TAG=""
    INSTALL_DIR="./kubestellar-console"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --branch|-b) BRANCH="$2"; shift 2 ;;
            --tag|-t) TAG="$2"; shift 2 ;;
            --release|-r)
                if [ "$2" = "latest" ]; then
                    TAG=$(git ls-remote --tags --sort=-v:refname "$REPO_URL" 'v*' 2>/dev/null | head -1 | sed 's/.*refs\/tags\///' | sed 's/\^{}//')
                    echo "Latest release: ${TAG:-unknown}"
                else
                    TAG="$2"
                fi
                shift 2 ;;
            --dir|-d) INSTALL_DIR="$2"; shift 2 ;;
            *) shift ;;
        esac
    done

    echo "=== KubeStellar Console Bootstrap (OAuth) ==="
    echo ""

    # Check prerequisites
    for cmd in git go node npm; do
        if ! command -v "$cmd" &>/dev/null; then
            echo "Error: $cmd is required but not found."
            exit 1
        fi
    done

    if [ -d "$INSTALL_DIR/.git" ]; then
        echo "Updating existing clone at $INSTALL_DIR..."
        cd "$INSTALL_DIR"
        git fetch --all --tags --prune
        if [ -n "$TAG" ]; then git checkout "$TAG"
        else git checkout "$BRANCH" && git pull origin "$BRANCH"; fi
    else
        echo "Cloning repository..."
        git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
        if [ -n "$TAG" ]; then git checkout "$TAG"; fi
    fi

    echo "Installing frontend dependencies..."
    (cd web && npm install)
    echo ""
    exec ./startup-oauth.sh
fi

cd "$SCRIPT_DIR"

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
for p in 8080 5174 8585; do
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
    kill $AGENT_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# Install/upgrade kc-agent via brew
if command -v brew &>/dev/null; then
    if brew list kc-agent &>/dev/null; then
        echo -e "${GREEN}Upgrading kc-agent...${NC}"
        brew update --quiet && brew upgrade kc-agent 2>/dev/null || true
    else
        echo -e "${GREEN}Installing kc-agent...${NC}"
        brew update --quiet && brew install kubestellar/tap/kc-agent
    fi
fi

# Start kc-agent
if command -v kc-agent &>/dev/null; then
    echo -e "${GREEN}Starting kc-agent...${NC}"
    kc-agent &
    AGENT_PID=$!
    sleep 2
else
    echo -e "${YELLOW}Warning: kc-agent not found and brew not available.${NC}"
    AGENT_PID=""
fi

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
echo -e "  Agent:    ${CYAN}http://localhost:8585${NC}"
echo -e "  Auth:     GitHub OAuth (real login)"
echo ""
echo "Press Ctrl+C to stop"

wait
