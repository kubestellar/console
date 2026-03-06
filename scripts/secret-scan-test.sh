#!/bin/bash
# Secret scanning — detects leaked secrets, API keys, tokens, and credentials
# in source code using gitleaks.
#
# Usage:
#   ./scripts/secret-scan-test.sh              # Scan working tree
#   ./scripts/secret-scan-test.sh --git        # Scan full git history
#
# Prerequisites:
#   - gitleaks will be auto-installed if missing (brew install gitleaks)
#
# Output:
#   /tmp/secret-scan-report.json               — full JSON findings
#   /tmp/secret-scan-summary.md                — human-readable summary
#
# Exit code:
#   0 — no secrets found
#   1 — secrets detected

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

SCAN_GIT_HISTORY=""
for arg in "$@"; do
  case "$arg" in
    --git) SCAN_GIT_HISTORY="1" ;;
  esac
done

REPORT_JSON="/tmp/secret-scan-report.json"
REPORT_MD="/tmp/secret-scan-summary.md"

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Secret Scanning (gitleaks)${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

# ============================================================================
# Prerequisites
# ============================================================================

if ! command -v gitleaks &>/dev/null; then
  echo -e "${YELLOW}Installing gitleaks...${NC}"
  if command -v brew &>/dev/null; then
    brew install gitleaks 2>/dev/null
  elif command -v go &>/dev/null; then
    go install github.com/gitleaks/gitleaks/v8@latest 2>/dev/null
  else
    echo -e "${RED}ERROR: Cannot install gitleaks — install manually: brew install gitleaks${NC}"
    exit 1
  fi
fi

# ============================================================================
# Create custom config to reduce false positives
# ============================================================================

GITLEAKS_CONFIG=$(mktemp)
trap 'rm -f "$GITLEAKS_CONFIG"' EXIT

cat > "$GITLEAKS_CONFIG" << 'TOML'
title = "KubeStellar Console gitleaks config"

# Extend the default ruleset
[extend]
useDefault = true

# Allowlist paths that are expected to contain example/test secrets
[allowlist]
  paths = [
    '''\.env\.example$''',
    '''\.env\.template$''',
    '''web/e2e/''',
    '''pkg/test/''',
    '''vendor/''',
    '''node_modules/''',
    '''test-results/''',
    '''web/dist/''',
    '''\.github/''',
    '''_test\.go$''',
    '''_fuzz_test\.go$''',
    '''__tests__/''',
    '''\.test\.(ts|tsx)$''',
    '''\.spec\.(ts|tsx)$''',
  ]
  description = "Ignore test fixtures, examples, vendor, and CI docs"

# PCI vendor IDs (15b3=Mellanox, 10de=NVIDIA) flagged as generic-api-key
[[rules]]
  id = "generic-api-key"
  description = "Generic API Key"
  [rules.allowlist]
    regexTarget = "match"
    regexes = [
      '''pci-[0-9a-f]{4}''',
    ]
TOML

# ============================================================================
# Run gitleaks
# ============================================================================

GITLEAKS_EXIT=0

if [ -n "$SCAN_GIT_HISTORY" ]; then
  echo -e "${DIM}Scanning full git history (this may take a while)...${NC}"
  gitleaks detect \
    --config="$GITLEAKS_CONFIG" \
    --report-format=json \
    --report-path="$REPORT_JSON" \
    --verbose 2>/dev/null || GITLEAKS_EXIT=$?
else
  echo -e "${DIM}Scanning working tree...${NC}"
  gitleaks detect \
    --config="$GITLEAKS_CONFIG" \
    --report-format=json \
    --report-path="$REPORT_JSON" \
    --no-git \
    --verbose 2>/dev/null || GITLEAKS_EXIT=$?
fi

echo ""

# ============================================================================
# Parse results
# ============================================================================

FINDING_COUNT=0

if [ -f "$REPORT_JSON" ]; then
  FINDING_COUNT=$(python3 -c "
import json
try:
    with open('$REPORT_JSON') as f:
        data = json.load(f)
    print(len(data) if isinstance(data, list) else 0)
except Exception:
    print(0)
" 2>/dev/null || echo "0")
fi

# ============================================================================
# Print results
# ============================================================================

if [ "$FINDING_COUNT" -eq 0 ]; then
  echo -e "  ${GREEN}✓ No secrets detected${NC}"
else
  echo -e "  ${RED}❌ ${FINDING_COUNT} potential secret(s) found${NC}"
  echo ""

  # Show details of each finding
  python3 -c "
import json
with open('$REPORT_JSON') as f:
    data = json.load(f)
if not isinstance(data, list):
    data = []
for i, finding in enumerate(data[:15]):
    rule = finding.get('RuleID', 'unknown')
    fpath = finding.get('File', '?')
    line = finding.get('StartLine', '?')
    desc = finding.get('Description', rule)
    print(f'  ❌ {fpath}:{line}  {desc} ({rule})')
if len(data) > 15:
    print(f'  ... and {len(data) - 15} more (see full report)')
" 2>/dev/null || true
fi

echo ""

# ============================================================================
# Generate Markdown summary
# ============================================================================

cat > "$REPORT_MD" << EOF
# Secret Scanning Report (gitleaks)

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Mode:** $([ -n "$SCAN_GIT_HISTORY" ] && echo "Git history" || echo "Working tree")

## Summary

| Metric | Count |
|--------|-------|
| Secrets found | ${FINDING_COUNT} |

**Status:** $([ "$FINDING_COUNT" -eq 0 ] && echo "PASS" || echo "FAIL")
EOF

if [ -f "$REPORT_JSON" ] && [ "$FINDING_COUNT" -gt 0 ]; then
  python3 -c "
import json
with open('$REPORT_JSON') as f:
    data = json.load(f)
if not isinstance(data, list):
    data = []
print()
print('### Findings')
print()
for finding in data:
    rule = finding.get('RuleID', 'unknown')
    fpath = finding.get('File', '?')
    line = finding.get('StartLine', '?')
    desc = finding.get('Description', rule)
    print(f'- \`{fpath}:{line}\` — {desc} ({rule})')
" >> "$REPORT_MD" 2>/dev/null || true
fi

# ============================================================================
# Report locations & exit
# ============================================================================

echo "Reports:"
echo "  JSON:     $REPORT_JSON"
echo "  Summary:  $REPORT_MD"

if [ "$FINDING_COUNT" -gt 0 ]; then
  exit 1
fi
exit 0
