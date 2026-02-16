#!/bin/bash
# Run dashboard performance tests
#
# Usage:
#   ./scripts/perf-test.sh              # All dashboards, both modes (production build)
#   ./scripts/perf-test.sh --demo-only  # Demo mode only (production build)
#   ./scripts/perf-test.sh --live-only  # Live mode only (production build)
#   ./scripts/perf-test.sh --ttfi       # All-card TTFI matrix (cold/warm + demo/live)
#   ./scripts/perf-test.sh --ttfi-gate  # All-card TTFI + hard budget gate
#   ./scripts/perf-test.sh --dev        # Use Vite dev server instead of production build
#
# By default, tests run against a production build (vite preview) which
# measures what users actually experience. Use --dev for development testing.
#
# Prerequisites:
#   - npm install done in web/
#
# Output:
#   web/e2e/test-results/perf-report.json  — full data
#   web/e2e/test-results/perf-summary.txt  — console summary
#   web/e2e/perf-report/index.html         — HTML report

set -euo pipefail

cd "$(dirname "$0")/../web"

GREP_FILTER=""
EXTRA_ENV=""
TTFI_MODE=""

for arg in "$@"; do
  case "$arg" in
    --demo-only) GREP_FILTER="--grep demo"; echo "Running demo mode tests only..." ;;
    --live-only) GREP_FILTER="--grep live"; echo "Running live mode tests only..." ;;
    --ttfi)      TTFI_MODE="ttfi"; echo "Running all-card TTFI matrix..." ;;
    --ttfi-gate) TTFI_MODE="ttfi-gate"; echo "Running all-card TTFI matrix with hard gate..." ;;
    --dev)       EXTRA_ENV="PERF_DEV=1"; echo "Using Vite dev server..." ;;
  esac
done

if [[ -z "$GREP_FILTER" && -z "$EXTRA_ENV" && -z "$TTFI_MODE" ]]; then
  echo "Running all performance tests against production build..."
fi

if [[ "$TTFI_MODE" == "ttfi" ]]; then
  env $EXTRA_ENV npx playwright test \
    --config e2e/perf/perf.config.ts \
    e2e/perf/all-cards-ttfi.spec.ts
elif [[ "$TTFI_MODE" == "ttfi-gate" ]]; then
  env $EXTRA_ENV npx playwright test \
    --config e2e/perf/perf.config.ts \
    e2e/perf/all-cards-ttfi.spec.ts
  node e2e/perf/compare-ttfi.mjs
else
  env $EXTRA_ENV npx playwright test \
    --config e2e/perf/perf.config.ts \
    $GREP_FILTER
fi

echo ""
echo "Reports:"
echo "  JSON:    web/e2e/test-results/perf-report.json"
echo "  Summary: web/e2e/test-results/perf-summary.txt"
echo "  TTFI:    web/e2e/test-results/ttfi-report.json"
echo "  Gate:    web/e2e/test-results/ttfi-regression.md"
echo "  HTML:    web/e2e/perf-report/index.html"
