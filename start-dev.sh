#!/bin/bash
# KubeStellar Console - Development Startup Script
#
# Starts backend (port 8080), frontend (port 5174), and kc-agent (port 8585).
#
# Create a .env file with your credentials:
#   GITHUB_CLIENT_ID=your-client-id
#   GITHUB_CLIENT_SECRET=your-client-secret
#
# The .env file takes precedence over shell environment variables.
# Without .env or credentials, uses dev mode login (no GitHub OAuth).

set -e
cd "$(dirname "$0")"

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
