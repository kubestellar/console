#!/bin/bash
# Run card cache compliance tests — verify all cards store and retrieve cached data
#
# Usage:
#   ./scripts/cache-test.sh              # Full cache test (production build)
#   ./scripts/cache-test.sh --dev        # Use Vite dev server instead of production build
#
# Tests all 150+ cards for cache behavior:
#   Phase 1: Cold load all batches with mocked APIs
#   Phase 2: Verify cache entries in IndexedDB/localStorage
#   Phase 3: Navigate away, block ALL APIs
#   Phase 4: Warm return — verify cards display cached data without network
#   Phase 5: Evaluate per-card: cache hit, content match, time-to-content
#
# Prerequisites:
#   - npm install done in web/
#
# Output:
#   web/e2e/test-results/cache-compliance-report.json  — full data
#   web/e2e/test-results/cache-compliance-summary.md   — human-readable summary
#   web/e2e/compliance-report/index.html               — HTML report

set -euo pipefail

cd "$(dirname "$0")/../web"

EXTRA_ENV=""

for arg in "$@"; do
  case "$arg" in
    --dev) EXTRA_ENV="PERF_DEV=1"; echo "Using Vite dev server..." ;;
  esac
done

if [[ -z "$EXTRA_ENV" ]]; then
  echo "Running card cache compliance tests against production build..."
fi

env $EXTRA_ENV npx playwright test \
  --config e2e/compliance/compliance.config.ts \
  e2e/compliance/card-cache-compliance.spec.ts

echo ""
echo "Reports:"
echo "  JSON:    web/e2e/test-results/cache-compliance-report.json"
echo "  Summary: web/e2e/test-results/cache-compliance-summary.md"
echo "  HTML:    web/e2e/compliance-report/index.html"
