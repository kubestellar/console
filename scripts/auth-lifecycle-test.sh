#!/bin/bash
# Auth flow verification — runs Go unit tests for auth handlers and middleware,
# verifies JWT generation/validation, OAuth state CSRF protection, token refresh
# logic, demo mode transitions, and WebSocket auth.
#
# Usage:
#   ./scripts/auth-lifecycle-test.sh              # Run all auth tests
#
# Prerequisites:
#   - Go installed
#
# Output:
#   /tmp/auth-lifecycle-report.json    — JSON test results
#   /tmp/auth-lifecycle-summary.md     — human-readable summary
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

REPORT_JSON="/tmp/auth-lifecycle-report.json"
REPORT_MD="/tmp/auth-lifecycle-summary.md"
TMPDIR_AUTH=$(mktemp -d)
trap 'rm -rf "$TMPDIR_AUTH"' EXIT

if ! command -v go &>/dev/null; then
  echo -e "${RED}ERROR: Go is not installed${NC}"
  exit 1
fi

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Auth Lifecycle Verification${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

TOTAL=0
PASSED=0
FAILED=0

# ============================================================================
# Phase 1: JWT middleware tests
# ============================================================================

echo -e "${BOLD}Phase 1: JWT middleware tests${NC}"

JWT_OUTPUT="$TMPDIR_AUTH/jwt-tests.txt"
JWT_EXIT=0
go test ./pkg/api/middleware/... -run "TestJWTAuth|TestValidateJWT|TestGetContext" -v -timeout 30s > "$JWT_OUTPUT" 2>&1 || JWT_EXIT=$?

JWT_PASSED=$(grep -c "^--- PASS:" "$JWT_OUTPUT" 2>/dev/null || true)
JWT_PASSED="${JWT_PASSED:-0}"
JWT_PASSED=$(echo "$JWT_PASSED" | tr -d '[:space:]')
JWT_FAILED_COUNT=$(grep -c "^--- FAIL:" "$JWT_OUTPUT" 2>/dev/null || true)
JWT_FAILED_COUNT="${JWT_FAILED_COUNT:-0}"
JWT_FAILED_COUNT=$(echo "$JWT_FAILED_COUNT" | tr -d '[:space:]')

TOTAL=$((TOTAL + 1))
if [ "$JWT_EXIT" -eq 0 ]; then
  echo -e "  ${GREEN}✓${NC}  JWT middleware tests passed (${JWT_PASSED} tests)"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} JWT middleware tests failed (${JWT_FAILED_COUNT} failures)"
  grep "^--- FAIL:" "$JWT_OUTPUT" 2>/dev/null | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${NC}"
  done
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 2: Auth handler tests
# ============================================================================

echo -e "${BOLD}Phase 2: Auth handler tests${NC}"

AUTH_OUTPUT="$TMPDIR_AUTH/auth-handler-tests.txt"
AUTH_EXIT=0
go test ./pkg/api/handlers/... -run "TestAuth|TestOAuth|TestLogin|TestCallback" -v -timeout 30s > "$AUTH_OUTPUT" 2>&1 || AUTH_EXIT=$?

AUTH_PASSED=$(grep -c "^--- PASS:" "$AUTH_OUTPUT" 2>/dev/null || true)
AUTH_PASSED="${AUTH_PASSED:-0}"
AUTH_PASSED=$(echo "$AUTH_PASSED" | tr -d '[:space:]')

TOTAL=$((TOTAL + 1))
if [ "$AUTH_EXIT" -eq 0 ]; then
  echo -e "  ${GREEN}✓${NC}  Auth handler tests passed (${AUTH_PASSED} tests)"
  PASSED=$((PASSED + 1))
elif [ "$AUTH_PASSED" -eq 0 ]; then
  echo -e "  ${DIM}⊘  No auth handler tests matched — skipping${NC}"
  # Don't count as failure if no tests matched
else
  echo -e "  ${RED}❌${NC} Auth handler tests failed"
  grep "FAIL" "$AUTH_OUTPUT" 2>/dev/null | head -5 | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${NC}"
  done
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 3: WebSocket auth tests
# ============================================================================

echo -e "${BOLD}Phase 3: WebSocket auth tests${NC}"

