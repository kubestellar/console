#!/bin/bash
# Run LLM-d Benchmarks dashboard integration tests
#
# Usage:
#   ./scripts/benchmark-test.sh              # Production build (vite preview)
#   ./scripts/benchmark-test.sh --dev        # Use Vite dev server
#
# Output:
#   web/e2e/test-results/benchmark-results.json
#   web/e2e/benchmark-report/index.html

set -euo pipefail

cd "$(dirname "$0")/../web"

EXTRA_ENV=""

for arg in "$@"; do
  case "$arg" in
    --dev) EXTRA_ENV="PERF_DEV=1"; echo "Using Vite dev server..." ;;
  esac
done

if [[ -z "$EXTRA_ENV" ]]; then
  echo "Running LLM-d Benchmarks tests against production build..."
fi

env $EXTRA_ENV npx playwright test \
  --config e2e/benchmarks/benchmarks.config.ts \
  e2e/benchmarks/benchmark-dashboard.spec.ts

echo ""
echo "Reports:"
echo "  JSON:  web/e2e/test-results/benchmark-results.json"
echo "  HTML:  web/e2e/benchmark-report/index.html"
