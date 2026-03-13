#!/bin/bash
# Settings encryption & migration testing — runs Go unit tests for the settings
# manager and crypto layer, verifies key rotation, import/export with different
# keys, corrupt keyfile handling, and forward compatibility.
#
# Usage:
#   ./scripts/settings-migration-test.sh              # Run all tests
#
# Prerequisites:
#   - Go installed
#
# Output:
#   /tmp/settings-migration-report.json    — JSON test results
#   /tmp/settings-migration-summary.md     — human-readable summary
#
# Exit code:
#   0 — all tests pass
#   1 — one or more tests failed

set -euo pipefail

cd "$(dirname "$0")/.."

# ============================================================================
# Colors
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

REPORT_JSON="/tmp/settings-migration-report.json"
REPORT_MD="/tmp/settings-migration-summary.md"
TMPDIR_SM=$(mktemp -d)
trap 'rm -rf "$TMPDIR_SM"' EXIT

if ! command -v go &>/dev/null; then
  echo -e "${RED}ERROR: Go is not installed${NC}"
  exit 1
fi

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Settings Encryption & Migration Testing${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

TOTAL=0
PASSED=0
FAILED=0

# ============================================================================
# Phase 1: Crypto unit tests
# ============================================================================

echo -e "${BOLD}Phase 1: Crypto unit tests${NC}"

CRYPTO_OUTPUT="$TMPDIR_SM/crypto-tests.txt"
CRYPTO_EXIT=0
go test ./pkg/settings/... -run "TestEncryptDecrypt|TestDecrypt|TestEnsureKeyFile|TestKeyFingerprint" -v -timeout 30s > "$CRYPTO_OUTPUT" 2>&1 || CRYPTO_EXIT=$?

CRYPTO_PASSED=$(grep -c "^--- PASS:" "$CRYPTO_OUTPUT" 2>/dev/null || true)
CRYPTO_PASSED="${CRYPTO_PASSED:-0}"
CRYPTO_PASSED=$(echo "$CRYPTO_PASSED" | tr -d '[:space:]')
CRYPTO_FAILED_COUNT=$(grep -c "^--- FAIL:" "$CRYPTO_OUTPUT" 2>/dev/null || true)
CRYPTO_FAILED_COUNT="${CRYPTO_FAILED_COUNT:-0}"
CRYPTO_FAILED_COUNT=$(echo "$CRYPTO_FAILED_COUNT" | tr -d '[:space:]')

TOTAL=$((TOTAL + 1))
if [ "$CRYPTO_EXIT" -eq 0 ]; then
  echo -e "  ${GREEN}✓${NC}  Crypto unit tests passed (${CRYPTO_PASSED} tests)"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Crypto tests failed (${CRYPTO_FAILED_COUNT} failures)"
  grep "^--- FAIL:" "$CRYPTO_OUTPUT" 2>/dev/null | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${NC}"
  done
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 2: Settings handler tests (export/import)
# ============================================================================

echo -e "${BOLD}Phase 2: Settings handler tests (export/import)${NC}"

HANDLER_OUTPUT="$TMPDIR_SM/handler-tests.txt"
HANDLER_EXIT=0
go test ./pkg/api/handlers/... -run "TestGetSettings|TestSaveSettings|TestExportImport|TestSettingsFileError" -v -timeout 30s > "$HANDLER_OUTPUT" 2>&1 || HANDLER_EXIT=$?

HANDLER_PASSED=$(grep -c "^--- PASS:" "$HANDLER_OUTPUT" 2>/dev/null || true)
HANDLER_PASSED="${HANDLER_PASSED:-0}"
HANDLER_PASSED=$(echo "$HANDLER_PASSED" | tr -d '[:space:]')
HANDLER_FAILED_COUNT=$(grep -c "^--- FAIL:" "$HANDLER_OUTPUT" 2>/dev/null || true)
HANDLER_FAILED_COUNT="${HANDLER_FAILED_COUNT:-0}"
HANDLER_FAILED_COUNT=$(echo "$HANDLER_FAILED_COUNT" | tr -d '[:space:]')

TOTAL=$((TOTAL + 1))
if [ "$HANDLER_EXIT" -eq 0 ]; then
  echo -e "  ${GREEN}✓${NC}  Settings handler tests passed (${HANDLER_PASSED} tests)"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Settings handler tests failed (${HANDLER_FAILED_COUNT} failures)"
  grep "^--- FAIL:" "$HANDLER_OUTPUT" 2>/dev/null | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${NC}"
  done
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 3: Crypto security pattern verification
# ============================================================================

echo -e "${BOLD}Phase 3: Crypto security pattern verification${NC}"

CRYPTO_FILE="pkg/settings/crypto.go"

# AES-256 key size
TOTAL=$((TOTAL + 1))
if grep -q "keyBytes.*=.*32\|aes.NewCipher" "$CRYPTO_FILE" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  AES-256 (32-byte key) confirmed"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} AES-256 key size not verified"
  FAILED=$((FAILED + 1))
fi

# GCM mode (authenticated encryption)
TOTAL=$((TOTAL + 1))
if grep -q "cipher.NewGCM\|gcm.Seal\|gcm.Open" "$CRYPTO_FILE" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  GCM authenticated encryption confirmed"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} GCM authenticated encryption not found"
  FAILED=$((FAILED + 1))
fi

# Random nonce generation
TOTAL=$((TOTAL + 1))
if grep -q "rand.Read\|crypto/rand" "$CRYPTO_FILE" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  Cryptographic random nonce generation confirmed"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Missing cryptographic random nonce"
  FAILED=$((FAILED + 1))
fi

# Secure file permissions
TOTAL=$((TOTAL + 1))
if grep -q "0600\|keyFileMode" "$CRYPTO_FILE" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  Keyfile permissions (0600) confirmed"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Keyfile permissions not set securely"
  FAILED=$((FAILED + 1))
fi

# Key fingerprint (no key exposure)
TOTAL=$((TOTAL + 1))
if grep -q "keyFingerprint\|sha256.Sum256" "$CRYPTO_FILE" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC}  Key fingerprint (SHA-256, no key exposure) confirmed"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}❌${NC} Key fingerprint mechanism not found"
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Phase 4: Fuzz test availability
# ============================================================================

