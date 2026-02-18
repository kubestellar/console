#!/bin/bash
# Run dashboard navigate-away performance tests
#
# Usage:
#   ./scripts/nav-test.sh              # Mocked APIs (no backend needed)
#   ./scripts/nav-test.sh --real       # Real backend (requires running console)
#   ./scripts/nav-test.sh --dev        # Use Vite dev server instead of production build
#   ./scripts/nav-test.sh --real --dev # Real backend + dev server
#
# Scenarios tested:
#   cold-nav       — first visit to each dashboard via sidebar
#   warm-nav       — revisit dashboards (JS chunks already cached)
#   from-main      — navigate away from Main Dashboard
#   from-clusters  — navigate away from My Clusters
#   rapid-nav      — quick clicks through 10 dashboards
#
# Prerequisites:
#   - npm install done in web/
#   - For --real: running backend (port 8080) + frontend, plus REAL_TOKEN and REAL_USER env vars
#
# Output:
#   web/e2e/test-results/nav-report.json  — full JSON data
#   web/e2e/test-results/nav-summary.md   — markdown summary

set -euo pipefail

cd "$(dirname "$0")/../web"

EXTRA_ENV=""

for arg in "$@"; do
  case "$arg" in
    --real)
      EXTRA_ENV="REAL_BACKEND=true"
      echo "Running against REAL backend..."
      if [[ -z "${REAL_TOKEN:-}" ]]; then
        echo "WARNING: REAL_TOKEN not set — auth may fail"
      fi
      ;;
    --dev)
      EXTRA_ENV="${EXTRA_ENV:+$EXTRA_ENV }PERF_DEV=1"
      echo "Using Vite dev server..."
      ;;
  esac
done

if [[ -z "$EXTRA_ENV" ]]; then
  echo "Running navigate-away tests with mocked APIs..."
fi

env $EXTRA_ENV npx playwright test \
  --config e2e/perf/perf.config.ts \
  e2e/perf/dashboard-nav.spec.ts

echo ""
echo "Reports:"
echo "  JSON:     web/e2e/test-results/nav-report.json"
echo "  Summary:  web/e2e/test-results/nav-summary.md"
