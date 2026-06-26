#!/bin/bash
# scripts/__tests__/nightly-compare.test.sh
#
# Shell regression tests for scripts/nightly-compare.sh
# (Issue #15739, Part of #4189)
#
# These tests verify:
#   1. Coverage improved → outputs "upwards_trend" indicator, exits 0
#   2. Coverage decreased (regression) → outputs "Regressions" and exits 1
#   3. First run (no baseline) → outputs "First nightly run" and exits 0
#   4. Malformed baseline JSON → exits 1 with error message, no crash
#   5. Zero-coverage baseline → does not divide by zero
#   6. All tests passing → correct emoji and pass rate
#   7. Improvements detected → shows suite transition from fail to pass
#   8. Missing CLI argument → exits non-zero with usage error
#   9. Suite details table is always rendered
#   10. Currently Failing section shows reason when failures exist
#
# Usage:
#   bash scripts/__tests__/nightly-compare.test.sh
#
# Requirements: jq, bash 4+
# No external test framework needed — uses a minimal built-in harness.

set -uo pipefail

# ============================================================================
# Test harness
# ============================================================================

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

summary() {
  echo ""
  echo "──────────────────────────────────────────"
  echo "  ${TESTS_PASSED} passed, ${TESTS_FAILED} failed (${TESTS_RUN} total)"
  if [ "$TESTS_FAILED" -gt 0 ]; then
    echo ""
    echo "  Failed tests:"
    echo -e "$FAILURES"
  fi
  echo "──────────────────────────────────────────"
  [ "$TESTS_FAILED" -eq 0 ]
}

# ============================================================================
# Locate SUT using absolute path
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SUT="${SCRIPT_DIR}/nightly-compare.sh"

# ============================================================================
# Helpers to generate JSON structures cleanly
# ============================================================================

# Write a nightly results JSON file
# Usage: write_results <file> <total> <passed> <failed> <skipped> <timestamp> [suite_json]
write_results() {
  local file="$1"
  local total="$2"
  local passed="$3"
  local failed="$4"
  local skipped="$5"
  local timestamp="$6"
  local suites="${7:-[]}"

  cat > "$file" <<EOF
{
  "summary": {
    "total": ${total},
    "passed": ${passed},
    "failed": ${failed},
    "skipped": ${skipped}
  },
  "timestamp": "${timestamp}",
  "results": ${suites}
}
EOF
}

# ============================================================================
# Helper: run a test case inside an isolated temp directory sandbox
#
# Usage: run_in_sandbox <<'BODY' ... BODY
# ============================================================================

run_in_sandbox() {
  local tmpdir
  tmpdir=$(mktemp -d "${TMPDIR:-/tmp}/nightly-test-XXXXXX")
  local body
  body=$(cat)

  # Run the test body in a subshell, capturing both stdout and stderr
  OUTPUT=$(
    cd "$tmpdir" || exit 99
    eval "$body"
  ) 2>&1
  SANDBOX_EXIT=$?
  rm -rf "$tmpdir"
}

# ============================================================================
# Tests
# ============================================================================

echo ""
echo "nightly-compare.sh"
echo ""

# ---------- Test 1: Coverage improved → upwards trend indicator ----------

run_in_sandbox <<'BODY'
mkdir -p results
# Previous run: 90 passed
write_results "results/2026-05-24.json" 100 90 10 0 "2026-05-24T00:00:00Z" \
  '[{"suite":"hooks","status":"pass","duration":1.2}]'

# Current run: 95 passed (improved!)
write_results "results/2026-05-25.json" 100 95 5 0 "2026-05-25T00:00:00Z" \
  '[{"suite":"hooks","status":"pass","duration":1.1}]'

bash "$SUT" "results/2026-05-25.json" "results" 2>&1
BODY

if [ "$SANDBOX_EXIT" -eq 0 ] && echo "$OUTPUT" | grep -q "upwards_trend"; then
  pass "outputs upwards trend when coverage improved from previous run"
else
  fail "outputs upwards trend when coverage improved from previous run" "exit=$SANDBOX_EXIT, output: $OUTPUT"
fi

# ---------- Test 2: Coverage decreased → regression, exits 1 ----------

run_in_sandbox <<'BODY'
mkdir -p results
# Previous: suite was passing
write_results "results/2026-05-24.json" 100 100 0 0 "2026-05-24T00:00:00Z" \
  '[{"suite":"components","status":"pass","duration":2.0}]'

# Current: same suite now failing
write_results "results/2026-05-25.json" 100 90 10 0 "2026-05-25T00:00:00Z" \
  '[{"suite":"components","status":"fail","duration":2.1,"failure_reason":"TypeError"}]'

bash "$SUT" "results/2026-05-25.json" "results" 2>&1
BODY

if [ "$SANDBOX_EXIT" -eq 1 ] && echo "$OUTPUT" | grep -q "Regressions" && echo "$OUTPUT" | grep -q "components"; then
  pass "outputs Regressions and exits 1 when a suite regresses from pass to fail"
else
  fail "outputs Regressions and exits 1 when a suite regresses from pass to fail" "exit=$SANDBOX_EXIT, output: $OUTPUT"
fi

# ---------- Test 3: First run (no baseline) → exits 0, no crash ----------

run_in_sandbox <<'BODY'
mkdir -p results
write_results "results/2026-05-25.json" 50 48 2 0 "2026-05-25T00:00:00Z" \
  '[{"suite":"hooks","status":"pass","duration":0.5}]'

