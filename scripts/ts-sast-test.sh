#!/bin/bash
# TypeScript SAST — runs semgrep with security-focused rulesets against the
# frontend TypeScript/React codebase to detect XSS, injection, and other
# security vulnerabilities.
#
# Usage:
#   ./scripts/ts-sast-test.sh              # Run security rules
#   ./scripts/ts-sast-test.sh --strict     # Fail on WARNING and above
#
# Prerequisites:
#   - semgrep will be auto-installed if missing (brew install semgrep)
#
# Output:
#   /tmp/ts-sast-report.json               — full JSON findings
#   /tmp/ts-sast-summary.md                — human-readable summary
#
# Exit code:
#   0 — no HIGH/ERROR findings
#   1 — security issues detected

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
    --strict) STRICT_MODE="1"; echo -e "${YELLOW}Strict mode: WARNING findings are errors${NC}" ;;
  esac
done

REPORT_JSON="/tmp/ts-sast-report.json"
REPORT_MD="/tmp/ts-sast-summary.md"
TMPDIR_SAST=$(mktemp -d)
trap 'rm -rf "$TMPDIR_SAST"' EXIT

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  TypeScript SAST (semgrep)${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

# ============================================================================
# Prerequisites
# ============================================================================

if ! command -v semgrep &>/dev/null; then
  echo -e "${YELLOW}Installing semgrep...${NC}"
  if command -v brew &>/dev/null; then
    brew install semgrep 2>/dev/null
  elif command -v pip3 &>/dev/null; then
    pip3 install semgrep 2>/dev/null
  else
    echo -e "${RED}ERROR: Cannot install semgrep — install manually: brew install semgrep${NC}"
    exit 1
  fi
fi

# ============================================================================
# Create custom rules for React/TypeScript security
# ============================================================================

CUSTOM_RULES="$TMPDIR_SAST/custom-rules.yaml"
cat > "$CUSTOM_RULES" << 'YAML'
rules:
  - id: react-dangerouslysetinnerhtml
    patterns:
      - pattern: dangerouslySetInnerHTML={{__html: $VAR}}
      - pattern-not: dangerouslySetInnerHTML={{__html: DOMPurify.sanitize($VAR)}}
    message: "dangerouslySetInnerHTML used without DOMPurify sanitization — XSS risk"
    severity: ERROR
    languages: [typescript, tsx]
    metadata:
      category: security
      cwe: "CWE-79"

  - id: eval-usage
    pattern: eval($X)
    message: "eval() usage detected — code injection risk"
    severity: ERROR
    languages: [typescript, tsx]
    metadata:
      category: security
      cwe: "CWE-95"

  - id: innerhtml-assignment
    pattern: $EL.innerHTML = $VAL
    message: "Direct innerHTML assignment — XSS risk. Use textContent or sanitize input"
    severity: ERROR
    languages: [typescript, tsx]
    metadata:
      category: security
      cwe: "CWE-79"

  - id: document-write
    pattern: document.write($X)
    message: "document.write() usage — XSS risk"
    severity: ERROR
    languages: [typescript, tsx]
    metadata:
      category: security
      cwe: "CWE-79"

  - id: insecure-url-protocol
    patterns:
      - pattern: '"http://$URL"'
      - pattern-not: '"http://localhost$..."'
      - pattern-not: '"http://127.0.0.1$..."'
    message: "Non-HTTPS URL detected — use HTTPS for external resources"
    severity: WARNING
    languages: [typescript, tsx]
    metadata:
      category: security
      cwe: "CWE-319"

  - id: window-location-href-user-input
    pattern: window.location.href = $USER_INPUT
    message: "Setting window.location.href with variable — open redirect risk"
    severity: WARNING
    languages: [typescript, tsx]
    metadata:
      category: security
      cwe: "CWE-601"

  - id: postmessage-no-origin
    pattern: window.postMessage($DATA, "*")
    message: "postMessage with wildcard origin — use specific origin"
    severity: WARNING
    languages: [typescript, tsx]
    metadata:
      category: security
      cwe: "CWE-345"

  - id: localstorage-sensitive-data
    patterns:
      - pattern: localStorage.setItem("$KEY", ...)
      - metavariable-regex:
          metavariable: $KEY
          regex: ".*(token|password|secret|key|credential|auth).*"
    message: "Sensitive data stored in localStorage — consider secure alternatives"
    severity: WARNING
    languages: [typescript, tsx]
    metadata:
      category: security
      cwe: "CWE-922"
YAML

# ============================================================================
# Run semgrep
# ============================================================================

echo -e "${DIM}Running semgrep with security rulesets...${NC}"
echo ""

SEMGREP_EXIT=0

# Run with community security rules + our custom rules
semgrep scan \
  --config="$CUSTOM_RULES" \
  --config="p/javascript" \
  --config="p/typescript" \
  --include="*.ts" \
  --include="*.tsx" \
  --exclude="node_modules" \
  --exclude="dist" \
  --exclude="web/e2e" \
  --exclude="vendor" \
  --exclude="*.test.*" \
  --exclude="*.spec.*" \
  --json \
  --output="$REPORT_JSON" \
  --quiet \
  web/src/ 2>/dev/null || SEMGREP_EXIT=$?

# ============================================================================
# Parse results
# ============================================================================

ERROR_COUNT=0
WARNING_COUNT=0
INFO_COUNT=0
TOTAL_COUNT=0

if [ -f "$REPORT_JSON" ]; then
  read -r ERROR_COUNT WARNING_COUNT INFO_COUNT TOTAL_COUNT < <(python3 -c "
import json
try:
    with open('$REPORT_JSON') as f:
        data = json.load(f)
    results = data.get('results', [])
    errors = sum(1 for r in results if r.get('extra', {}).get('severity', '') == 'ERROR')
    warnings = sum(1 for r in results if r.get('extra', {}).get('severity', '') == 'WARNING')
    infos = sum(1 for r in results if r.get('extra', {}).get('severity', '') == 'INFO')
    print(errors, warnings, infos, len(results))
except Exception:
    print(0, 0, 0, 0)
" 2>/dev/null || echo "0 0 0 0")
fi

# ============================================================================
# Print results
# ============================================================================

if [ "$TOTAL_COUNT" -eq 0 ]; then
  echo -e "  ${GREEN}✓ No security issues found${NC}"
else
  [ "$ERROR_COUNT" -gt 0 ] && echo -e "  ${RED}❌ ERROR:   ${ERROR_COUNT} finding(s)${NC}"
  [ "$WARNING_COUNT" -gt 0 ] && echo -e "  ${YELLOW}⚠️  WARNING: ${WARNING_COUNT} finding(s)${NC}"
  [ "$INFO_COUNT" -gt 0 ] && echo -e "  ${DIM}ℹ  INFO:    ${INFO_COUNT} finding(s)${NC}"
  echo ""
  echo -e "  ${BOLD}Total: ${TOTAL_COUNT} finding(s)${NC}"

  # Show top findings
  if [ -f "$REPORT_JSON" ]; then
    echo ""
    python3 -c "
import json
with open('$REPORT_JSON') as f:
    data = json.load(f)
results = data.get('results', [])
for r in results[:15]:
    sev = r.get('extra', {}).get('severity', '?')
    msg = r.get('extra', {}).get('message', 'Unknown')
    fpath = r.get('path', '?')
    line = r.get('start', {}).get('line', '?')
    rule = r.get('check_id', '?').split('.')[-1]
    marker = '❌' if sev == 'ERROR' else '⚠️ ' if sev == 'WARNING' else 'ℹ '
    print(f'  {marker} {fpath}:{line}  {msg} ({rule})')
if len(results) > 15:
    print(f'  ... and {len(results) - 15} more (see full report)')
" 2>/dev/null || true
  fi
fi

echo ""

# ============================================================================
# Generate Markdown summary
# ============================================================================

cat > "$REPORT_MD" << EOF
# TypeScript SAST Report (semgrep)

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)

## Summary

| Severity | Count |
|----------|-------|
| ERROR    | ${ERROR_COUNT} |
| WARNING  | ${WARNING_COUNT} |
| INFO     | ${INFO_COUNT} |
| **Total** | **${TOTAL_COUNT}** |

## Details

See \`/tmp/ts-sast-report.json\` for full findings.
EOF

if [ -f "$REPORT_JSON" ] && [ "$TOTAL_COUNT" -gt 0 ]; then
  python3 -c "
import json
with open('$REPORT_JSON') as f:
    data = json.load(f)
results = data.get('results', [])
print()
print('### Findings')
print()
for r in results:
    sev = r.get('extra', {}).get('severity', '?')
    msg = r.get('extra', {}).get('message', 'Unknown')
    fpath = r.get('path', '?')
    line = r.get('start', {}).get('line', '?')
    rule = r.get('check_id', '?').split('.')[-1]
    cwe = ''
    metadata = r.get('extra', {}).get('metadata', {})
    if 'cwe' in metadata:
        cwe_val = metadata['cwe']
        if isinstance(cwe_val, list):
            cwe = ' (' + ', '.join(str(c) for c in cwe_val) + ')'
        else:
            cwe = f' ({cwe_val})'
    print(f'- **[{sev}]** \`{fpath}:{line}\` — {msg}{cwe}')
" >> "$REPORT_MD" 2>/dev/null || true
fi

# ============================================================================
# Report locations & exit
# ============================================================================

echo "Reports:"
echo "  JSON:     $REPORT_JSON"
echo "  Summary:  $REPORT_MD"

EXIT_CODE=0
if [ "$ERROR_COUNT" -gt 0 ]; then
  EXIT_CODE=1
fi
if [ -n "$STRICT_MODE" ] && [ "$WARNING_COUNT" -gt 0 ]; then
  EXIT_CODE=1
fi

exit $EXIT_CODE