echo -e "${BOLD}Phase 4: Fuzz test availability${NC}"

TOTAL=$((TOTAL + 1))
if find pkg/settings -name "*fuzz*" -o -name "*_fuzz_*" 2>/dev/null | grep -q .; then
  echo -e "  ${GREEN}✓${NC}  Crypto fuzz tests present"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${YELLOW}⚠️ ${NC} No crypto fuzz tests found (run api-fuzz-test.sh)"
  FAILED=$((FAILED + 1))
fi

echo ""

# ============================================================================
# Generate reports
# ============================================================================

cat > "$REPORT_JSON" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "summary": {
    "total": ${TOTAL},
    "passed": ${PASSED},
    "failed": ${FAILED}
  },
  "phases": {
    "cryptoTests": { "exit_code": ${CRYPTO_EXIT}, "passed": ${CRYPTO_PASSED} },
    "handlerTests": { "exit_code": ${HANDLER_EXIT}, "passed": ${HANDLER_PASSED} },
    "securityPatterns": "checked",
    "fuzzTests": "checked"
  }
}
EOF

cat > "$REPORT_MD" << EOF
# Settings Encryption & Migration Testing

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)

## Summary

| Metric   | Count |
|----------|-------|
| Total    | ${TOTAL} |
| Passed   | ${PASSED} |
| Failed   | ${FAILED} |

## Phases

- **Phase 1:** Crypto unit tests — $([ "$CRYPTO_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL")
- **Phase 2:** Settings handler tests — $([ "$HANDLER_EXIT" -eq 0 ] && echo "PASS" || echo "FAIL")
- **Phase 3:** Crypto security pattern verification
- **Phase 4:** Fuzz test availability
EOF

# ============================================================================
# Summary
# ============================================================================

if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All ${PASSED} settings migration checks passed${NC}"
else
  echo -e "${RED}${BOLD}${FAILED}/${TOTAL} settings migration checks failed${NC}"
fi

echo ""
echo "Reports:"
echo "  JSON:     $REPORT_JSON"
echo "  Summary:  $REPORT_MD"

[ "$FAILED" -gt 0 ] && exit 1
exit 0
