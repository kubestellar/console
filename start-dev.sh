#!/bin/bash
# KubeStellar Console - Development Startup Script
#
# Create a .env file with your credentials:
#   GITHUB_CLIENT_ID=your-client-id
#   GITHUB_CLIENT_SECRET=your-client-secret
#
# The .env file takes precedence over shell environment variables.
# Without .env or credentials, uses dev mode login (no GitHub OAuth).

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

# Kill any existing instance on port 8080
EXISTING_PID=$(lsof -ti :8080 2>/dev/null)
if [ -n "$EXISTING_PID" ]; then
    echo "Killing existing backend on port 8080 (PID: $EXISTING_PID)..."
    kill -9 $EXISTING_PID 2>/dev/null
    sleep 1
fi

echo "Starting KubeStellar Console..."
echo "  GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID:0:10}..."
echo "  Frontend: $FRONTEND_URL"
echo "  Backend: http://localhost:8080"

go run ./cmd/console/main.go --dev
