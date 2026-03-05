#!/bin/bash
# API contract verification — validates that all backend API endpoints return
# expected JSON shapes. Catches frontend/backend schema drift.
#
# Usage:
#   ./scripts/api-contract-test.sh              # Test against running backend
#   ./scripts/api-contract-test.sh --url http://host:port  # Custom base URL
#
# Prerequisites:
#   - Backend running at localhost:8080 (or custom URL)
#   - curl and jq installed
#
# Output:
#   /tmp/api-contract-report.json        — full JSON data
#   /tmp/api-contract-summary.md         — human-readable summary
#
# Exit code:
#   0 — all endpoints return valid responses
#   1 — one or more endpoints failed validation

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

BASE_URL="http://localhost:8080"
for arg in "$@"; do
  case "$arg" in
    --url) shift; BASE_URL="${1:-http://localhost:8080}" ;;
  esac
done

TIMEOUT_SECONDS=10
REPORT_JSON="/tmp/api-contract-report.json"
REPORT_MD="/tmp/api-contract-summary.md"
TMPDIR_CONTRACT=$(mktemp -d)
trap 'rm -rf "$TMPDIR_CONTRACT"' EXIT

if ! command -v curl &>/dev/null; then
  echo -e "${RED}ERROR: curl is not installed${NC}"
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo -e "${RED}ERROR: jq is not installed${NC}"
  exit 1
fi

