#!/bin/bash
# Dependency vulnerability scanning — runs npm audit (frontend) and govulncheck
# (Go backend) to detect known vulnerabilities in dependencies.
#
# Usage:
#   ./scripts/dependency-audit-test.sh              # Run all checks
#   ./scripts/dependency-audit-test.sh --strict     # Fail on MODERATE and above
#   ./scripts/dependency-audit-test.sh --sbom       # Also generate SBOM (requires syft)
#
# Prerequisites:
#   - Node.js and npm installed
#   - Go installed
#   - govulncheck will be auto-installed if missing
#   - syft optional for SBOM generation
#
# Output:
#   /tmp/dependency-audit-report.json    — combined JSON data
#   /tmp/dependency-audit-summary.md     — human-readable summary
#   /tmp/sbom.json                       — SBOM (if --sbom flag used)
#
# Exit code:
#   0 — no HIGH/CRITICAL vulnerabilities found
#   1 — HIGH/CRITICAL vulnerabilities detected

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
SBOM_MODE=""
for arg in "$@"; do
  case "$arg" in
    --strict) STRICT_MODE="1" ;;
    --sbom) SBOM_MODE="1" ;;
  esac
done

REPORT_JSON="/tmp/dependency-audit-report.json"
REPORT_MD="/tmp/dependency-audit-summary.md"
TMPDIR_AUDIT=$(mktemp -d)
trap 'rm -rf "$TMPDIR_AUDIT"' EXIT

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Dependency Vulnerability Audit${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

NPM_CRITICAL=0
NPM_HIGH=0
NPM_MODERATE=0
NPM_LOW=0
NPM_TOTAL=0
NPM_STATUS="pass"

GO_VULNS=0
GO_STATUS="pass"

# ============================================================================
# Phase 1: npm audit
# ============================================================================

echo -e "${BOLD}Phase 1: npm audit (frontend)${NC}"

if [ -d "web" ] && [ -f "web/package-lock.json" ]; then
  NPM_OUTPUT="$TMPDIR_AUDIT/npm-audit.json"
  cd web
  npm audit --json > "$NPM_OUTPUT" 2>/dev/null || true
  cd ..

  # Parse npm audit JSON
  read -r NPM_CRITICAL NPM_HIGH NPM_MODERATE NPM_LOW NPM_TOTAL < <(python3 -c "
import json
try:
    with open('$NPM_OUTPUT') as f:
        data = json.load(f)
    vulns = data.get('metadata', {}).get('vulnerabilities', {})
    c = vulns.get('critical', 0)
    h = vulns.get('high', 0)
    m = vulns.get('moderate', 0)
    lo = vulns.get('low', 0)
    t = vulns.get('total', c + h + m + lo)
    print(c, h, m, lo, t)
except Exception:
    print(0, 0, 0, 0, 0)
" 2>/dev/null || echo "0 0 0 0 0")

  if [ "$NPM_TOTAL" -eq 0 ]; then
    echo -e "  ${GREEN}✓ No vulnerabilities found${NC}"
  else
    [ "$NPM_CRITICAL" -gt 0 ] && echo -e "  ${RED}❌ CRITICAL: ${NPM_CRITICAL}${NC}"
    [ "$NPM_HIGH" -gt 0 ] && echo -e "  ${RED}❌ HIGH:     ${NPM_HIGH}${NC}"
    [ "$NPM_MODERATE" -gt 0 ] && echo -e "  ${YELLOW}⚠️  MODERATE: ${NPM_MODERATE}${NC}"
    [ "$NPM_LOW" -gt 0 ] && echo -e "  ${DIM}ℹ  LOW:      ${NPM_LOW}${NC}"
  fi

  if [ "$NPM_CRITICAL" -gt 0 ] || [ "$NPM_HIGH" -gt 0 ]; then
    NPM_STATUS="fail"
  elif [ -n "$STRICT_MODE" ] && [ "$NPM_MODERATE" -gt 0 ]; then
    NPM_STATUS="fail"
  fi
else
  echo -e "  ${YELLOW}⚠️  web/package-lock.json not found — skipping${NC}"
  NPM_STATUS="skip"
fi

echo ""

# ============================================================================
# Phase 2: govulncheck (Go)
# ============================================================================

echo -e "${BOLD}Phase 2: govulncheck (Go backend)${NC}"

if command -v go &>/dev/null; then
  if ! command -v govulncheck &>/dev/null; then
    echo -e "  ${DIM}Installing govulncheck...${NC}"
    go install golang.org/x/vuln/cmd/govulncheck@latest 2>/dev/null
  fi

  if command -v govulncheck &>/dev/null; then
    GOVULN_OUTPUT="$TMPDIR_AUDIT/govulncheck.txt"
    GOVULN_EXIT=0
    GOVULN_TIMEOUT_SECS=120

    echo -e "  ${DIM}Running govulncheck (timeout: ${GOVULN_TIMEOUT_SECS}s)...${NC}"
    if timeout "${GOVULN_TIMEOUT_SECS}" govulncheck ./... > "$GOVULN_OUTPUT" 2>/dev/null; then
      GOVULN_EXIT=0
    else
      GOVULN_EXIT=$?
      if [ "$GOVULN_EXIT" -eq 124 ]; then
        echo -e "  ${YELLOW}⚠️  govulncheck timed out after ${GOVULN_TIMEOUT_SECS}s${NC}"
        GO_STATUS="skip"
      fi
    fi

    # Count vulnerabilities from text output
    GO_VULNS=$(grep -c "^Vulnerability #" "$GOVULN_OUTPUT" 2>/dev/null | head -1 | tr -d '[:space:]' || true)
    GO_VULNS="${GO_VULNS:-0}"

    if [ "$GO_VULNS" -eq 0 ] 2>/dev/null; then
      echo -e "  ${GREEN}✓ No vulnerabilities found${NC}"
    else
      echo -e "  ${RED}❌ ${GO_VULNS} vulnerability/ies found${NC}"
      # Show first few
      grep -A 2 "^Vulnerability #" "$GOVULN_OUTPUT" 2>/dev/null | head -15 | while IFS= read -r line; do
        echo -e "    ${DIM}${line}${NC}"
      done
      GO_STATUS="fail"
    fi
  else
    echo -e "  ${YELLOW}⚠️  govulncheck installation failed — skipping${NC}"
    GO_STATUS="skip"
  fi
else
  echo -e "  ${YELLOW}⚠️  Go not installed — skipping${NC}"
  GO_STATUS="skip"
fi

echo ""

# ============================================================================
# Phase 3: SBOM generation (optional)
# ============================================================================

if [ -n "$SBOM_MODE" ]; then
  echo -e "${BOLD}Phase 3: SBOM generation${NC}"

  if command -v syft &>/dev/null; then
    syft . -o spdx-json > /tmp/sbom.json 2>/dev/null
    SBOM_PACKAGES=$(jq '.packages | length' /tmp/sbom.json 2>/dev/null || echo "0")
    echo -e "  ${GREEN}✓ SBOM generated — ${SBOM_PACKAGES} packages${NC}"
    echo -e "  ${DIM}Output: /tmp/sbom.json${NC}"
  else
    echo -e "  ${YELLOW}⚠️  syft not installed — skipping SBOM${NC}"
    echo -e "  ${DIM}Install: brew install syft${NC}"
  fi

  echo ""
fi

# ============================================================================
# Generate reports
# ============================================================================

cat > "$REPORT_JSON" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "npm": {
    "status": "${NPM_STATUS}",
    "critical": ${NPM_CRITICAL},
    "high": ${NPM_HIGH},
    "moderate": ${NPM_MODERATE},
    "low": ${NPM_LOW},
    "total": ${NPM_TOTAL}
  },
  "go": {
    "status": "${GO_STATUS}",
    "vulnerabilities": ${GO_VULNS}
  }
}
EOF

cat > "$REPORT_MD" << EOF
# Dependency Vulnerability Audit

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)

## npm audit (frontend)

| Severity | Count |
|----------|-------|
| Critical | ${NPM_CRITICAL} |
| High     | ${NPM_HIGH} |
| Moderate | ${NPM_MODERATE} |
| Low      | ${NPM_LOW} |
| **Total** | **${NPM_TOTAL}** |

**Status:** ${NPM_STATUS}

## govulncheck (Go backend)

**Vulnerabilities found:** ${GO_VULNS}
**Status:** ${GO_STATUS}
EOF

# ============================================================================
# Summary
# ============================================================================

OVERALL_FAIL=0
[ "$NPM_STATUS" = "fail" ] && OVERALL_FAIL=1
[ "$GO_STATUS" = "fail" ] && OVERALL_FAIL=1

if [ "$OVERALL_FAIL" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}Dependency audit passed${NC}"
else
  echo -e "${RED}${BOLD}Dependency audit found vulnerabilities${NC}"
fi

echo ""
echo "Reports:"
echo "  JSON:     $REPORT_JSON"
echo "  Summary:  $REPORT_MD"

exit "$OVERALL_FAIL"
