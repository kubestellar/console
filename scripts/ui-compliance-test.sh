#!/bin/bash
# Run UI compliance tests for card loading behavior
#
# Usage:
#   ./scripts/ui-compliance-test.sh              # Full compliance run (production build)
#   ./scripts/ui-compliance-test.sh --gate       # Run + enforce baseline thresholds
#   ./scripts/ui-compliance-test.sh --dev        # Use Vite dev server instead of production build
#   ./scripts/ui-compliance-test.sh --dev --gate # Dev server + baseline gate
#
# Tests all 150+ cards across 8 compliance criteria:
#   a) Skeleton without demo badge during loading
#   b) Refresh icon spins during loading
#   c) Data loads via SSE streaming
#   d) Skeleton replaced by data content
#   e) Refresh icon animated during incremental load
#   f) Data cached in IndexedDB as it loads
#   g) Cached data loads immediately on warm return
#   h) Cached data updated without skeleton regression
#
# Prerequisites:
#   - npm install done in web/
#
# Output:
#   web/e2e/test-results/compliance-report.json  — full data
#   web/e2e/test-results/compliance-summary.md   — human-readable summary
#   web/e2e/test-results/compliance-regression.md — gate results (with --gate)
#   web/e2e/compliance-report/index.html         — HTML report

set -euo pipefail

cd "$(dirname "$0")/../web"

EXTRA_ENV=""
GATE_MODE=""

for arg in "$@"; do
  case "$arg" in
    --gate) GATE_MODE="1"; echo "Running UI compliance tests with baseline gate..." ;;
    --dev)  EXTRA_ENV="PERF_DEV=1"; echo "Using Vite dev server..." ;;
  esac
done

if [[ -z "$EXTRA_ENV" && -z "$GATE_MODE" ]]; then
  echo "Running UI compliance tests against production build..."
fi

env $EXTRA_ENV npx playwright test \
  --config e2e/compliance/compliance.config.ts \
  e2e/compliance/card-loading-compliance.spec.ts

if [[ "$GATE_MODE" == "1" ]]; then
  echo ""
  echo "Checking against baseline thresholds..."
  node e2e/compliance/compare-compliance.mjs
fi

echo ""
echo "Reports:"
echo "  JSON:       web/e2e/test-results/compliance-report.json"
echo "  Summary:    web/e2e/test-results/compliance-summary.md"
echo "  Regression: web/e2e/test-results/compliance-regression.md"
echo "  HTML:       web/e2e/compliance-report/index.html"