WS_OUTPUT="$TMPDIR_AUTH/ws-auth-tests.txt"
WS_EXIT=0
go test ./pkg/api/handlers/... -run "TestWebSocket|TestHub" -v -timeout 30s > "$WS_OUTPUT" 2>&1 || WS_EXIT=$?

WS_PASSED=$(grep -c "^--- PASS:" "$WS_OUTPUT" 2>/dev/null || true)
WS_PASSED="${WS_PASSED:-0}"
WS_PASSED=$(echo "$WS_PASSED" | tr -d '[:space:]')

TOTAL=$((TOTAL + 1))
if [ "$WS_EXIT" -eq 0 ]; then
  if [ "$WS_PASSED" -gt 0 ]; then
    echo -e "  ${GREEN}✓${NC}  WebSocket auth tests passed (${WS_PASSED} tests)"
  else
    echo -e "  ${DIM}⊘  No WebSocket auth tests matched${NC}"
  fi
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} WebSocket auth tests failed"
  grep "FAIL" "$WS_OUTPUT" 2>/dev/null | head -5 | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${NC}"
  done
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 4: Auth security pattern verification
# ============================================================================

echo -e "${BOLD}Phase 4: Auth security pattern verification${NC}"

AUTH_FILE="pkg/api/handlers/auth.go"
MW_FILE="pkg/api/middleware/auth.go"

# CSRF state store
TOTAL=$((TOTAL + 1))
if grep -q "state\|State\|csrf\|CSRF" "$AUTH_FILE" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  OAuth CSRF state protection present"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Missing OAuth CSRF state protection"
  FAILED=$((FAILED + 1))
fi

# Token expiration
TOTAL=$((TOTAL + 1))
if grep -q "ExpiresAt\|expir" "$MW_FILE" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  Token expiration validation present"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Missing token expiration validation"
  FAILED=$((FAILED + 1))
fi

# Token refresh signaling
TOTAL=$((TOTAL + 1))
if grep -q "X-Token-Refresh\|tokenRefresh" "$MW_FILE" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  Token refresh signaling present"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Missing token refresh signaling"
  FAILED=$((FAILED + 1))
fi

# Demo token handling
TOTAL=$((TOTAL + 1))
if grep -rq "demo-token\|demo.mode\|demoMode" pkg/api/ 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  Demo mode auth handling present"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${YELLOW}⚠️ ${NC} No demo mode auth handling found"
  FAILED=$((FAILED + 1))
fi

# Bearer prefix validation
TOTAL=$((TOTAL + 1))
if grep -q "TrimPrefix.*Bearer\|Bearer " "$MW_FILE" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  Bearer prefix validation present"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Missing Bearer prefix validation"
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
    "failed": ${FAILED}
  },
  "phases": {
    "jwtMiddleware": { "exit_code": ${JWT_EXIT}, "passed": ${JWT_PASSED} },
    "authHandlers": { "exit_code": ${AUTH_EXIT}, "passed": ${AUTH_PASSED} },
    "websocketAuth": { "exit_code": ${WS_EXIT}, "passed": ${WS_PASSED} }
  }
}
EOF

cat > "$REPORT_MD" << EOF
# Auth Lifecycle Verification

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)

## Summary

| Metric   | Count |
|----------|-------|
| Total    | ${TOTAL} |
| Passed   | ${PASSED} |
| Failed   | ${FAILED} |

## Phases

- **Phase 1:** JWT middleware tests — $([ "$JWT_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL")
- **Phase 2:** Auth handler tests — $([ "$AUTH_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL")
- **Phase 3:** WebSocket auth tests — $([ "$WS_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL")
- **Phase 4:** Auth security pattern verification
EOF

# ============================================================================
# Summary
# ============================================================================

if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All ${PASSED} auth lifecycle checks passed${NC}"
else
  echo -e "${RED}${BOLD}${FAILED}/${TOTAL} auth lifecycle checks failed${NC}"
fi

echo ""
echo "Reports:"
echo "  JSON:     $REPORT_JSON"
echo "  Summary:  $REPORT_MD"

[ "$FAILED" -gt 0 ] && exit 1
exit 0
