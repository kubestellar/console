#!/bin/bash
# Run AI/ML dashboard integration tests
#
# Usage:
#   ./scripts/ai-ml-test.sh              # Production build (vite preview)
#   ./scripts/ai-ml-test.sh --dev        # Use Vite dev server
#
# Output:
#   web/e2e/test-results/ai-ml-results.json
#   web/e2e/ai-ml-report/index.html

set -euo pipefail

cd "$(dirname "$0")/../web"

EXTRA_ENV=""

for arg in "$@"; do
  case "$arg" in
    --dev) EXTRA_ENV="PERF_DEV=1"; echo "Using Vite dev server..." ;;
  esac
done

if [[ -z "$EXTRA_ENV" ]]; then
  echo "Running AI/ML dashboard tests against production build..."
fi

env $EXTRA_ENV npx playwright test \
  --config e2e/ai-ml/ai-ml.config.ts \
  e2e/ai-ml/ai-ml-dashboard.spec.ts

echo ""
echo "Reports:"
echo "  JSON:  web/e2e/test-results/ai-ml-results.json"
echo "  HTML:  web/e2e/ai-ml-report/index.html"
