#!/bin/bash
# Go native fuzz testing — runs fuzz tests for crypto, auth, and mission import
# handlers to detect crashes, panics, and edge cases.
#
# Usage:
#   ./scripts/api-fuzz-test.sh              # Run all fuzz tests (30s each)
#   ./scripts/api-fuzz-test.sh --duration 60s  # Custom duration per target
#
# Prerequisites:
#   - Go 1.18+ installed (native fuzzing support)
#
# Output:
#   /tmp/fuzz-report.json                — JSON results
#   /tmp/fuzz-summary.md                 — human-readable summary
#
# Exit code:
#   0 — no crashes found
#   1 — one or more fuzz targets crashed

set -euo pipefail

cd "$(dirname "$0")/.."

# ============================================================================
# Colors & argument parsing
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

FUZZ_DURATION="30s"
for arg in "$@"; do
  case "$arg" in
    --duration) shift; FUZZ_DURATION="${1:-30s}" ;;
  esac
done

if ! command -v go &>/dev/null; then
  echo -e "${RED}ERROR: Go is not installed${NC}"
  exit 1
fi

# ============================================================================
# Fuzz targets
# ============================================================================

REPORT_JSON="/tmp/fuzz-report.json"
REPORT_MD="/tmp/fuzz-summary.md"
TMPDIR_FUZZ=$(mktemp -d)
trap 'rm -rf "$TMPDIR_FUZZ"' EXIT

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Go Fuzz Testing (${FUZZ_DURATION} per target)${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

declare -a TARGETS=(
  "pkg/settings:FuzzDecrypt"
  "pkg/settings:FuzzEncryptDecrypt"
  "pkg/api/middleware:FuzzValidateJWT"
)

TOTAL=0
PASSED=0
FAILED=0
RESULTS=""

for target in "${TARGETS[@]}"; do
  PKG=$(echo "$target" | cut -d: -f1)
  FUNC=$(echo "$target" | cut -d: -f2)
  TOTAL=$((TOTAL + 1))

  echo -e "  ${DIM}[$TOTAL/${#TARGETS[@]}]${NC} Fuzzing ${BOLD}${PKG}/${FUNC}${NC} ..."

  OUTPUT_FILE="$TMPDIR_FUZZ/${FUNC}.txt"
  FUZZ_EXIT=0
  go test "./${PKG}/..." -fuzz="^${FUNC}$" -fuzztime="$FUZZ_DURATION" -fuzzminimizetime=10s > "$OUTPUT_FILE" 2>&1 || FUZZ_EXIT=$?

  if [ "$FUZZ_EXIT" -eq 0 ]; then
    echo -e "    ${GREEN}✓ PASS${NC} — no crashes"
    PASSED=$((PASSED + 1))
    RESULTS="${RESULTS}{\"target\":\"${PKG}/${FUNC}\",\"status\":\"pass\",\"details\":\"no crashes\"},"
  else
    echo -e "    ${RED}❌ CRASH${NC} — fuzz target found an input that causes failure"
    # Show crash details
    grep -A 5 "FAIL\|panic\|runtime error" "$OUTPUT_FILE" 2>/dev/null | head -10 | while IFS= read -r line; do
      echo -e "      ${DIM}${line}${NC}"
    done
    FAILED=$((FAILED + 1))
    CRASH_DETAIL=$(grep "FAIL\|panic" "$OUTPUT_FILE" 2>/dev/null | head -1 | tr '"' "'")
    RESULTS="${RESULTS}{\"target\":\"${PKG}/${FUNC}\",\"status\":\"fail\",\"details\":\"${CRASH_DETAIL}\"},"
  fi
done

echo ""

# ============================================================================
# Generate reports
# ============================================================================

# Remove trailing comma from RESULTS
RESULTS="${RESULTS%,}"

cat > "$REPORT_JSON" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "fuzzDuration": "${FUZZ_DURATION}",
  "summary": {
    "total": ${TOTAL},
    "passed": ${PASSED},
    "failed": ${FAILED}
  },
  "results": [${RESULTS}]
}
EOF

cat > "$REPORT_MD" << EOF
# Go Fuzz Test Results

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Duration per target:** ${FUZZ_DURATION}

## Summary

| Metric   | Count |
|----------|-------|
| Total    | ${TOTAL} |
| Passed   | ${PASSED} |
| Failed   | ${FAILED} |

## Targets

| Target | Status |
|--------|--------|
EOF

for target in "${TARGETS[@]}"; do
  PKG=$(echo "$target" | cut -d: -f1)
  FUNC=$(echo "$target" | cut -d: -f2)
  OUTPUT_FILE="$TMPDIR_FUZZ/${FUNC}.txt"
  if grep -q "FAIL" "$OUTPUT_FILE" 2>/dev/null; then
    echo "| \`${PKG}/${FUNC}\` | FAIL |" >> "$REPORT_MD"
  else
    echo "| \`${PKG}/${FUNC}\` | PASS |" >> "$REPORT_MD"
  fi
done

# ============================================================================
# Summary
# ============================================================================

if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All ${TOTAL} fuzz targets passed${NC}"
else
  echo -e "${RED}${BOLD}${FAILED}/${TOTAL} fuzz targets found crashes${NC}"
fi

echo ""
echo "Reports:"
echo "  JSON:     $REPORT_JSON"
echo "  Summary:  $REPORT_MD"

[ "$FAILED" -gt 0 ] && exit 1
exit 0
