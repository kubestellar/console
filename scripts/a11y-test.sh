#!/bin/bash
# Run accessibility compliance tests (WCAG, keyboard nav, ARIA)
#
# Usage:
#   ./scripts/a11y-test.sh              # Full a11y audit (production build)
#   ./scripts/a11y-test.sh --dev        # Use Vite dev server
#
# Tests all dashboards for:
#   - axe-core WCAG 2.1 AA violations
#   - Keyboard navigation (Tab, Enter, Escape)
#   - ARIA attributes and roles
#   - Focus management
#   - Color contrast
#
# Prerequisites:
#   - npm install done in web/
#
# Output:
#   web/e2e/test-results/a11y-compliance-report.json
#   web/e2e/test-results/a11y-compliance-summary.md

set -euo pipefail

cd "$(dirname "$0")/../web"

EXTRA_ENV=""

for arg in "$@"; do
  case "$arg" in
    --dev) EXTRA_ENV="PERF_DEV=1"; echo "Using Vite dev server..." ;;
  esac
done

if [[ -z "$EXTRA_ENV" ]]; then
  echo "Running accessibility compliance tests against production build..."
fi

env $EXTRA_ENV npx playwright test \
  --config e2e/compliance/compliance.config.ts \
  e2e/compliance/a11y-compliance.spec.ts

echo ""
echo "Reports:"
echo "  JSON:    web/e2e/test-results/a11y-compliance-report.json"
echo "  Summary: web/e2e/test-results/a11y-compliance-summary.md"
