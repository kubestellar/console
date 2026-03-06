#!/bin/bash
# Run deploy dashboard integration tests
#
# Usage:
#   ./scripts/deploy-test.sh              # Mocked APIs (no backend needed)
#   ./scripts/deploy-test.sh --dev        # Use Vite dev server instead of production build
#
# Tests validated:
#   - Workload listing (correct data, API endpoint coverage)
#   - Resource marshalling (dependency resolution completeness + ordering)
#   - Cluster groups (static + dynamic group membership)
#   - Deployment missions (lifecycle states: deploying -> orbit -> abort)
#   - Deploy logs (K8s events with timestamps, per-cluster)
#   - Deploy-status polling (replica count progression)
#   - Failed deployments (error event display)
#
# Prerequisites:
#   - npm install done in web/
#
# Output:
#   web/e2e/test-results/deploy-results.json  — full JSON data
#   web/e2e/deploy-report/index.html          — HTML report

set -euo pipefail

cd "$(dirname "$0")/../web"

EXTRA_ENV=""

for arg in "$@"; do
  case "$arg" in
    --dev) EXTRA_ENV="PERF_DEV=1"; echo "Using Vite dev server..." ;;
  esac
done

if [[ -z "$EXTRA_ENV" ]]; then
  echo "Running deploy dashboard tests against production build..."
fi

env $EXTRA_ENV npx playwright test \
  --config e2e/deploy/deploy.config.ts \
  e2e/deploy/deploy-dashboard.spec.ts

echo ""
echo "Reports:"
echo "  JSON:  web/e2e/test-results/deploy-results.json"
echo "  HTML:  web/e2e/deploy-report/index.html"
