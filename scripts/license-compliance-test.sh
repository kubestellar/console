#!/bin/bash
# License compliance audit — checks npm and Go dependencies for license
# compatibility. Flags GPL-3.0/AGPL-3.0 incompatible licenses.
#
# Usage:
#   ./scripts/license-compliance-test.sh              # Run all checks
#   ./scripts/license-compliance-test.sh --strict     # Fail on any unknown license
#
# Prerequisites:
#   - Node.js and npm installed
#   - Go installed
#   - license-checker will be auto-installed via npx
#   - go-licenses will be auto-installed if missing
#
# Output:
#   /tmp/license-compliance-report.json    — JSON data
#   /tmp/license-compliance-summary.md     — human-readable summary
#
# Exit code:
#   0 — no incompatible licenses found
#   1 — incompatible licenses detected

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
    --strict) STRICT_MODE="1" ;;
  esac
done

REPORT_JSON="/tmp/license-compliance-report.json"
REPORT_MD="/tmp/license-compliance-summary.md"
TMPDIR_LIC=$(mktemp -d)
trap 'rm -rf "$TMPDIR_LIC"' EXIT

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  License Compliance Audit${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

# Licenses that are incompatible with Apache-2.0 / CNCF requirements
# Note: Use word boundaries (\b) for Unlicense to avoid matching npm's UNLICENSED
BLOCKED_LICENSES="GPL-3.0|AGPL-3.0|AGPL-1.0|GPL-3.0-only|GPL-3.0-or-later|AGPL-3.0-only|AGPL-3.0-or-later|SSPL|BSL"

NPM_STATUS="pass"
NPM_TOTAL=0
NPM_FLAGGED=0
GO_STATUS="pass"
GO_TOTAL=0
GO_FLAGGED=0

# ============================================================================
# Phase 1: npm license check
# ============================================================================

echo -e "${BOLD}Phase 1: npm dependency licenses${NC}"

if [ -d "web" ] && [ -f "web/package.json" ]; then
  cd web
  LICENSE_OUTPUT="$TMPDIR_LIC/npm-licenses.json"

  npx --yes license-checker --json --production > "$LICENSE_OUTPUT" 2>/dev/null || true

  NPM_TOTAL=$(python3 -c "
import json
try:
    with open('$LICENSE_OUTPUT') as f:
        data = json.load(f)
    print(len(data))
except Exception:
    print(0)
" 2>/dev/null || echo "0")

  NPM_FLAGGED=$(python3 -c "
import json, re
blocked = re.compile(r'$BLOCKED_LICENSES', re.IGNORECASE)
try:
    with open('$LICENSE_OUTPUT') as f:
        data = json.load(f)
    flagged = 0
    for pkg, info in data.items():
        # Skip the project itself
        if pkg.startswith('kubestellar-console@'):
            continue
        lic = info.get('licenses', '')
        if isinstance(lic, list):
            lic = ', '.join(lic)
        lic_str = str(lic)
        if blocked.search(lic_str) or lic_str.strip() == 'Unlicense':
            print(f'  BLOCKED: {pkg} ({lic})')
            flagged += 1
    # Print count on last line
    print(f'COUNT:{flagged}')
except Exception as e:
    print(f'COUNT:0')
" 2>/dev/null | tee "$TMPDIR_LIC/npm-flagged.txt")

  # Extract just the count
  NPM_FLAGGED=$(grep "^COUNT:" "$TMPDIR_LIC/npm-flagged.txt" 2>/dev/null | tail -1 | cut -d: -f2 || echo "0")
  # Show blocked packages (lines before COUNT)
  { grep "^  BLOCKED:" "$TMPDIR_LIC/npm-flagged.txt" 2>/dev/null || true; } | while IFS= read -r line; do
    echo -e "  ${RED}${line}${NC}"
  done

  if [ "$NPM_FLAGGED" -gt 0 ]; then
    echo -e "  ${RED}❌ ${NPM_FLAGGED} packages with blocked licenses${NC}"
    NPM_STATUS="fail"
  else
    echo -e "  ${GREEN}✓ ${NPM_TOTAL} packages — no blocked licenses${NC}"
  fi

  cd ..
else
  echo -e "  ${YELLOW}⚠️  web/package.json not found — skipping${NC}"
  NPM_STATUS="skip"
fi

echo ""

# ============================================================================
# Phase 2: Go license check
# ============================================================================

echo -e "${BOLD}Phase 2: Go dependency licenses${NC}"

if command -v go &>/dev/null; then
  # Use go-licenses if available, otherwise fall back to go list
  GO_LICENSE_OUTPUT="$TMPDIR_LIC/go-licenses.txt"

  if command -v go-licenses &>/dev/null; then
    go-licenses report ./... 2>/dev/null > "$GO_LICENSE_OUTPUT" || true
  else
    # Fallback: extract license info from go.sum / module info
    go list -m -json all 2>/dev/null | python3 -c "
import json, sys
try:
    decoder = json.JSONDecoder()
    text = sys.stdin.read()
    idx = 0
    while idx < len(text):
        text = text[idx:].lstrip()
        if not text:
            break
        obj, end = decoder.raw_decode(text)
        path = obj.get('Path', '')
        version = obj.get('Version', '')
        print(f'{path}@{version}')
        idx = end
except Exception:
    pass
" > "$GO_LICENSE_OUTPUT" 2>/dev/null || true
  fi

  GO_TOTAL=$(wc -l < "$GO_LICENSE_OUTPUT" 2>/dev/null | tr -d ' ' || echo "0")

  # Check for blocked licenses in Go deps (if go-licenses was used)
  GO_FLAGGED=0
  if command -v go-licenses &>/dev/null; then
    GO_FLAGGED=$(grep -ciE "$BLOCKED_LICENSES" "$GO_LICENSE_OUTPUT" 2>/dev/null || echo "0")
  fi

  if [ "$GO_FLAGGED" -gt 0 ]; then
    echo -e "  ${RED}❌ ${GO_FLAGGED} Go modules with blocked licenses${NC}"
    grep -iE "$BLOCKED_LICENSES" "$GO_LICENSE_OUTPUT" 2>/dev/null | head -10 | while IFS= read -r line; do
      echo -e "    ${DIM}${line}${NC}"
    done
    GO_STATUS="fail"
  else
    echo -e "  ${GREEN}✓ ${GO_TOTAL} Go modules — no blocked licenses detected${NC}"
    if ! command -v go-licenses &>/dev/null; then
      echo -e "    ${DIM}(install go-licenses for detailed analysis: go install github.com/google/go-licenses@latest)${NC}"
    fi
  fi
else
  echo -e "  ${YELLOW}⚠️  Go not installed — skipping${NC}"
  GO_STATUS="skip"
fi

echo ""

# ============================================================================
# Phase 3: Project license file check
# ============================================================================

echo -e "${BOLD}Phase 3: Project license files${NC}"

PROJECT_LIC_STATUS="pass"
PROJECT_LIC_CHECKS=0
PROJECT_LIC_PASSED=0

PROJECT_LIC_CHECKS=$((PROJECT_LIC_CHECKS + 1))
if [ -f "LICENSE" ] || [ -f "LICENSE.md" ] || [ -f "LICENSE.txt" ]; then
  echo -e "  ${GREEN}✓${NC}  LICENSE file present"
  PROJECT_LIC_PASSED=$((PROJECT_LIC_PASSED + 1))
else
  echo -e "  ${RED}❌${NC} No LICENSE file found"
  PROJECT_LIC_STATUS="fail"
fi

PROJECT_LIC_CHECKS=$((PROJECT_LIC_CHECKS + 1))
if [ -f "LICENSE" ] && grep -qi "apache" "LICENSE" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  Apache-2.0 license detected"
  PROJECT_LIC_PASSED=$((PROJECT_LIC_PASSED + 1))
elif [ -f "LICENSE" ]; then
  LIC_TYPE=$(head -5 LICENSE 2>/dev/null | tr '\n' ' ' | head -c 80)
  echo -e "  ${YELLOW}⚠️ ${NC} License type: ${DIM}${LIC_TYPE}...${NC}"
  PROJECT_LIC_PASSED=$((PROJECT_LIC_PASSED + 1))
else
  echo -e "  ${DIM}⊘  Cannot determine license type${NC}"
fi

echo ""

# ============================================================================
# Generate reports
# ============================================================================

OVERALL_FAIL=0
[ "$NPM_STATUS" = "fail" ] && OVERALL_FAIL=1
[ "$GO_STATUS" = "fail" ] && OVERALL_FAIL=1
[ "$PROJECT_LIC_STATUS" = "fail" ] && OVERALL_FAIL=1
[ -n "$STRICT_MODE" ] && [ "$NPM_TOTAL" -eq 0 ] && [ "$GO_TOTAL" -eq 0 ] && OVERALL_FAIL=1

cat > "$REPORT_JSON" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "npm": {
    "status": "${NPM_STATUS}",
    "total": ${NPM_TOTAL},
    "flagged": ${NPM_FLAGGED}
  },
  "go": {
    "status": "${GO_STATUS}",
    "total": ${GO_TOTAL},
    "flagged": ${GO_FLAGGED}
  },
  "projectLicense": "${PROJECT_LIC_STATUS}",
  "blockedPatterns": "${BLOCKED_LICENSES}"
}
EOF

cat > "$REPORT_MD" << EOF
# License Compliance Audit

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)

## npm Dependencies

| Metric    | Count |
|-----------|-------|
| Total     | ${NPM_TOTAL} |
| Flagged   | ${NPM_FLAGGED} |
| Status    | ${NPM_STATUS} |

## Go Dependencies

| Metric    | Count |
|-----------|-------|
| Total     | ${GO_TOTAL} |
| Flagged   | ${GO_FLAGGED} |
| Status    | ${GO_STATUS} |

## Blocked License Patterns

\`${BLOCKED_LICENSES}\`
EOF

# ============================================================================
# Summary
# ============================================================================

if [ "$OVERALL_FAIL" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}License compliance audit passed${NC}"
else
  echo -e "${RED}${BOLD}License compliance audit found issues${NC}"
fi

echo ""
echo "Reports:"
echo "  JSON:     $REPORT_JSON"
echo "  Summary:  $REPORT_MD"

exit "$OVERALL_FAIL"
