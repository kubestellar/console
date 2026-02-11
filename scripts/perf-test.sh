#!/bin/bash
# Run dashboard performance tests
#
# Usage:
#   ./scripts/perf-test.sh              # All dashboards, both modes
#   ./scripts/perf-test.sh --demo-only  # Demo mode only
#   ./scripts/perf-test.sh --live-only  # Live mode only
#
# Prerequisites:
#   - Frontend dev server running (or it will be started automatically)
#   - npm install done in web/
#
# Output:
#   web/test-results/perf-report.json  — full data
#   web/test-results/perf-summary.txt  — console summary
#   web/perf-report/index.html         — HTML report

set -euo pipefail

cd "$(dirname "$0")/../web"

GREP_FILTER=""
if [[ "${1:-}" == "--demo-only" ]]; then
  GREP_FILTER="--grep demo"
  echo "Running demo mode tests only..."
elif [[ "${1:-}" == "--live-only" ]]; then
  GREP_FILTER="--grep live"
  echo "Running live mode tests only..."
else
  echo "Running all performance tests (demo + live)..."
fi

npx playwright test \
  --config e2e/perf/perf.config.ts \
  $GREP_FILTER

echo ""
echo "Reports:"
echo "  JSON:    web/test-results/perf-report.json"
echo "  Summary: web/test-results/perf-summary.txt"
echo "  HTML:    web/perf-report/index.html"
