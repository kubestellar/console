#!/bin/bash
# Run dashboard performance tests
#
# Usage:
#   ./scripts/perf-test.sh              # All dashboards, both modes (production build)
#   ./scripts/perf-test.sh --demo-only  # Demo mode only (production build)
#   ./scripts/perf-test.sh --live-only  # Live mode only (production build)
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

for arg in "$@"; do
  case "$arg" in
    --demo-only) GREP_FILTER="--grep demo"; echo "Running demo mode tests only..." ;;
    --live-only) GREP_FILTER="--grep live"; echo "Running live mode tests only..." ;;
    --dev)       EXTRA_ENV="PERF_DEV=1"; echo "Using Vite dev server..." ;;
  esac
done

if [[ -z "$GREP_FILTER" && -z "$EXTRA_ENV" ]]; then
  echo "Running all performance tests against production build..."
fi

env $EXTRA_ENV npx playwright test \
  --config e2e/perf/perf.config.ts \
  $GREP_FILTER

echo ""
echo "Reports:"
echo "  JSON:    web/e2e/test-results/perf-report.json"
echo "  Summary: web/e2e/test-results/perf-summary.txt"
echo "  HTML:    web/e2e/perf-report/index.html"
