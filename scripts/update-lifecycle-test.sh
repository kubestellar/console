#!/bin/bash
# Update mechanism verification — comprehensive test suite for the self-update
# lifecycle: concurrency safety, panic recovery, build timeouts, failure
# handling, npm retry logic, heartbeat, output capture, and source invariants.
#
# Usage:
#   ./scripts/update-lifecycle-test.sh              # Run all update tests
#
# Prerequisites:
#   - Go installed
#
# Output:
#   /tmp/update-lifecycle-report.json    — JSON test results
#   /tmp/update-lifecycle-summary.md     — human-readable summary
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

REPORT_JSON="/tmp/update-lifecycle-report.json"
REPORT_MD="/tmp/update-lifecycle-summary.md"
TMPDIR_UL=$(mktemp -d)
trap 'rm -rf "$TMPDIR_UL"' EXIT

if ! command -v go &>/dev/null; then
  echo -e "${RED}ERROR: Go is not installed${NC}"
  exit 1
fi

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Update Lifecycle Verification${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

TOTAL=0
PASSED=0
FAILED=0

# ============================================================================
# Phase 1: Update checker unit tests
# ============================================================================

echo -e "${BOLD}Phase 1: Update checker tests${NC}"

TEST_OUTPUT="$TMPDIR_UL/update-tests.txt"
TEST_EXIT=0
go test ./pkg/agent/... -run "TestTriggerNow|TestIsUpdating|TestStatus" -v -timeout 30s > "$TEST_OUTPUT" 2>&1 || TEST_EXIT=$?

GO_PASSED=$(grep -c "^--- PASS:" "$TEST_OUTPUT" 2>/dev/null || echo "0")
GO_FAILED_COUNT=$(grep -c "^--- FAIL:" "$TEST_OUTPUT" 2>/dev/null || echo "0")

TOTAL=$((TOTAL + 1))
if [ "$TEST_EXIT" -eq 0 ]; then
  echo -e "  ${GREEN}✓${NC}  Update checker tests passed (${GO_PASSED} tests)"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Update checker tests failed (${GO_FAILED_COUNT} failures)"
  grep "^--- FAIL:" "$TEST_OUTPUT" 2>/dev/null | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${NC}"
  done
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 2: Concurrent rejection stress test
# ============================================================================

echo -e "${BOLD}Phase 2: Concurrent rejection stress test${NC}"

STRESS_OUTPUT="$TMPDIR_UL/stress-tests.txt"
STRESS_EXIT=0
go test ./pkg/agent/... -run "TestTriggerNowConcurrentStress" -v -timeout 30s -count=3 > "$STRESS_OUTPUT" 2>&1 || STRESS_EXIT=$?

TOTAL=$((TOTAL + 1))
if [ "$STRESS_EXIT" -eq 0 ]; then
  echo -e "  ${GREEN}✓${NC}  Concurrent rejection stress test passed (3 runs)"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Concurrent rejection stress test failed"
  grep "FAIL\|Error" "$STRESS_OUTPUT" 2>/dev/null | head -5 | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${NC}"
  done
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 3: Panic recovery test
# ============================================================================

echo -e "${BOLD}Phase 3: Panic recovery test${NC}"

PANIC_OUTPUT="$TMPDIR_UL/panic-tests.txt"
PANIC_EXIT=0
go test ./pkg/agent/... -run "TestTriggerNowRecoversPanic|TestTriggerNowReleasesOnCompletion" -v -timeout 30s > "$PANIC_OUTPUT" 2>&1 || PANIC_EXIT=$?

TOTAL=$((TOTAL + 1))
if [ "$PANIC_EXIT" -eq 0 ]; then
  echo -e "  ${GREEN}✓${NC}  Panic recovery and flag release tests passed"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Panic recovery tests failed"
  grep "FAIL\|Error" "$PANIC_OUTPUT" 2>/dev/null | head -5 | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${NC}"
  done
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 4: 5-iteration developer update reliability loop
# ============================================================================

echo -e "${BOLD}Phase 4: Developer update reliability loop (5 iterations)${NC}"

LOOP_OUTPUT="$TMPDIR_UL/loop-tests.txt"
LOOP_EXIT=0
go test ./pkg/agent/... -run "TestDeveloperUpdateLoop_5x" -v -timeout 120s > "$LOOP_OUTPUT" 2>&1 || LOOP_EXIT=$?

TOTAL=$((TOTAL + 1))
if [ "$LOOP_EXIT" -eq 0 ]; then
  echo -e "  ${GREEN}✓${NC}  5-iteration reliability loop passed"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} 5-iteration reliability loop failed"
  grep "FAIL\|Error" "$LOOP_OUTPUT" 2>/dev/null | head -5 | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${NC}"
  done
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 5: Build timeout handling
# ============================================================================

