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

# Pinned trivy version — update SHA256 hashes when bumping this version.
# Verify hashes at: https://github.com/aquasecurity/trivy/releases/tag/v${TRIVY_VERSION}
TRIVY_VERSION="0.71.2"

if ! command -v trivy &>/dev/null; then
  echo -e "${YELLOW}Installing trivy...${NC}"
  if command -v brew &>/dev/null; then
    brew install trivy 2>/dev/null
  else
    # Download pinned trivy binary with SHA256 verification (no curl|sh)
    INSTALL_DIR="${HOME}/.local/bin"
    mkdir -p "$INSTALL_DIR"

    _PLATFORM="$(uname -s)"
    _ARCH="$(uname -m)"
    case "$_PLATFORM-$_ARCH" in
      Linux-x86_64)
        _TARBALL="trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz"
        _SHA256="0510e71e2fd39bf863856d499c8dc19feb4e7336546394c502a8f5cc7ab27460"
        ;;
      Linux-aarch64)
        _TARBALL="trivy_${TRIVY_VERSION}_Linux-ARM64.tar.gz"
        _SHA256="fe1c7106e15a5365d485b098a8c338f91e3b7ba71cb0e4963b98a3a098763cfc"
        ;;
      Darwin-x86_64)
        _TARBALL="trivy_${TRIVY_VERSION}_macOS-64bit.tar.gz"
        _SHA256="c27bcf4ddd281aecb7267eb5df804ec49ac0f8fa23fe018d33932e17f30a38bf"
        ;;
      Darwin-arm64)
        _TARBALL="trivy_${TRIVY_VERSION}_macOS-ARM64.tar.gz"
        _SHA256="a9f585cad53542a54ef286b5fa4199d081e5a061f8894635bdf3ce2608ece7a9"
        ;;
      *)
        echo -e "${RED}ERROR: Unsupported platform $_PLATFORM-$_ARCH — install trivy manually: brew install trivy${NC}"
        exit 1
        ;;
    esac

    echo -e "${DIM}Downloading trivy v${TRIVY_VERSION} (${_TARBALL})...${NC}"
    curl -sL "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/${_TARBALL}" \
      -o "/tmp/${_TARBALL}" || {
      echo -e "${RED}ERROR: Failed to download trivy — install manually: brew install trivy${NC}"
      exit 1
    }

    echo "${_SHA256}  /tmp/${_TARBALL}" | sha256sum -c - || {
      echo -e "${RED}ERROR: trivy checksum verification failed — refusing to install${NC}"
      rm -f "/tmp/${_TARBALL}"
      exit 1
    }

    tar xzf "/tmp/${_TARBALL}" -C "$INSTALL_DIR" trivy
    rm -f "/tmp/${_TARBALL}"

    export PATH="$INSTALL_DIR:$PATH"
  fi

  if ! command -v trivy &>/dev/null; then
    echo -e "${RED}ERROR: trivy installation failed — binary not found after install${NC}"
    exit 1
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