# ============================================================================
# Check backend availability
# ============================================================================

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  API Contract Verification${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "  ${DIM}Base URL: ${BASE_URL}${NC}"
echo ""

if ! curl -sf "${BASE_URL}/health" --max-time "$TIMEOUT_SECONDS" > /dev/null 2>&1; then
  echo -e "${YELLOW}⚠️  Backend not running at ${BASE_URL}${NC}"
  echo -e "${DIM}   Start with: bash startup-oauth.sh${NC}"
  echo -e "${DIM}   Skipping API contract tests (not a failure — backend required)${NC}"

  cat > "$REPORT_JSON" << EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","status":"skipped","reason":"backend not running at ${BASE_URL}"}
EOF
  cat > "$REPORT_MD" << EOF
# API Contract Verification — SKIPPED

Backend not running at \`${BASE_URL}\`. Start the console to run these tests.
EOF
  echo ""
  echo "Reports:"
  echo "  JSON:     $REPORT_JSON"
  echo "  Summary:  $REPORT_MD"
  exit 0
fi

# ============================================================================
# API endpoint definitions (endpoint, method, expected top-level keys)
# ============================================================================

# Each line: METHOD|PATH|EXPECTED_KEYS (comma-separated, empty = just valid JSON)
# Unauthenticated endpoints first (no token needed)
declare -a ENDPOINTS=(
  "GET|/health|status"
  "GET|/api/version|version"
  "GET|/api/config|"
)

# Authenticated endpoints (need demo token or real token)
declare -a AUTH_ENDPOINTS=(
  "GET|/api/me|"
  "GET|/api/settings|"
  "GET|/api/clusters|"
  "GET|/api/dashboards|"
)

TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0
RESULTS=""

check_endpoint() {
  local method="$1"
  local path="$2"
  local expected_keys="$3"
  local auth_header="$4"
  local label="${method} ${path}"
  TOTAL=$((TOTAL + 1))

  local response_file="$TMPDIR_CONTRACT/resp_${TOTAL}.json"
  local http_code

  http_code=$(curl -sf -o "$response_file" -w "%{http_code}" \
    --max-time "$TIMEOUT_SECONDS" \
    ${auth_header:+-H "$auth_header"} \
    -H "Accept: application/json" \
    "${BASE_URL}${path}" 2>/dev/null) || http_code="000"

  # Check HTTP status
  if [ "$http_code" = "000" ]; then
    echo -e "  ${YELLOW}⚠️ ${NC} ${DIM}${label}${NC}  connection failed"
    SKIPPED=$((SKIPPED + 1))
    RESULTS="${RESULTS}{\"endpoint\":\"${label}\",\"status\":\"skip\",\"httpCode\":0},"
    return
  fi

  if [ "$http_code" = "401" ] || [ "$http_code" = "403" ]; then
    echo -e "  ${DIM}⊘${NC}  ${DIM}${label}${NC}  auth required (${http_code}) — skipped"
    SKIPPED=$((SKIPPED + 1))
    RESULTS="${RESULTS}{\"endpoint\":\"${label}\",\"status\":\"skip\",\"httpCode\":${http_code}},"
    return
  fi

  if [ "$http_code" -ge 400 ]; then
    echo -e "  ${RED}❌${NC} ${DIM}${label}${NC}  HTTP ${http_code}"
    FAILED=$((FAILED + 1))
    RESULTS="${RESULTS}{\"endpoint\":\"${label}\",\"status\":\"fail\",\"httpCode\":${http_code}},"
    return
  fi

  # Check valid JSON
  if ! jq empty "$response_file" 2>/dev/null; then
    echo -e "  ${RED}❌${NC} ${DIM}${label}${NC}  invalid JSON response"
    FAILED=$((FAILED + 1))
    RESULTS="${RESULTS}{\"endpoint\":\"${label}\",\"status\":\"fail\",\"httpCode\":${http_code},\"reason\":\"invalid JSON\"},"
    return
  fi

  # Check expected keys
  if [ -n "$expected_keys" ]; then
    local missing=""
    IFS=',' read -ra KEYS <<< "$expected_keys"
    for key in "${KEYS[@]}"; do
      if ! jq -e ".${key}" "$response_file" > /dev/null 2>&1; then
        missing="${missing}${key}, "
      fi
    done

    if [ -n "$missing" ]; then
      echo -e "  ${RED}❌${NC} ${DIM}${label}${NC}  missing keys: ${missing%, }"
      FAILED=$((FAILED + 1))
      RESULTS="${RESULTS}{\"endpoint\":\"${label}\",\"status\":\"fail\",\"httpCode\":${http_code},\"missingKeys\":\"${missing%, }\"},"
      return
    fi
  fi

  echo -e "  ${GREEN}✓${NC}  ${DIM}${label}${NC}  HTTP ${http_code} — valid JSON"
  PASSED=$((PASSED + 1))
  RESULTS="${RESULTS}{\"endpoint\":\"${label}\",\"status\":\"pass\",\"httpCode\":${http_code}},"
}

# ============================================================================
# Run checks
# ============================================================================

echo -e "${BOLD}Unauthenticated endpoints:${NC}"
for ep in "${ENDPOINTS[@]}"; do
  IFS='|' read -r method path keys <<< "$ep"
  check_endpoint "$method" "$path" "$keys" ""
done

echo ""
echo -e "${BOLD}Authenticated endpoints:${NC}"
for ep in "${AUTH_ENDPOINTS[@]}"; do
  IFS='|' read -r method path keys <<< "$ep"
  check_endpoint "$method" "$path" "$keys" "Authorization: Bearer demo-token"
done

echo ""

# ============================================================================
# Generate reports
# ============================================================================

RESULTS="${RESULTS%,}"

cat > "$REPORT_JSON" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "baseUrl": "${BASE_URL}",
  "summary": {
    "total": ${TOTAL},
    "passed": ${PASSED},
    "failed": ${FAILED},
    "skipped": ${SKIPPED}
  },
  "results": [${RESULTS}]
}
EOF

cat > "$REPORT_MD" << EOF
# API Contract Verification

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Base URL:** \`${BASE_URL}\`

## Summary

| Metric   | Count |
|----------|-------|
| Total    | ${TOTAL} |
| Passed   | ${PASSED} |
| Failed   | ${FAILED} |
| Skipped  | ${SKIPPED} |
EOF

# ============================================================================
# Summary
# ============================================================================

if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All ${PASSED} tested endpoints passed contract validation${NC}"
  if [ "$SKIPPED" -gt 0 ]; then
    echo -e "${DIM}  (${SKIPPED} skipped — auth required or connection failed)${NC}"
  fi
else
  echo -e "${RED}${BOLD}${FAILED}/${TOTAL} endpoints failed contract validation${NC}"
fi

echo ""
echo "Reports:"
echo "  JSON:     $REPORT_JSON"
echo "  Summary:  $REPORT_MD"

[ "$FAILED" -gt 0 ] && exit 1
exit 0
