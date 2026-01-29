#!/bin/bash
# Run KubeStellar Console in dev mode with OAuth

# Load OAuth credentials
source ~/.config/kubestellar-console/env

# Set environment
export DEV_MODE=true
export FRONTEND_URL=http://localhost:5174
export GOWORK=off

# Change to project directory
cd "$(dirname "$0")"

# Run
echo "Starting KubeStellar Console..."
echo "  GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID:0:8}..."
echo "  Frontend: $FRONTEND_URL"
echo "  Backend: http://localhost:8080"

exec go run ./cmd/console/main.go --dev
