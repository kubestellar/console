#!/bin/bash
# KubeStellar Console - Development Startup Script
#
# Starts backend (port 8080), frontend (port 5174), and kc-agent (port 8585).
#
# Can be used two ways:
#   1. Run locally from a cloned repo:  ./start-dev.sh
#   2. Bootstrap from scratch via curl:
#        curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start-dev.sh | bash
#        curl -sSL .../start-dev.sh | bash -s -- --branch feature-x
#        curl -sSL .../start-dev.sh | bash -s -- --tag v1.0.0
#        curl -sSL .../start-dev.sh | bash -s -- --release latest
#
# Options (bootstrap mode):
#   --branch, -b <name>    Branch to clone (default: main)
#   --tag, -t <name>       Tag to checkout after cloning
#   --release, -r <name>   Release tag to checkout ("latest" resolves automatically)
#   --dir, -d <path>       Install directory (default: ./kubestellar-console)
#
# Create a .env file with your credentials:
#   GITHUB_CLIENT_ID=your-client-id
#   GITHUB_CLIENT_SECRET=your-client-secret
#
# The .env file takes precedence over shell environment variables.
# Without .env or credentials, uses dev mode login (no GitHub OAuth).

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

    echo "=== KubeStellar Console Bootstrap ==="
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
        [ -n "$TAG" ] && git checkout "$TAG"
    fi

    echo "Installing frontend dependencies..."
    (cd web && npm install)
    echo ""
    exec ./start-dev.sh
fi

cd "$SCRIPT_DIR"

# Load .env file if it exists (overrides any existing env vars)
if [ -f .env ]; then
    echo "Loading .env file..."
    # Unset existing GitHub vars to ensure .env takes precedence
    unset GITHUB_CLIENT_ID
    unset GITHUB_CLIENT_SECRET
    unset FRONTEND_URL
    unset DEV_MODE

    # Read .env and export each variable
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ $key =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue
        # Remove surrounding quotes from value
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        export "$key=$value"
    done < .env
fi

export DEV_MODE=${DEV_MODE:-true}
export FRONTEND_URL=${FRONTEND_URL:-http://localhost:5174}

# Kill any existing instances on required ports
for p in 8080 5174 8585; do
    EXISTING_PID=$(lsof -ti :$p 2>/dev/null)
    if [ -n "$EXISTING_PID" ]; then
        echo "Killing existing process on port $p (PID: $EXISTING_PID)..."
        kill -9 $EXISTING_PID 2>/dev/null || true
        sleep 1
    fi
done

echo "Starting KubeStellar Console (dev mode)..."
echo "  GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID:0:10}..."
echo "  Frontend: $FRONTEND_URL"
echo "  Backend: http://localhost:8080"
echo "  Agent: http://localhost:8585"

# Cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    kill $AGENT_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# Install/upgrade kc-agent via brew
if command -v brew &>/dev/null; then
    if brew list kc-agent &>/dev/null; then
        echo "Upgrading kc-agent..."
        brew update --quiet && brew upgrade kc-agent 2>/dev/null || true
    else
        echo "Installing kc-agent..."
        brew update --quiet && brew install kubestellar/tap/kc-agent
    fi
fi

# Start kc-agent
if command -v kc-agent &>/dev/null; then
    echo "Starting kc-agent..."
    kc-agent &
    AGENT_PID=$!
    sleep 2
else
    echo "Warning: kc-agent not found and brew not available."
    AGENT_PID=""
fi

# Start backend
echo "Starting backend..."
go run ./cmd/console/main.go --dev &
BACKEND_PID=$!
sleep 2

# Start frontend
echo "Starting frontend..."
(cd web && npm run dev -- --port 5174) &
FRONTEND_PID=$!

echo ""
echo "=== Console is running in DEV mode ==="
echo ""
echo "  Frontend: http://localhost:5174"
echo "  Backend:  http://localhost:8080"
echo "  Agent:    http://localhost:8585"
echo ""
echo "Press Ctrl+C to stop"

wait
