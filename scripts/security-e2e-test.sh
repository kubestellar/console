#!/bin/bash
# Run security compliance tests via Playwright (runtime security checks)
#
# Usage:
#   ./scripts/security-e2e-test.sh              # Production build
#   ./scripts/security-e2e-test.sh --dev        # Use Vite dev server
#
# Tests all dashboards for:
#   - XSS vector injection resistance
#   - Content Security Policy enforcement
#   - Sensitive data exposure in DOM
#   - localStorage/sessionStorage security
#   - Cookie security attributes
#   - Open redirect prevention
#
# Prerequisites:
#   - npm install done in web/
#
# Output:
#   web/e2e/test-results/security-compliance-report.json
#   web/e2e/test-results/security-compliance-summary.md

set -euo pipefail

cd "$(dirname "$0")/../web"

EXTRA_ENV=""

for arg in "$@"; do
  case "$arg" in
    --dev) EXTRA_ENV="PERF_DEV=1"; echo "Using Vite dev server..." ;;
  esac
done

if [[ -z "$EXTRA_ENV" ]]; then
  echo "Running security compliance tests against production build..."
fi

env $EXTRA_ENV npx playwright test \
  --config e2e/compliance/compliance.config.ts \
  e2e/compliance/security-compliance.spec.ts

echo ""
echo "Reports:"
echo "  JSON:    web/e2e/test-results/security-compliance-report.json"
echo "  Summary: web/e2e/test-results/security-compliance-summary.md"
