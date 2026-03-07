#!/bin/bash
# Run internationalization compliance tests
#
# Usage:
#   ./scripts/i18n-test.sh              # Production build
#   ./scripts/i18n-test.sh --dev        # Use Vite dev server
#
# Tests all dashboards for:
#   - Hardcoded English strings that should use i18n
#   - Date/time formatting consistency
#   - Number formatting (locale-aware)
#   - Text truncation and overflow handling
#   - RTL layout readiness
#
# Prerequisites:
#   - npm install done in web/
#
# Output:
#   web/e2e/test-results/i18n-compliance-report.json
#   web/e2e/test-results/i18n-compliance-summary.md

set -euo pipefail

cd "$(dirname "$0")/../web"

EXTRA_ENV=""

for arg in "$@"; do
  case "$arg" in
    --dev) EXTRA_ENV="PERF_DEV=1"; echo "Using Vite dev server..." ;;
  esac
done

if [[ -z "$EXTRA_ENV" ]]; then
  echo "Running i18n compliance tests against production build..."
fi

env $EXTRA_ENV npx playwright test \
  --config e2e/compliance/compliance.config.ts \
  e2e/compliance/i18n-compliance.spec.ts

echo ""
echo "Reports:"
echo "  JSON:    web/e2e/test-results/i18n-compliance-report.json"
echo "  Summary: web/e2e/test-results/i18n-compliance-summary.md"