echo -e "${BOLD}Phase 5: Build timeout handling${NC}"

TIMEOUT_OUTPUT="$TMPDIR_UL/timeout-tests.txt"
TIMEOUT_EXIT=0
go test ./pkg/agent/... -run "TestDeveloperUpdate_BuildTimeout" -v -timeout 30s > "$TIMEOUT_OUTPUT" 2>&1 || TIMEOUT_EXIT=$?

TOTAL=$((TOTAL + 1))
if [ "$TIMEOUT_EXIT" -eq 0 ]; then
  echo -e "  ${GREEN}✓${NC}  Build timeout handling passed"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Build timeout handling failed"
  grep "FAIL\|Error" "$TIMEOUT_OUTPUT" 2>/dev/null | head -5 | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${NC}"
  done
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 6: Build failure with output capture
# ============================================================================

echo -e "${BOLD}Phase 6: Build failure with output capture${NC}"

BUILDFAIL_OUTPUT="$TMPDIR_UL/buildfail-tests.txt"
BUILDFAIL_EXIT=0
go test ./pkg/agent/... -run "TestDeveloperUpdate_BuildFailure" -v -timeout 30s > "$BUILDFAIL_OUTPUT" 2>&1 || BUILDFAIL_EXIT=$?

TOTAL=$((TOTAL + 1))
if [ "$BUILDFAIL_EXIT" -eq 0 ]; then
  echo -e "  ${GREEN}✓${NC}  Build failure output capture passed"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Build failure output capture failed"
  grep "FAIL\|Error" "$BUILDFAIL_OUTPUT" 2>/dev/null | head -5 | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${NC}"
  done
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 7: npm install retry logic
# ============================================================================

echo -e "${BOLD}Phase 7: npm install retry logic${NC}"

RETRY_OUTPUT="$TMPDIR_UL/retry-tests.txt"
RETRY_EXIT=0
go test ./pkg/agent/... -run "TestDeveloperUpdate_NpmInstallRetry" -v -timeout 30s > "$RETRY_OUTPUT" 2>&1 || RETRY_EXIT=$?

TOTAL=$((TOTAL + 1))
if [ "$RETRY_EXIT" -eq 0 ]; then
  echo -e "  ${GREEN}✓${NC}  npm install retry logic passed"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} npm install retry logic failed"
  grep "FAIL\|Error" "$RETRY_OUTPUT" 2>/dev/null | head -5 | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${NC}"
  done
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 8: Heartbeat during long builds
# ============================================================================

echo -e "${BOLD}Phase 8: Heartbeat during long builds${NC}"

HEARTBEAT_OUTPUT="$TMPDIR_UL/heartbeat-tests.txt"
HEARTBEAT_EXIT=0
go test ./pkg/agent/... -run "TestDeveloperUpdate_HeartbeatDuringBuild" -v -timeout 120s > "$HEARTBEAT_OUTPUT" 2>&1 || HEARTBEAT_EXIT=$?

TOTAL=$((TOTAL + 1))
if [ "$HEARTBEAT_EXIT" -eq 0 ]; then
  echo -e "  ${GREEN}✓${NC}  Heartbeat during long builds passed"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Heartbeat during long builds failed"
  grep "FAIL\|Error" "$HEARTBEAT_OUTPUT" 2>/dev/null | head -5 | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${NC}"
  done
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 9: Output capture utilities
# ============================================================================

