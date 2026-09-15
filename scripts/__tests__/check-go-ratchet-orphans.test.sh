#!/bin/bash
# scripts/__tests__/check-go-ratchet-orphans.test.sh
#
# Mirror of check-go-ratchet-completeness.test.sh — same fixture shape,
# but drives the orphan detector: packages LISTED in the ratchet that no
# longer exist under the source roots (i.e. what broke every downstream
# PR after PR #23366 removed pkg/stellar/metrics/ without cleaning the
# ratchet entry). See kubestellar/console#23427.

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
SUT="${SCRIPT_DIR}/check-go-ratchet-orphans.sh"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Build a synthetic tree with two packages that still exist plus a
# vendored dir (which must not shadow "package doesn't exist"), and a
# testonly package (only a *_test.go file — should NOT count as an
# existing package, matching how check-go-ratchet-completeness.sh sees
# it, so a ratchet entry for it is treated as orphaned).
mkdir -p "$WORK/pkg/present-one" \
         "$WORK/pkg/present-two" \
         "$WORK/pkg/testonly" \
         "$WORK/pkg/vendor/thirdparty"
echo 'package presentone'  > "$WORK/pkg/present-one/one.go"
echo 'package presenttwo'  > "$WORK/pkg/present-two/two.go"
echo 'package testonly'    > "$WORK/pkg/testonly/testonly_test.go"
echo 'package thirdparty'  > "$WORK/pkg/vendor/thirdparty/lib.go"

# Ratchet lists an orphan (pkg/stellar/metrics — the actual case from
# PR #23366), a package that only has test files (pkg/testonly), and
# the two real ones. Presence of comment/blank lines confirms the awk
# skip logic also matches the completeness script.
cat > "$WORK/ratchet.txt" <<'EOF'
# per-package coverage floors

pkg/present-one 80.0
pkg/present-two 55.5
pkg/stellar/metrics 25.0
pkg/testonly 10.0
EOF

echo ""
echo "check-go-ratchet-orphans.sh"
echo ""

cd "$WORK"

# Case 1: default (non-strict) mode reports orphans but exits 0.
set +e
OUTPUT=$(bash "$SUT" ratchet.txt pkg 2>&1)
EXIT=$?
set -e
if [ "$EXIT" -eq 0 ] \
   && echo "$OUTPUT" | grep -q "pkg/stellar/metrics" \
   && echo "$OUTPUT" | grep -q "pkg/testonly" \
   && ! echo "$OUTPUT" | grep -q "pkg/present-one" \
   && ! echo "$OUTPUT" | grep -q "pkg/present-two"; then
  pass "reports orphaned entries, ignores still-present packages, exits 0 by default"
else
  fail "default mode" "exit=$EXIT output:\n$OUTPUT"
fi

# Case 2: --strict flag makes it fail.
set +e
OUTPUT=$(bash "$SUT" --strict ratchet.txt pkg 2>&1)
EXIT=$?
set -e
if [ "$EXIT" -eq 1 ] && echo "$OUTPUT" | grep -q "pkg/stellar/metrics"; then
  pass "--strict exits non-zero when orphans are present"
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

# Case 4: ratchet listing only existing packages -> exit 0 with success message.
cat > "$WORK/ratchet-clean.txt" <<'EOF'
pkg/present-one 80.0
pkg/present-two 55.5
EOF
set +e
OUTPUT=$(bash "$SUT" --strict ratchet-clean.txt pkg 2>&1)
EXIT=$?
set -e
if [ "$EXIT" -eq 0 ] && echo "$OUTPUT" | grep -q "still exist"; then
  pass "exits 0 in strict mode when every listed package still exists"
else
  fail "clean ratchet" "exit=$EXIT output:\n$OUTPUT"
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

# Case 6: no ratchet path argument at all -> usage exit 2.
set +e
OUTPUT=$(bash "$SUT" 2>&1)
EXIT=$?
set -e
if [ "$EXIT" -eq 2 ] && echo "$OUTPUT" | grep -q "Usage:"; then
  pass "missing threshold path prints usage and exits 2"
else
  fail "missing path" "exit=$EXIT output:\n$OUTPUT"
fi

# Case 7: writes a report section to GITHUB_STEP_SUMMARY when set.
SUMMARY_FILE="$WORK/summary.md"
set +e
OUTPUT=$(GITHUB_STEP_SUMMARY="$SUMMARY_FILE" bash "$SUT" ratchet.txt pkg 2>&1)
EXIT=$?
set -e
if [ "$EXIT" -eq 0 ] \
   && [ -s "$SUMMARY_FILE" ] \
   && grep -q "Go ratchet orphans" "$SUMMARY_FILE" \
   && grep -q "pkg/stellar/metrics" "$SUMMARY_FILE"; then
  pass "appends orphan report to GITHUB_STEP_SUMMARY"
else
  fail "step summary" "exit=$EXIT summary:\n$(cat "$SUMMARY_FILE" 2>/dev/null)"
fi

echo ""
echo "──────────────────────────────────────────"
echo "  ${TESTS_PASSED} passed, ${TESTS_FAILED} failed (${TESTS_RUN} total)"
echo "──────────────────────────────────────────"
[ "$TESTS_FAILED" -eq 0 ]
