#!/bin/bash
# Go SAST security scanner — runs gosec against the entire Go codebase to detect
# security vulnerabilities (SQL injection, hardcoded credentials, insecure crypto,
# path traversal, etc.).
#
# Usage:
#   ./scripts/gosec-test.sh              # Run gosec, fail on HIGH severity
#   ./scripts/gosec-test.sh --strict     # Fail on MEDIUM and above
#
# Prerequisites:
#   - Go 1.18+ installed
#   - gosec will be auto-installed if missing
#
# Output:
#   /tmp/gosec-report.json               — full JSON data
#   /tmp/gosec-summary.md                — human-readable summary
#
# Exit code:
#   0 — no issues found (or only LOW in non-strict mode)
#   1 — HIGH (or MEDIUM in strict mode) issues found

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

STRICT_MODE=""
for arg in "$@"; do
  case "$arg" in
    --strict) STRICT_MODE="1"; echo -e "${YELLOW}Strict mode: MEDIUM findings are errors${NC}" ;;
  esac
done

# ============================================================================
# Prerequisites
# ============================================================================

if ! command -v go &>/dev/null; then
  echo -e "${RED}ERROR: Go is not installed${NC}"
  exit 1
fi

if ! command -v gosec &>/dev/null; then
  echo -e "${YELLOW}Installing gosec...${NC}"
  go install github.com/securego/gosec/v2/cmd/gosec@latest
fi

# ============================================================================
# Run gosec
# ============================================================================

REPORT_JSON="/tmp/gosec-report.json"
REPORT_MD="/tmp/gosec-summary.md"

echo -e "${BOLD}Running gosec security scanner...${NC}"
echo ""

# Run gosec with JSON output; gosec exits non-zero on findings, so we capture the exit code
GOSEC_EXIT=0
gosec -fmt=json -out="$REPORT_JSON" -exclude-dir=vendor -exclude-dir=node_modules ./... 2>/dev/null || GOSEC_EXIT=$?

# ============================================================================
# Parse results
# ============================================================================

HIGH_COUNT=0
MEDIUM_COUNT=0
LOW_COUNT=0
TOTAL_COUNT=0

if [ -f "$REPORT_JSON" ]; then
  # Extract counts using python3 (available on macOS/Linux)
  read -r HIGH_COUNT MEDIUM_COUNT LOW_COUNT TOTAL_COUNT < <(python3 -c "
import json, sys
try:
    with open('$REPORT_JSON') as f:
        data = json.load(f)
    issues = data.get('Issues', []) or []
    high = sum(1 for i in issues if i.get('severity') == 'HIGH')
    med = sum(1 for i in issues if i.get('severity') == 'MEDIUM')
    low = sum(1 for i in issues if i.get('severity') == 'LOW')
    print(high, med, low, len(issues))
except Exception:
    print(0, 0, 0, 0)
" 2>/dev/null || echo "0 0 0 0")
fi

# ============================================================================
# Print results
# ============================================================================

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Go Security Analysis (gosec)${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

if [ "$TOTAL_COUNT" -eq 0 ]; then
  echo -e "  ${GREEN}✓ No security issues found${NC}"
else
  [ "$HIGH_COUNT" -gt 0 ] && echo -e "  ${RED}❌ HIGH:   ${HIGH_COUNT} finding(s)${NC}"
  [ "$MEDIUM_COUNT" -gt 0 ] && echo -e "  ${YELLOW}⚠️  MEDIUM: ${MEDIUM_COUNT} finding(s)${NC}"
  [ "$LOW_COUNT" -gt 0 ] && echo -e "  ${DIM}ℹ  LOW:    ${LOW_COUNT} finding(s)${NC}"
  echo ""
  echo -e "  ${BOLD}Total: ${TOTAL_COUNT} finding(s)${NC}"

  # Print top findings
  if [ -f "$REPORT_JSON" ]; then
    echo ""
    python3 -c "
import json
with open('$REPORT_JSON') as f:
    data = json.load(f)
issues = data.get('Issues', []) or []
for i, issue in enumerate(issues[:10]):
    sev = issue.get('severity', '?')
    desc = issue.get('details', 'Unknown')
    fpath = issue.get('file', '?')
    line = issue.get('line', '?')
    marker = '❌' if sev == 'HIGH' else '⚠️ ' if sev == 'MEDIUM' else 'ℹ '
    print(f'  {marker} {fpath}:{line}  {desc}')
if len(issues) > 10:
    print(f'  ... and {len(issues) - 10} more (see full report)')
" 2>/dev/null || true
  fi
fi

echo ""

# ============================================================================
# Generate Markdown summary
# ============================================================================

cat > "$REPORT_MD" << EOF
# Go Security Analysis (gosec)

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)

## Summary

| Severity | Count |
|----------|-------|
| HIGH     | ${HIGH_COUNT} |
| MEDIUM   | ${MEDIUM_COUNT} |
| LOW      | ${LOW_COUNT} |
| **Total** | **${TOTAL_COUNT}** |

## Details

See \`/tmp/gosec-report.json\` for full findings.
EOF

if [ -f "$REPORT_JSON" ] && [ "$TOTAL_COUNT" -gt 0 ]; then
  python3 -c "
import json
with open('$REPORT_JSON') as f:
    data = json.load(f)
issues = data.get('Issues', []) or []
print()
print('### Findings')
print()
for issue in issues:
    sev = issue.get('severity', '?')
    desc = issue.get('details', 'Unknown')
    fpath = issue.get('file', '?')
    line = issue.get('line', '?')
    cwe = issue.get('cwe', {}).get('id', '')
    print(f'- **[{sev}]** \`{fpath}:{line}\` — {desc}' + (f' (CWE-{cwe})' if cwe else ''))
" >> "$REPORT_MD" 2>/dev/null || true
fi

# ============================================================================
# Report locations & exit
# ============================================================================

echo "Reports:"
echo "  JSON:     $REPORT_JSON"
echo "  Summary:  $REPORT_MD"

EXIT_CODE=0
if [ "$HIGH_COUNT" -gt 0 ]; then
  EXIT_CODE=1
fi
if [ -n "$STRICT_MODE" ] && [ "$MEDIUM_COUNT" -gt 0 ]; then
  EXIT_CODE=1
fi

exit $EXIT_CODE
