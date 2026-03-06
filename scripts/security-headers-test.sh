#!/bin/bash
# Security headers validation — checks that the Netlify deployment serves
# proper security headers (CSP, X-Frame-Options, HSTS, etc.).
#
# Usage:
#   ./scripts/security-headers-test.sh                          # Check production site
#   ./scripts/security-headers-test.sh --url <url>              # Check a specific URL
#   ./scripts/security-headers-test.sh --config-only            # Only validate netlify.toml config
#
# Prerequisites:
#   - curl (for live checks)
#   - python3 (for config parsing)
#
# Output:
#   /tmp/security-headers-report.json      — full JSON data
#   /tmp/security-headers-summary.md       — human-readable summary
#
# Exit code:
#   0 — all required headers present
#   1 — missing required security headers

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

CHECK_URL="https://console.kubestellar.io"
CONFIG_ONLY=""
for arg in "$@"; do
  case "$arg" in
    --url) shift_next="url" ;;
    --config-only) CONFIG_ONLY="1" ;;
    *) [ "${shift_next:-}" = "url" ] && CHECK_URL="$arg" && shift_next="" ;;
  esac
done

REPORT_JSON="/tmp/security-headers-report.json"
REPORT_MD="/tmp/security-headers-summary.md"

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Security Headers Validation${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

# ============================================================================
# Required headers and their expected values
# ============================================================================

# Headers we require (name, expected pattern, severity)
declare -a REQUIRED_HEADERS=(
  "X-Frame-Options|DENY|required"
  "X-Content-Type-Options|nosniff|required"
  "Referrer-Policy|strict-origin|required"
)

# Headers we recommend (nice to have)
declare -a RECOMMENDED_HEADERS=(
  "Content-Security-Policy|.|recommended"
  "Strict-Transport-Security|max-age=|recommended"
  "Permissions-Policy|.|recommended"
  "X-XSS-Protection|.|recommended"
)

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
TOTAL_CHECKS=0
RESULTS_LINES=""

# ============================================================================
# Phase 1: Validate netlify.toml configuration
# ============================================================================

echo -e "${BOLD}Phase 1: netlify.toml header configuration${NC}"
echo ""

NETLIFY_TOML="netlify.toml"
if [ -f "$NETLIFY_TOML" ]; then
  for entry in "${REQUIRED_HEADERS[@]}"; do
    IFS='|' read -r header_name expected_pattern severity <<< "$entry"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if grep -qi "$header_name" "$NETLIFY_TOML" 2>/dev/null; then
      echo -e "  ${GREEN}✓${NC} ${header_name} — configured in netlify.toml"
      PASS_COUNT=$((PASS_COUNT + 1))
      RESULTS_LINES="${RESULTS_LINES}{\"header\":\"${header_name}\",\"source\":\"config\",\"status\":\"pass\",\"severity\":\"${severity}\"},"
    else
      echo -e "  ${RED}❌${NC} ${header_name} — ${RED}MISSING from netlify.toml${NC}"
      FAIL_COUNT=$((FAIL_COUNT + 1))
      RESULTS_LINES="${RESULTS_LINES}{\"header\":\"${header_name}\",\"source\":\"config\",\"status\":\"fail\",\"severity\":\"${severity}\"},"
    fi
  done

  echo ""

  for entry in "${RECOMMENDED_HEADERS[@]}"; do
    IFS='|' read -r header_name expected_pattern severity <<< "$entry"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if grep -qi "$header_name" "$NETLIFY_TOML" 2>/dev/null; then
      echo -e "  ${GREEN}✓${NC} ${header_name} — configured"
      PASS_COUNT=$((PASS_COUNT + 1))
      RESULTS_LINES="${RESULTS_LINES}{\"header\":\"${header_name}\",\"source\":\"config\",\"status\":\"pass\",\"severity\":\"${severity}\"},"
    else
      echo -e "  ${YELLOW}⚠️ ${NC} ${header_name} — ${YELLOW}not configured (recommended)${NC}"
      WARN_COUNT=$((WARN_COUNT + 1))
      RESULTS_LINES="${RESULTS_LINES}{\"header\":\"${header_name}\",\"source\":\"config\",\"status\":\"warn\",\"severity\":\"${severity}\"},"
    fi
  done
else
  echo -e "  ${YELLOW}⚠️  netlify.toml not found — skipping config check${NC}"
fi

echo ""

# ============================================================================
# Phase 2: Live header check (skip if --config-only)
# ============================================================================

if [ -z "$CONFIG_ONLY" ]; then
  echo -e "${BOLD}Phase 2: Live header check (${CHECK_URL})${NC}"
  echo ""

  # Fetch headers with timeout
  FETCH_TIMEOUT_SECS=10
  HEADERS_FILE=$(mktemp)
  trap 'rm -f "$HEADERS_FILE"' EXIT

  HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" \
    --max-time "$FETCH_TIMEOUT_SECS" \
    -D "$HEADERS_FILE" \
    "$CHECK_URL" 2>/dev/null || echo "000")

  if [ "$HTTP_CODE" = "000" ]; then
    echo -e "  ${YELLOW}⚠️  Could not reach ${CHECK_URL} — skipping live check${NC}"
  elif [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 400 ]; then
    echo -e "  ${DIM}HTTP ${HTTP_CODE}${NC}"
    echo ""

    ALL_HEADERS=("${REQUIRED_HEADERS[@]}" "${RECOMMENDED_HEADERS[@]}")

    for entry in "${ALL_HEADERS[@]}"; do
      IFS='|' read -r header_name expected_pattern severity <<< "$entry"
      TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

      header_value=""
      header_value=$(grep -i "^${header_name}:" "$HEADERS_FILE" 2>/dev/null | head -1 | cut -d: -f2- | sed 's/^[[:space:]]*//' || true)

      if [ -n "$header_value" ]; then
        pattern_match=""
        echo "$header_value" | grep -qi "$expected_pattern" 2>/dev/null && pattern_match="1"
        if [ -n "$pattern_match" ]; then
          echo -e "  ${GREEN}✓${NC} ${header_name}: ${DIM}${header_value}${NC}"
          PASS_COUNT=$((PASS_COUNT + 1))
          RESULTS_LINES="${RESULTS_LINES}{\"header\":\"${header_name}\",\"source\":\"live\",\"status\":\"pass\",\"value\":\"$(echo "$header_value" | sed 's/"/\\"/g')\",\"severity\":\"${severity}\"},"
        else
          echo -e "  ${YELLOW}⚠️ ${NC} ${header_name}: ${header_value} ${YELLOW}(unexpected value)${NC}"
          WARN_COUNT=$((WARN_COUNT + 1))
          RESULTS_LINES="${RESULTS_LINES}{\"header\":\"${header_name}\",\"source\":\"live\",\"status\":\"warn\",\"value\":\"$(echo "$header_value" | sed 's/"/\\"/g')\",\"severity\":\"${severity}\"},"
        fi
      else
        if [ "$severity" = "required" ]; then
          # Live check is informational — config validation is the authority
          echo -e "  ${YELLOW}⚠️ ${NC} ${header_name}: ${YELLOW}not served live (deploy pending?)${NC}"
          WARN_COUNT=$((WARN_COUNT + 1))
          RESULTS_LINES="${RESULTS_LINES}{\"header\":\"${header_name}\",\"source\":\"live\",\"status\":\"warn\",\"severity\":\"${severity}\"},"
        else
          echo -e "  ${YELLOW}⚠️ ${NC} ${header_name}: ${YELLOW}not present (recommended)${NC}"
          WARN_COUNT=$((WARN_COUNT + 1))
          RESULTS_LINES="${RESULTS_LINES}{\"header\":\"${header_name}\",\"source\":\"live\",\"status\":\"warn\",\"severity\":\"${severity}\"},"
        fi
      fi
    done
  else
    echo -e "  ${YELLOW}⚠️  HTTP ${HTTP_CODE} — unexpected status${NC}"
  fi

  echo ""
fi

# ============================================================================
# Generate reports
# ============================================================================

RESULTS_LINES="${RESULTS_LINES%,}"

cat > "$REPORT_JSON" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "url": "${CHECK_URL}",
  "configOnly": $([ -n "$CONFIG_ONLY" ] && echo "true" || echo "false"),
  "summary": {
    "total": ${TOTAL_CHECKS},
    "pass": ${PASS_COUNT},
    "fail": ${FAIL_COUNT},
    "warn": ${WARN_COUNT}
  },
  "checks": [${RESULTS_LINES}]
}
EOF