echo -e "${BOLD}Phase 9: Output capture and utility tests${NC}"

UTIL_OUTPUT="$TMPDIR_UL/util-tests.txt"
UTIL_EXIT=0
go test ./pkg/agent/... -run "TestRunBuildCmd_OutputCapture|TestTailLines|TestBuildErrorDetail|TestMockPathResolution" -v -timeout 30s > "$UTIL_OUTPUT" 2>&1 || UTIL_EXIT=$?

TOTAL=$((TOTAL + 1))
if [ "$UTIL_EXIT" -eq 0 ]; then
  echo -e "  ${GREEN}✓${NC}  Output capture and utility tests passed"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Output capture and utility tests failed"
  grep "FAIL\|Error" "$UTIL_OUTPUT" 2>/dev/null | head -5 | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${NC}"
  done
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 10: Verify update checker source patterns
# ============================================================================

echo -e "${BOLD}Phase 4: Update mechanism source verification${NC}"

CHECKER_FILE="pkg/agent/update_checker.go"

TOTAL=$((TOTAL + 1))
if grep -q "atomic" "$CHECKER_FILE" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  Atomic concurrency control present"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Missing atomic concurrency control"
  FAILED=$((FAILED + 1))
fi

TOTAL=$((TOTAL + 1))
if grep -q "defer" "$CHECKER_FILE" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  Defer-based cleanup present"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Missing defer-based cleanup"
  FAILED=$((FAILED + 1))
fi

TOTAL=$((TOTAL + 1))
if grep -q "channel\|Channel" "$CHECKER_FILE" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  Update channel support present"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Missing update channel support"
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
    "unitTests": { "exit_code": ${TEST_EXIT}, "passed": ${GO_PASSED} },
    "stressTest": { "exit_code": ${STRESS_EXIT} },
    "panicRecovery": { "exit_code": ${PANIC_EXIT} },
    "reliabilityLoop": { "exit_code": ${LOOP_EXIT} },
    "buildTimeout": { "exit_code": ${TIMEOUT_EXIT} },
    "buildFailure": { "exit_code": ${BUILDFAIL_EXIT} },
    "npmRetry": { "exit_code": ${RETRY_EXIT} },
    "heartbeat": { "exit_code": ${HEARTBEAT_EXIT} },
    "utilities": { "exit_code": ${UTIL_EXIT} }
  }
}
EOF

cat > "$REPORT_MD" << EOF
# Update Lifecycle Verification

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)

## Summary

| Metric   | Count |
|----------|-------|
| Total    | ${TOTAL} |
| Passed   | ${PASSED} |
| Failed   | ${FAILED} |

## Phases

- **Phase 1:** Update checker unit tests — $([ "$TEST_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL")
- **Phase 2:** Concurrent rejection stress — $([ "$STRESS_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL")
- **Phase 3:** Panic recovery — $([ "$PANIC_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL")
- **Phase 4:** 5x reliability loop — $([ "$LOOP_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL")
- **Phase 5:** Build timeout — $([ "$TIMEOUT_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL")
- **Phase 6:** Build failure capture — $([ "$BUILDFAIL_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL")
- **Phase 7:** npm retry — $([ "$RETRY_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL")
- **Phase 8:** Heartbeat — $([ "$HEARTBEAT_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL")
- **Phase 9:** Utilities — $([ "$UTIL_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL")
- **Phase 10:** Source pattern verification
EOF

# ============================================================================
# Summary
# ============================================================================

if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All ${PASSED} update lifecycle checks passed${NC}"
else
  echo -e "${RED}${BOLD}${FAILED}/${TOTAL} update lifecycle checks failed${NC}"
fi

echo ""
echo "Reports:"
echo "  JSON:     $REPORT_JSON"
echo "  Summary:  $REPORT_MD"

[ "$FAILED" -gt 0 ] && exit 1
exit 0
