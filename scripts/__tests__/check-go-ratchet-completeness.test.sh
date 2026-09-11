#!/bin/bash
# scripts/__tests__/check-go-ratchet-completeness.test.sh

set -euo pipefail

TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
FAILURES=""

pass() {
  TESTS_RUN=$((TESTS_RUN + 1))
  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo "  ✓ $1"
}

fail() {
  TESTS_RUN=$((TESTS_RUN + 1))
  TESTS_FAILED=$((TESTS_FAILED + 1))
  FAILURES="${FAILURES}\n  ✗ $1: $2"
  echo "  ✗ $1"
  echo "    → $2"
}

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SUT="${SCRIPT_DIR}/check-go-ratchet-completeness.sh"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Build a synthetic tree with three packages, two of which have non-test .go
# files (should be considered "package dirs") and one of which contains only a
# _test.go file (should NOT be flagged as a missing package dir).
mkdir -p "$WORK/pkg/covered" "$WORK/pkg/uncovered" "$WORK/pkg/testonly" "$WORK/pkg/vendor/thirdparty"
echo 'package covered'    > "$WORK/pkg/covered/covered.go"
echo 'package uncovered'  > "$WORK/pkg/uncovered/uncovered.go"
echo 'package testonly'   > "$WORK/pkg/testonly/testonly_test.go"
echo 'package thirdparty' > "$WORK/pkg/vendor/thirdparty/lib.go"

# Ratchet file lists only pkg/covered.
cat > "$WORK/ratchet.txt" <<EOF
# comment lines and blank lines should be ignored

pkg/covered 80.0
EOF

echo ""
echo "check-go-ratchet-completeness.sh"
echo ""

cd "$WORK"

# Case 1: default (non-strict) mode reports missing but exits 0.
set +e
OUTPUT=$(bash "$SUT" ratchet.txt pkg 2>&1)
EXIT=$?
set -e
if [ "$EXIT" -eq 0 ] \
   && echo "$OUTPUT" | grep -q "pkg/uncovered" \
   && ! echo "$OUTPUT" | grep -q "pkg/covered$" \
   && ! echo "$OUTPUT" | grep -q "pkg/testonly" \
   && ! echo "$OUTPUT" | grep -q "vendor/thirdparty"; then
  pass "reports missing packages, ignores tracked/test-only/vendored, exits 0 by default"
else
  fail "default mode" "exit=$EXIT output:\n$OUTPUT"
fi

# Case 2: --strict flag makes it fail.
set +e
OUTPUT=$(bash "$SUT" --strict ratchet.txt pkg 2>&1)
EXIT=$?
set -e
if [ "$EXIT" -eq 1 ] && echo "$OUTPUT" | grep -q "pkg/uncovered"; then
  pass "--strict exits non-zero when packages are missing"
else
  fail "--strict mode" "exit=$EXIT output:\n$OUTPUT"
fi

# Case 3: STRICT=1 env var equivalent to --strict.
set +e
OUTPUT=$(STRICT=1 bash "$SUT" ratchet.txt pkg 2>&1)
EXIT=$?
set -e
if [ "$EXIT" -eq 1 ]; then
  pass "STRICT=1 env var enables strict mode"
else
  fail "STRICT env var" "exit=$EXIT output:\n$OUTPUT"
fi

# Case 4: fully populated ratchet -> exit 0 with success message.
cat > "$WORK/ratchet-full.txt" <<EOF
pkg/covered 80.0
pkg/uncovered 0.0
EOF
set +e
OUTPUT=$(bash "$SUT" --strict ratchet-full.txt pkg 2>&1)
EXIT=$?
set -e
if [ "$EXIT" -eq 0 ] && echo "$OUTPUT" | grep -q "All Go packages"; then
  pass "exits 0 in strict mode when ratchet is complete"
else
  fail "complete ratchet" "exit=$EXIT output:\n$OUTPUT"
fi

# Case 5: missing threshold file -> usage error exit 2.
set +e
OUTPUT=$(bash "$SUT" no-such-file.txt pkg 2>&1)
EXIT=$?
set -e
if [ "$EXIT" -eq 2 ]; then
  pass "missing threshold file returns exit 2"
else
  fail "missing file" "exit=$EXIT output:\n$OUTPUT"
fi

echo ""
echo "──────────────────────────────────────────"
echo "  ${TESTS_PASSED} passed, ${TESTS_FAILED} failed (${TESTS_RUN} total)"
echo "──────────────────────────────────────────"
[ "$TESTS_FAILED" -eq 0 ]
