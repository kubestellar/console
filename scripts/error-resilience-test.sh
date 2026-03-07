#!/bin/bash
# Run error resilience tests — verify graceful degradation on failures
#
# Usage:
#   ./scripts/error-resilience-test.sh              # Production build
#   ./scripts/error-resilience-test.sh --dev        # Use Vite dev server
#
# Tests all dashboards for:
#   - Error boundary activation on component crashes
#   - Graceful fallback when APIs return errors
#   - Recovery after transient failures
#   - No blank screens or unhandled exceptions
#
# Prerequisites:
#   - npm install done in web/
#
# Output:
#   web/e2e/test-results/error-resilience-report.json
#   web/e2e/test-results/error-resilience-summary.md

set -euo pipefail

cd "$(dirname "$0")/../web"

EXTRA_ENV=""

for arg in "$@"; do
  case "$arg" in
    --dev) EXTRA_ENV="PERF_DEV=1"; echo "Using Vite dev server..." ;;
  esac
done

if [[ -z "$EXTRA_ENV" ]]; then
  echo "Running error resilience tests against production build..."
fi

env $EXTRA_ENV npx playwright test \
  --config e2e/compliance/compliance.config.ts \
  e2e/compliance/error-resilience.spec.ts

echo ""
echo "Reports:"
echo "  JSON:    web/e2e/test-results/error-resilience-report.json"
echo "  Summary: web/e2e/test-results/error-resilience-summary.md"
