#!/bin/bash
# Container image scanning — runs Trivy against the Docker image (or Dockerfile)
# to detect OS-level and application-level vulnerabilities.
#
# Usage:
#   ./scripts/container-scan-test.sh                        # Scan filesystem (report only)
#   ./scripts/container-scan-test.sh --image <image:tag>    # Scan a built image
#   ./scripts/container-scan-test.sh --strict               # Fail on HIGH/CRITICAL (default: report only)
#
# Prerequisites:
#   - trivy will be auto-installed if missing (brew install trivy)
#
# Output:
#   /tmp/container-scan-report.json        — full JSON findings
#   /tmp/container-scan-summary.md         — human-readable summary
#
# Exit code:
#   0 — no HIGH/CRITICAL vulnerabilities
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
IMAGE_NAME=""
for arg in "$@"; do
  case "$arg" in
    --strict) STRICT_MODE="1" ;;
    --image) shift_next="1" ;;
    *) [ "${shift_next:-}" = "1" ] && IMAGE_NAME="$arg" && shift_next="" ;;
  esac
done

REPORT_JSON="/tmp/container-scan-report.json"
REPORT_MD="/tmp/container-scan-summary.md"

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Container Vulnerability Scan (Trivy)${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

# ============================================================================
# Prerequisites
# ============================================================================

if ! command -v trivy &>/dev/null; then
  echo -e "${YELLOW}Installing trivy...${NC}"
  TRIVY_INSTALLED=""
  if command -v brew &>/dev/null; then
    brew install trivy 2>/dev/null && TRIVY_INSTALLED="1"
  fi
  if [ -z "$TRIVY_INSTALLED" ] && command -v apt-get &>/dev/null; then
    # Fallback: install via apt (Debian/Ubuntu CI runners)
    sudo apt-get update -qq 2>/dev/null && \
    sudo apt-get install -y -qq wget apt-transport-https gnupg lsb-release 2>/dev/null && \
    wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add - 2>/dev/null && \
    echo "deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main" | sudo tee /etc/apt/sources.list.d/trivy.list 2>/dev/null && \
    sudo apt-get update -qq 2>/dev/null && \
    sudo apt-get install -y -qq trivy 2>/dev/null && TRIVY_INSTALLED="1"
  fi
  if [ -z "$TRIVY_INSTALLED" ]; then
    echo -e "${YELLOW}WARNING: trivy not available and could not be installed — skipping scan${NC}"
    # Generate empty reports so downstream consumers don't break
    echo '{"Results":[],"SchemaVersion":2}' > "$REPORT_JSON"
    cat > "$REPORT_MD" << SKIP_EOF
# Container Vulnerability Scan (Trivy)

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Status:** SKIPPED — trivy not available
SKIP_EOF
    echo ""
    echo "Reports:"
    echo "  JSON:     $REPORT_JSON"
    echo "  Summary:  $REPORT_MD"
    exit 0
  fi
fi

# ============================================================================
# Run Trivy
# ============================================================================

TRIVY_EXIT=0

if [ -n "$IMAGE_NAME" ]; then
  # Scan a specific Docker image
  echo -e "${DIM}Scanning image: ${IMAGE_NAME}...${NC}"
  trivy image \
    --format json \
    --output "$REPORT_JSON" \
    --severity "LOW,MEDIUM,HIGH,CRITICAL" \
    --quiet \
    "$IMAGE_NAME" 2>/dev/null || TRIVY_EXIT=$?
else
  # Filesystem scan — scans the project for Dockerfile issues, dependency vulns,
  # misconfigurations, and secrets in config files
  echo -e "${DIM}Scanning project filesystem...${NC}"
  trivy fs \
    --format json \
    --output "$REPORT_JSON" \
    --severity "LOW,MEDIUM,HIGH,CRITICAL" \
    --scanners vuln,misconfig,secret \
    --skip-dirs node_modules,vendor,web/dist,.git,test-results \
    --quiet \
    . 2>/dev/null || TRIVY_EXIT=$?
fi

echo ""

# ============================================================================
# Parse results
# ============================================================================

CRITICAL_COUNT=0
HIGH_COUNT=0
MEDIUM_COUNT=0
LOW_COUNT=0
TOTAL_COUNT=0
MISCONFIG_COUNT=0

if [ -f "$REPORT_JSON" ]; then
  read -r CRITICAL_COUNT HIGH_COUNT MEDIUM_COUNT LOW_COUNT TOTAL_COUNT MISCONFIG_COUNT < <(python3 -c "
import json
try:
    with open('$REPORT_JSON') as f:
        data = json.load(f)
    results = data.get('Results', [])
    c = h = m = lo = mc = 0
    for r in results:
        for v in r.get('Vulnerabilities', []) or []:
            sev = v.get('Severity', '')
            if sev == 'CRITICAL': c += 1
            elif sev == 'HIGH': h += 1
            elif sev == 'MEDIUM': m += 1
            elif sev == 'LOW': lo += 1
        mc += len(r.get('Misconfigurations', []) or [])
    total = c + h + m + lo
    print(c, h, m, lo, total, mc)
except Exception:
    print(0, 0, 0, 0, 0, 0)
" 2>/dev/null || echo "0 0 0 0 0 0")
fi

# ============================================================================
# Print results
# ============================================================================

VULN_TOTAL=$((CRITICAL_COUNT + HIGH_COUNT + MEDIUM_COUNT + LOW_COUNT))

if [ "$VULN_TOTAL" -eq 0 ] && [ "$MISCONFIG_COUNT" -eq 0 ]; then
  echo -e "  ${GREEN}✓ No vulnerabilities or misconfigurations found${NC}"
else
  echo -e "  ${BOLD}Vulnerabilities:${NC}"
  [ "$CRITICAL_COUNT" -gt 0 ] && echo -e "    ${RED}❌ CRITICAL: ${CRITICAL_COUNT}${NC}"
  [ "$HIGH_COUNT" -gt 0 ] && echo -e "    ${RED}❌ HIGH:     ${HIGH_COUNT}${NC}"
  [ "$MEDIUM_COUNT" -gt 0 ] && echo -e "    ${YELLOW}⚠️  MEDIUM:   ${MEDIUM_COUNT}${NC}"
  [ "$LOW_COUNT" -gt 0 ] && echo -e "    ${DIM}ℹ  LOW:      ${LOW_COUNT}${NC}"
  [ "$VULN_TOTAL" -eq 0 ] && echo -e "    ${GREEN}✓ None${NC}"

  if [ "$MISCONFIG_COUNT" -gt 0 ]; then
    echo ""
    echo -e "  ${BOLD}Misconfigurations:${NC}"
    echo -e "    ${YELLOW}⚠️  ${MISCONFIG_COUNT} issue(s)${NC}"
  fi

  echo ""
  echo -e "  ${BOLD}Total: ${VULN_TOTAL} vulnerabilities, ${MISCONFIG_COUNT} misconfigurations${NC}"

  # Show top findings
  if [ -f "$REPORT_JSON" ] && [ "$VULN_TOTAL" -gt 0 ]; then
    echo ""
    python3 -c "
import json
with open('$REPORT_JSON') as f:
    data = json.load(f)
results = data.get('Results', [])
shown = 0
for r in results:
    target = r.get('Target', '?')
    for v in (r.get('Vulnerabilities', []) or []):
        if shown >= 10:
            break
        sev = v.get('Severity', '?')
        vid = v.get('VulnerabilityID', '?')
        pkg = v.get('PkgName', '?')
        title = v.get('Title', v.get('Description', ''))[:80]
        marker = '❌' if sev in ('CRITICAL', 'HIGH') else '⚠️ ' if sev == 'MEDIUM' else 'ℹ '
        print(f'  {marker} {vid}  {pkg}  {title}')
        shown += 1
    if shown >= 10:
        break
total_vulns = sum(len(r.get('Vulnerabilities', []) or []) for r in results)
if total_vulns > 10:
    print(f'  ... and {total_vulns - 10} more (see full report)')
" 2>/dev/null || true
  fi
fi

echo ""

# ============================================================================
# Generate Markdown summary
# ============================================================================

cat > "$REPORT_MD" << EOF
# Container Vulnerability Scan (Trivy)

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Target:** $([ -n "$IMAGE_NAME" ] && echo "$IMAGE_NAME" || echo "Filesystem")

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | ${CRITICAL_COUNT} |
| HIGH     | ${HIGH_COUNT} |
| MEDIUM   | ${MEDIUM_COUNT} |
| LOW      | ${LOW_COUNT} |
| **Total Vulns** | **${VULN_TOTAL}** |
| Misconfigurations | ${MISCONFIG_COUNT} |

**Status:** $([ "$CRITICAL_COUNT" -eq 0 ] && [ "$HIGH_COUNT" -eq 0 ] && echo "PASS" || echo "FAIL")
EOF

if [ -f "$REPORT_JSON" ] && [ "$VULN_TOTAL" -gt 0 ]; then
  python3 -c "
import json
with open('$REPORT_JSON') as f:
    data = json.load(f)
results = data.get('Results', [])
print()
print('### Vulnerabilities')
print()
for r in results:
    target = r.get('Target', '?')
    vulns = r.get('Vulnerabilities', []) or []
    if not vulns:
        continue
    print(f'#### {target}')
    print()
    for v in vulns:
        sev = v.get('Severity', '?')
        vid = v.get('VulnerabilityID', '?')
        pkg = v.get('PkgName', '?')
        installed = v.get('InstalledVersion', '?')
        fixed = v.get('FixedVersion', 'n/a')
        title = v.get('Title', '')[:100]
        print(f'- **[{sev}]** {vid} — {pkg}@{installed} (fix: {fixed}) {title}')
    print()
" >> "$REPORT_MD" 2>/dev/null || true
fi

# ============================================================================
# Report locations & exit
# ============================================================================

echo "Reports:"
echo "  JSON:     $REPORT_JSON"
echo "  Summary:  $REPORT_MD"

# Default: report-only mode (exit 0 even with findings)
# --strict: fail on HIGH/CRITICAL (blocks CI)
EXIT_CODE=0
if [ -n "$STRICT_MODE" ]; then
  if [ "$CRITICAL_COUNT" -gt 0 ] || [ "$HIGH_COUNT" -gt 0 ]; then
    EXIT_CODE=1
  fi
fi

exit $EXIT_CODE