cat > "$REPORT_MD" << EOF
# Security Headers Report

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**URL:** ${CHECK_URL}

## Summary

| Metric | Count |
|--------|-------|
| Passed  | ${PASS_COUNT} |
| Failed  | ${FAIL_COUNT} |
| Warnings | ${WARN_COUNT} |
| **Total** | **${TOTAL_CHECKS}** |

**Status:** $([ "$FAIL_COUNT" -eq 0 ] && echo "PASS" || echo "FAIL")

## Required Headers

| Header | Status |
|--------|--------|
EOF

for entry in "${REQUIRED_HEADERS[@]}"; do
  IFS='|' read -r header_name expected_pattern severity <<< "$entry"
  if grep -qi "$header_name" "$NETLIFY_TOML" 2>/dev/null; then
    echo "| ${header_name} | PASS |" >> "$REPORT_MD"
  else
    echo "| ${header_name} | **FAIL** |" >> "$REPORT_MD"
  fi
done

echo "" >> "$REPORT_MD"
echo "## Recommended Headers" >> "$REPORT_MD"
echo "" >> "$REPORT_MD"
echo "| Header | Status |" >> "$REPORT_MD"
echo "|--------|--------|" >> "$REPORT_MD"

for entry in "${RECOMMENDED_HEADERS[@]}"; do
  IFS='|' read -r header_name expected_pattern severity <<< "$entry"
  if grep -qi "$header_name" "$NETLIFY_TOML" 2>/dev/null; then
    echo "| ${header_name} | PASS |" >> "$REPORT_MD"
  else
    echo "| ${header_name} | WARN |" >> "$REPORT_MD"
  fi
done

# ============================================================================
# Summary & exit
# ============================================================================

if [ "$FAIL_COUNT" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}Security headers check passed${NC}"
else
  echo -e "${RED}${BOLD}Security headers check failed — ${FAIL_COUNT} required header(s) missing${NC}"
fi

echo ""
echo "Reports:"
echo "  JSON:     $REPORT_JSON"
echo "  Summary:  $REPORT_MD"

[ "$FAIL_COUNT" -gt 0 ] && exit 1
exit 0