bash "$SUT" "results/2026-05-25.json" "results" 2>&1
BODY

if [ "$SANDBOX_EXIT" -eq 0 ] && echo "$OUTPUT" | grep -q "First nightly run"; then
  pass "handles first run (no previous baseline) gracefully with exit 0"
else
  fail "handles first run (no previous baseline) gracefully with exit 0" "exit=$SANDBOX_EXIT, output: $OUTPUT"
fi

# ---------- Test 4: Malformed JSON → exits 1 with error ----------

run_in_sandbox <<'BODY'
mkdir -p results
echo '{ "summary": INVALID }' > "results/2026-05-25.json"

bash "$SUT" "results/2026-05-25.json" "results" 2>&1
BODY

if [ "$SANDBOX_EXIT" -eq 1 ] && echo "$OUTPUT" | grep -q "malformed"; then
  pass "exits 1 with error message when current JSON is malformed"
else
  fail "exits 1 with error message when current JSON is malformed" "exit=$SANDBOX_EXIT, output: $OUTPUT"
fi

# ---------- Test 5: Zero-coverage → no divide-by-zero crash ----------

run_in_sandbox <<'BODY'
mkdir -p results
write_results "results/2026-05-25.json" 0 0 0 0 "2026-05-25T00:00:00Z" '[]'

bash "$SUT" "results/2026-05-25.json" "results" 2>&1
BODY

if [ "$SANDBOX_EXIT" -eq 0 ] && echo "$OUTPUT" | grep -q "Pass rate: 0%"; then
  pass "handles zero total tests without divide-by-zero crash"
else
  fail "handles zero total tests without divide-by-zero crash" "exit=$SANDBOX_EXIT, output: $OUTPUT"
fi

# ---------- Test 6: All tests passing → correct emoji ----------

run_in_sandbox <<'BODY'
mkdir -p results
write_results "results/2026-05-25.json" 200 200 0 0 "2026-05-25T00:00:00Z" \
  '[{"suite":"all","status":"pass","duration":5.0}]'

bash "$SUT" "results/2026-05-25.json" "results" 2>&1
BODY

if [ "$SANDBOX_EXIT" -eq 0 ] && echo "$OUTPUT" | grep -q "white_check_mark" && echo "$OUTPUT" | grep -q "100%"; then
  pass "outputs white_check_mark emoji and 100% pass rate when all tests pass"
else
  fail "outputs white_check_mark emoji and 100% pass rate when all tests pass" "exit=$SANDBOX_EXIT, output: $OUTPUT"
fi

# ---------- Test 7: Improvements detected ----------

run_in_sandbox <<'BODY'
mkdir -p results
# Previous: suite failing
write_results "results/2026-05-24.json" 50 40 10 0 "2026-05-24T00:00:00Z" \
  '[{"suite":"cards","status":"fail","duration":1.5}]'

# Current: same suite now passing
write_results "results/2026-05-25.json" 50 50 0 0 "2026-05-25T00:00:00Z" \
  '[{"suite":"cards","status":"pass","duration":1.2}]'

bash "$SUT" "results/2026-05-25.json" "results" 2>&1
BODY

if [ "$SANDBOX_EXIT" -eq 0 ] && echo "$OUTPUT" | grep -q "Improvements" && echo "$OUTPUT" | grep -q "cards"; then
  pass "outputs Improvements section when suite goes from fail to pass"
else
  fail "outputs Improvements section when suite goes from fail to pass" "exit=$SANDBOX_EXIT, output: $OUTPUT"
fi

# ---------- Test 8: Missing usage argument → exits with usage error ----------

run_in_sandbox <<'BODY'
bash "$SUT" 2>&1
BODY

if [ "$SANDBOX_EXIT" -ne 0 ]; then
  pass "exits with usage error when no current file argument is provided"
else
  fail "exits with usage error when no current file argument is provided" "expected exit non-zero, got $SANDBOX_EXIT"
fi

# ---------- Test 9: Suite details table is always rendered ----------

run_in_sandbox <<'BODY'
mkdir -p results
write_results "results/2026-05-25.json" 10 8 2 0 "2026-05-25T00:00:00Z" \
  '[{"suite":"hooks","status":"pass","duration":0.8},{"suite":"pages","status":"fail","duration":1.5}]'

bash "$SUT" "results/2026-05-25.json" "results" 2>&1
BODY

if echo "$OUTPUT" | grep -q "Suite Details" && echo "$OUTPUT" | grep -q "hooks" && echo "$OUTPUT" | grep -q "pages"; then
  pass "renders Suite Details markdown table with status and duration"
else
  fail "renders Suite Details markdown table with status and duration" "output missing table or suites"
fi

# ---------- Test 10: Failing suites section shows failure reason ----------

run_in_sandbox <<'BODY'
mkdir -p results
write_results "results/2026-05-25.json" 10 5 5 0 "2026-05-25T00:00:00Z" \
  '[{"suite":"broken-suite","status":"fail","duration":0.5,"failure_reason":"ReferenceError"}]'

bash "$SUT" "results/2026-05-25.json" "results" 2>&1
BODY

if echo "$OUTPUT" | grep -q "Currently Failing" && echo "$OUTPUT" | grep -q "broken-suite" && echo "$OUTPUT" | grep -q "ReferenceError"; then
  pass "shows Currently Failing section with failure reason for failed suites"
else
  fail "shows Currently Failing section with failure reason for failed suites" "output missing failure details"
fi

# ============================================================================
# Summary
# ============================================================================

summary
