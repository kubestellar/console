#!/bin/bash
# KubeStellar Console - Development Startup Script
#
# To use GitHub OAuth (recommended for real profile):
#   export GITHUB_CLIENT_ID="your-client-id"
#   export GITHUB_CLIENT_SECRET="your-client-secret"
#   ./start-dev.sh
#
# Without GitHub OAuth (uses dev-user):
#   ./start-dev.sh

cd "$(dirname "$0")"

export DEV_MODE=true
export FRONTEND_URL=http://localhost:5174

if [ -z "$GITHUB_CLIENT_ID" ]; then
    echo "⚠️  No GITHUB_CLIENT_ID set - using dev mode login"
    echo "   To use GitHub SSO, set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET"
    echo ""
else
    echo "✅ GitHub OAuth configured"
fi

echo "Starting KubeStellar Console backend on port 8080..."
echo "Frontend URL: $FRONTEND_URL"
echo ""

go run ./cmd/console/main.go --dev
