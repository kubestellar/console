#!/bin/bash
# KubeStellar Console Development Script
#
# Before running, set your GitHub OAuth credentials:
#   export GITHUB_CLIENT_ID="your-client-id"
#   export GITHUB_CLIENT_SECRET="your-client-secret"
#
# To create a GitHub OAuth App:
# 1. Go to https://github.com/settings/developers
# 2. Click "New OAuth App"
# 3. Set:
#    - Application name: KubeStellar Console (Dev)
#    - Homepage URL: http://localhost:5174
#    - Authorization callback URL: http://localhost:8080/auth/github/callback
# 4. Copy the Client ID and generate a Client Secret

set -e

# Check for required environment variables
if [ -z "$GITHUB_CLIENT_ID" ]; then
    echo "Error: GITHUB_CLIENT_ID not set"
    echo "Please run: export GITHUB_CLIENT_ID='your-client-id'"
    exit 1
fi

if [ -z "$GITHUB_CLIENT_SECRET" ]; then
    echo "Error: GITHUB_CLIENT_SECRET not set"
    echo "Please run: export GITHUB_CLIENT_SECRET='your-client-secret'"
    exit 1
fi

# Start backend and frontend
echo "Starting KubeStellar Console..."
echo "  Frontend: http://localhost:5174"
echo "  Backend:  http://localhost:8080"
echo ""

# Kill existing processes
pkill -f "go run.*console" 2>/dev/null || true
pkill -f "vite.*5174" 2>/dev/null || true
sleep 1

# Start backend
echo "Starting backend..."
DEV_MODE=true FRONTEND_URL=http://localhost:5174 go run ./cmd/console --dev &
BACKEND_PID=$!
sleep 3

# Start frontend
echo "Starting frontend..."
cd web && npm run dev &
FRONTEND_PID=$!

echo ""
echo "Press Ctrl+C to stop"

# Wait for interrupt
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
