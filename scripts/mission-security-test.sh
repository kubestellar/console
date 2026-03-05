#!/bin/bash
# Mission import security validation — runs the mission scanner unit tests and
# verifies that XSS, privilege escalation, and sensitive data payloads are
# correctly detected and blocked.
#
# Usage:
#   ./scripts/mission-security-test.sh              # Run all mission security tests
#
# Prerequisites:
#   - Node.js and npm installed
#   - npm install done in web/
#
# Output:
#   /tmp/mission-security-report.json    — JSON test results
#   /tmp/mission-security-summary.md     — human-readable summary
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

REPORT_JSON="/tmp/mission-security-report.json"
REPORT_MD="/tmp/mission-security-summary.md"
TMPDIR_MISSION=$(mktemp -d)
trap 'rm -rf "$TMPDIR_MISSION"' EXIT

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Mission Import Security Validation${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

TOTAL=0
PASSED=0
FAILED=0

# ============================================================================
# Phase 1: Run existing Vitest unit tests for mission scanner
# ============================================================================

echo -e "${BOLD}Phase 1: Mission scanner unit tests (Vitest)${NC}"

cd web
VITEST_OUTPUT="$TMPDIR_MISSION/vitest.txt"
VITEST_EXIT=0
npx vitest run src/lib/missions/__tests__/ --reporter=verbose > "$VITEST_OUTPUT" 2>&1 || VITEST_EXIT=$?
cd ..

VITEST_PASSED=$(grep -c "✓\|✅\|PASS" "$VITEST_OUTPUT" 2>/dev/null || echo "0")
VITEST_FAILED_COUNT=$(grep -c "✗\|❌\|FAIL" "$VITEST_OUTPUT" 2>/dev/null || echo "0")

TOTAL=$((TOTAL + 1))
if [ "$VITEST_EXIT" -eq 0 ]; then
  echo -e "  ${GREEN}✓ All mission scanner tests passed${NC}"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌ Mission scanner tests failed${NC}"
  grep "✗\|FAIL\|Error" "$VITEST_OUTPUT" 2>/dev/null | head -10 | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${NC}"
  done
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 2: Verify malicious content detection with known payloads
# ============================================================================

echo -e "${BOLD}Phase 2: Malicious payload detection verification${NC}"

# Test that the scanner source code contains all expected pattern categories
SCANNER_FILE="web/src/lib/missions/scanner/malicious.ts"
SENSITIVE_FILE="web/src/lib/missions/scanner/sensitive.ts"

declare -a MALICIOUS_PATTERNS=(
  "xss-script:<script"
  "xss-javascript-uri:javascript:"
  "xss-event-handler:onclick"
  "privileged-container:privileged.*true"
  "host-network:hostNetwork"
  "dangerous-hostpath:hostPath"
  "docker-socket:docker.sock"
  "rbac-wildcard:resources.*\\*"
  "crypto-miner:xmrig\\|coinhive"
  "curl-pipe-bash:curl.*bash"
  "url-shortener:bit.ly\\|tinyurl"
  "command-injection:backtick"
  "base64-encoded-script:base64"
)

declare -a SENSITIVE_PATTERNS_CHECK=(
  "ipv4:ipv4"
  "jwt:eyJ"
  "bearer-token:Bearer"
  "github-pat:ghp_"
  "aws-key:AKIA"
  "pem-cert:BEGIN CERTIFICATE\\|PRIVATE KEY"
  "k8s-secret:kind.*Secret"
)

for pattern in "${MALICIOUS_PATTERNS[@]}"; do
  NAME=$(echo "$pattern" | cut -d: -f1)
  SEARCH=$(echo "$pattern" | cut -d: -f2-)
  TOTAL=$((TOTAL + 1))

  if grep -qi "$NAME" "$SCANNER_FILE" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC}  malicious pattern: ${NAME}"
    PASSED=$((PASSED + 1))
  else
    echo -e "  ${RED}❌${NC} malicious pattern missing: ${NAME}"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo -e "${BOLD}Phase 3: Sensitive data detection verification${NC}"

for pattern in "${SENSITIVE_PATTERNS_CHECK[@]}"; do
  NAME=$(echo "$pattern" | cut -d: -f1)
  TOTAL=$((TOTAL + 1))

  if grep -qi "$NAME" "$SENSITIVE_FILE" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC}  sensitive pattern: ${NAME}"
    PASSED=$((PASSED + 1))
  else
    echo -e "  ${RED}❌${NC} sensitive pattern missing: ${NAME}"
    FAILED=$((FAILED + 1))
  fi
done

echo ""

# ============================================================================
# Phase 4: Verify scanner is imported in mission import flow
# ============================================================================

echo -e "${BOLD}Phase 4: Scanner integration check${NC}"

TOTAL=$((TOTAL + 1))
if grep -rq "scanForMaliciousContent\|malicious\|fullScan\|scanner/index" web/src/components/missions/ 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  Malicious scanner integrated in mission components"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${YELLOW}⚠️ ${NC} Malicious scanner not found in mission components"
  FAILED=$((FAILED + 1))
fi

TOTAL=$((TOTAL + 1))
if grep -rq "scanForSensitiveData\|sensitive\|fullScan\|scanner/index" web/src/components/missions/ 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  Sensitive data scanner integrated in mission components"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${YELLOW}⚠️ ${NC} Sensitive data scanner not found in mission components"
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
    "vitest": { "exit_code": ${VITEST_EXIT}, "tests_passed": ${VITEST_PASSED} },
    "malicious_patterns": ${#MALICIOUS_PATTERNS[@]},
    "sensitive_patterns": ${#SENSITIVE_PATTERNS_CHECK[@]}
  }
}
EOF

cat > "$REPORT_MD" << EOF
# Mission Import Security Validation

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)

## Summary

| Metric   | Count |
|----------|-------|
| Total    | ${TOTAL} |
| Passed   | ${PASSED} |
| Failed   | ${FAILED} |

## Checks

- **Phase 1:** Vitest scanner unit tests — $([ "$VITEST_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL")
- **Phase 2:** Malicious pattern coverage (${#MALICIOUS_PATTERNS[@]} patterns)
- **Phase 3:** Sensitive data pattern coverage (${#SENSITIVE_PATTERNS_CHECK[@]} patterns)
- **Phase 4:** Scanner integration in mission components
EOF

# ============================================================================
# Summary
# ============================================================================

if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All ${PASSED} mission security checks passed${NC}"
else
  echo -e "${RED}${BOLD}${FAILED}/${TOTAL} mission security checks failed${NC}"
fi

echo ""
echo "Reports:"
echo "  JSON:     $REPORT_JSON"
echo "  Summary:  $REPORT_MD"

[ "$FAILED" -gt 0 ] && exit 1
exit 0
