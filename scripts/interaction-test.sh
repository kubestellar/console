#!/bin/bash
# Run interaction compliance tests — verify UI responsiveness
#
# Usage:
#   ./scripts/interaction-test.sh              # Production build
#   ./scripts/interaction-test.sh --dev        # Use Vite dev server
#
# Tests all dashboards for:
#   - Button/link click responsiveness
#   - Form input handling
#   - Drag and drop operations
#   - Modal open/close behavior
#   - Tooltip and popover display
#   - Scroll and resize handling
#
# Prerequisites:
#   - npm install done in web/
#
# Output:
#   web/e2e/test-results/interaction-compliance-report.json
#   web/e2e/test-results/interaction-compliance-summary.md

set -euo pipefail

cd "$(dirname "$0")/../web"

EXTRA_ENV=""

for arg in "$@"; do
  case "$arg" in
    --dev) EXTRA_ENV="PERF_DEV=1"; echo "Using Vite dev server..." ;;
  esac
done

if [[ -z "$EXTRA_ENV" ]]; then
  echo "Running interaction compliance tests against production build..."
fi

env $EXTRA_ENV npx playwright test \
  --config e2e/compliance/compliance.config.ts \
  e2e/compliance/interaction-compliance.spec.ts

echo ""
echo "Reports:"
echo "  JSON:    web/e2e/test-results/interaction-compliance-report.json"
echo "  Summary: web/e2e/test-results/interaction-compliance-summary.md"
