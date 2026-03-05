#!/bin/bash
# Frontend error boundary & resilience testing — wraps the existing Playwright
# error-resilience spec with additional validation of error boundary behavior.
#
# Usage:
#   ./scripts/error-boundary-test.sh              # Run error resilience tests
#
# Prerequisites:
#   - Node.js and npm installed
#   - npm install done in web/
#   - Frontend running at localhost:5174 (or PLAYWRIGHT_BASE_URL set)
#
# Output:
#   /tmp/error-boundary-report.json    — JSON test results
#   /tmp/error-boundary-summary.md     — human-readable summary
#
# Exit code:
#   0 — all tests pass
#   1 — one or more tests failed

set -euo pipefail

cd "$(dirname "$0")/.."

# ============================================================================
# Colors
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

REPORT_JSON="/tmp/error-boundary-report.json"
REPORT_MD="/tmp/error-boundary-summary.md"
TMPDIR_EB=$(mktemp -d)
trap 'rm -rf "$TMPDIR_EB"' EXIT

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Frontend Error Boundary & Resilience Testing${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0

# ============================================================================
# Phase 1: Check error boundary components exist
# ============================================================================

echo -e "${BOLD}Phase 1: Error boundary component checks${NC}"

TOTAL=$((TOTAL + 1))
if grep -rq "ErrorBoundary\|error-boundary\|componentDidCatch\|onError" web/src/components/ 2>/dev/null; then
  EB_COUNT=$(grep -rl "ErrorBoundary\|error-boundary\|componentDidCatch\|onError" web/src/components/ 2>/dev/null | wc -l | tr -d ' ')
  echo -e "  ${GREEN}✓${NC}  Error boundary components found (${EB_COUNT} files)"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${YELLOW}⚠️ ${NC} No error boundary components found in web/src/components/"
  FAILED=$((FAILED + 1))
fi

TOTAL=$((TOTAL + 1))
if grep -rq "fallback\|FallbackComponent\|ErrorFallback" web/src/components/ 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  Fallback/recovery UI found"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${YELLOW}⚠️ ${NC} No fallback/recovery UI components found"
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 2: Playwright error resilience tests
# ============================================================================

echo -e "${BOLD}Phase 2: Playwright error resilience spec${NC}"

if [ -f "web/e2e/compliance/error-resilience.spec.ts" ]; then
  cd web
  PW_OUTPUT="$TMPDIR_EB/playwright.txt"
  PW_EXIT=0

  # Check if frontend is available
  BASE_URL="${PLAYWRIGHT_BASE_URL:-http://localhost:5174}"
  if curl -sf "${BASE_URL}" --max-time 5 > /dev/null 2>&1; then
    EXTRA_ENV="BASE_URL=${BASE_URL}"
    env $EXTRA_ENV npx playwright test --config e2e/compliance/compliance.config.ts error-resilience --reporter=list > "$PW_OUTPUT" 2>&1 || PW_EXIT=$?

    TOTAL=$((TOTAL + 1))
    if [ "$PW_EXIT" -eq 0 ]; then
      PW_PASSED=$(grep -c "✓\|passed" "$PW_OUTPUT" 2>/dev/null || echo "0")
      echo -e "  ${GREEN}✓${NC}  Error resilience tests passed (${PW_PASSED} checks)"
      PASSED=$((PASSED + 1))
    else
      echo -e "  ${RED}❌${NC} Error resilience tests failed"
      grep "✗\|failed\|Error\|Timeout" "$PW_OUTPUT" 2>/dev/null | head -5 | while IFS= read -r line; do
        echo -e "    ${DIM}${line}${NC}"
      done
      FAILED=$((FAILED + 1))
    fi
  else
    TOTAL=$((TOTAL + 1))
    echo -e "  ${DIM}⊘  Frontend not running at ${BASE_URL} — skipping Playwright tests${NC}"
    SKIPPED=$((SKIPPED + 1))
  fi
  cd ..
else
  TOTAL=$((TOTAL + 1))
  echo -e "  ${YELLOW}⚠️ ${NC} error-resilience.spec.ts not found"
  SKIPPED=$((SKIPPED + 1))
fi

echo ""

# ============================================================================
# Phase 3: Verify error handling patterns in source
# ============================================================================

echo -e "${BOLD}Phase 3: Error handling pattern verification${NC}"

# Check for try/catch in API hooks
TOTAL=$((TOTAL + 1))
HOOKS_WITH_TRY=$(grep -rl "try {" web/src/hooks/ 2>/dev/null | wc -l | tr -d ' ')
HOOKS_TOTAL=$(find web/src/hooks/ -name "*.ts" -o -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')
if [ "$HOOKS_WITH_TRY" -gt 0 ]; then
  echo -e "  ${GREEN}✓${NC}  API hooks with try/catch: ${HOOKS_WITH_TRY}/${HOOKS_TOTAL}"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} No try/catch found in API hooks"
  FAILED=$((FAILED + 1))
fi

# Check for loading/error states in data hooks
TOTAL=$((TOTAL + 1))
if grep -rq "isLoading\|isError\|error.*state\|loading.*state" web/src/hooks/ 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  Loading/error state management found in hooks"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Missing loading/error state management in hooks"
  FAILED=$((FAILED + 1))
fi

# Check for null/undefined guards on array operations
TOTAL=$((TOTAL + 1))
UNGUARDED=$(grep -rn "\.join(\|\.map(\|\.filter(\|\.forEach(\|for.*of " web/src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "node_modules" | grep -v "|| \[\]" | grep -v "?." | wc -l | tr -d ' ')
if [ "$UNGUARDED" -lt 50 ]; then
  echo -e "  ${GREEN}✓${NC}  Array operations mostly guarded (${UNGUARDED} unguarded calls)"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${YELLOW}⚠️ ${NC} Many unguarded array operations (${UNGUARDED} calls)"
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Generate reports
# ============================================================================

cat > "$REPORT_JSON" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "summary": {
    "total": ${TOTAL},
    "passed": ${PASSED},
    "failed": ${FAILED},
    "skipped": ${SKIPPED}
  },
  "phases": {
    "errorBoundaryComponents": "checked",
    "playwrightResilience": "$([ -f "$TMPDIR_EB/playwright.txt" ] && echo "ran" || echo "skipped")",
    "errorPatterns": "checked"
  }
}
EOF

cat > "$REPORT_MD" << EOF
# Frontend Error Boundary & Resilience Testing

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)

## Summary

| Metric   | Count |
|----------|-------|
| Total    | ${TOTAL} |
| Passed   | ${PASSED} |
| Failed   | ${FAILED} |
| Skipped  | ${SKIPPED} |

## Checks

- **Phase 1:** Error boundary component existence
- **Phase 2:** Playwright error resilience spec
- **Phase 3:** Error handling pattern verification
EOF

# ============================================================================
# Summary
# ============================================================================

if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All ${PASSED} error boundary checks passed${NC}"
  [ "$SKIPPED" -gt 0 ] && echo -e "${DIM}  (${SKIPPED} skipped — frontend not running)${NC}"
else
  echo -e "${RED}${BOLD}${FAILED}/${TOTAL} error boundary checks failed${NC}"
fi

echo ""
echo "Reports:"
echo "  JSON:     $REPORT_JSON"
echo "  Summary:  $REPORT_MD"

[ "$FAILED" -gt 0 ] && exit 1
exit 0
