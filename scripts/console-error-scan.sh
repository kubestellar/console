#!/bin/bash
# Scan all console routes for Chrome DevTools console errors/warnings
#
# Usage:
#   ./scripts/console-error-scan.sh              # Production build (no backend needed)
#   ./scripts/console-error-scan.sh --dev        # Use Vite dev server
#   ./scripts/console-error-scan.sh --live       # Scan live server on :8080
#
# What it does:
#   Traverses every route in the KubeStellar Console and captures all
#   Chrome DevTools Protocol (CDP) console messages — info, warnings,
#   errors, and uncaught exceptions. APIs are mocked so no live backend
#   is required (unless --live is used).
#
# Routes scanned: ~38 (all defined in App.tsx)
#   /  /clusters  /workloads  /nodes  /deployments  /pods  /services
#   /operators  /helm  /logs  /compute  /storage  /network  /events
#   /security  /gitops  /alerts  /cost  /security-posture  /compliance
#   /data-compliance  /gpu-reservations  /history  /settings  /users
#   /namespaces  /arcade  /deploy  /ai-ml  /ai-agents  /llm-d-benchmarks
#   /cluster-admin  /ci-cd  /marketplace  and more
#
# Prerequisites:
#   - npm install done in web/
#   - For --live: running console on port 8080
#
# Output:
#   web/e2e/test-results/console-errors-report.json  — full JSON data
#   web/e2e/test-results/console-errors-summary.md   — markdown summary
#
# Exit code:
#   0 — no uncaught exceptions on any route
#   1 — one or more routes crashed with uncaught exceptions

set -euo pipefail

cd "$(dirname "$0")/../web"

EXTRA_ENV=""

for arg in "$@"; do
  case "$arg" in
    --dev)
      EXTRA_ENV="${EXTRA_ENV:+$EXTRA_ENV }PERF_DEV=1"
      echo "Using Vite dev server..."
      ;;
    --live)
      EXTRA_ENV="${EXTRA_ENV:+$EXTRA_ENV }PLAYWRIGHT_BASE_URL=http://localhost:8080"
      echo "Scanning live server on :8080..."
      ;;
  esac
done

if [[ -z "$EXTRA_ENV" ]]; then
  echo "Running console error scan against production build..."
fi

echo ""

env $EXTRA_ENV npx playwright test \
  --config e2e/console-errors/console-errors.config.ts \
  e2e/console-errors/console-error-scan.spec.ts \
  --reporter=list

echo ""
echo "Reports:"
echo "  JSON:    web/e2e/test-results/console-errors-report.json"
echo "  Summary: web/e2e/test-results/console-errors-summary.md"
echo ""
echo "View summary:"
echo "  cat web/e2e/test-results/console-errors-summary.md"
