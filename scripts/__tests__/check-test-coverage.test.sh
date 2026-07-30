#!/bin/bash
# scripts/__tests__/check-test-coverage.test.sh
#
# Shell regression tests for scripts/check-test-coverage.sh
# (Issue #15739, Part of #4189)
#
# These tests verify:
#   1. All source files have corresponding test files → exits 0 with gap_count=0
#   2. New source file without test → exits 0 (informational) with gap_count>0 and filename in report
#   3. Component file without test → gap counted correctly
#   4. Co-located test file accepted (ComponentName.test.tsx alongside source)
#   5. Generated/skip-worthy files (index, types, constants, etc.) excluded
#   6. Test/spec files not flagged as untested sources
#   7. Script always exits 0 (informational only)
#   8. Markdown report has proper structure when gaps exist
#   9. Clean success report when all covered
#
# Usage:
#   bash scripts/__tests__/check-test-coverage.test.sh
#
# Requirements: git, bash 4+
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
# Locate the script under test (SUT) using an absolute path
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SUT="${SCRIPT_DIR}/check-test-coverage.sh"

# ============================================================================
# Helper: run a test case inside an isolated temp git repo
#
# Usage: run_in_sandbox <<'BODY' ... BODY
#
# Inside the heredoc body you can use:
#   - All standard git/bash commands
#   - $SUT (absolute path to the script under test)
#   - web/src/hooks/ and web/src/components/ directories (pre-created)
#   - "exit N" to signal test result: 0=pass, non-zero=fail
#
# The function captures stdout and stderr from the subshell as OUTPUT.
# ============================================================================

run_in_sandbox() {
  local tmpdir
  tmpdir=$(mktemp -d "${TMPDIR:-/tmp}/cov-test-XXXXXX")
  local body
  body=$(cat)  # read heredoc from stdin

  # Clean up potential existing report to prevent cross-test contamination in CI
  rm -f /tmp/test-coverage-gaps.md

  # Run the test body in a subshell so cd never leaks, capturing both stdout and stderr
  OUTPUT=$(
    cd "$tmpdir" || exit 99
    git init -q .
    git config user.email "test@test.com"
    git config user.name "Test"

    # Seed the repo with required directory structure
    mkdir -p web/src/hooks/__tests__ web/src/components/cards/__tests__
    echo "// placeholder" > web/src/hooks/.gitkeep
    echo "// placeholder" > web/src/components/cards/.gitkeep
    git add .
    git commit -q -m "init"
    git branch -M main

    # Execute the test body
    eval "$body"
  ) 2>&1
  SANDBOX_EXIT=$?
  rm -rf "$tmpdir"
}

# ============================================================================
# Tests
# ============================================================================

echo ""
echo "check-test-coverage.sh"
echo ""

# ---------- Test 1: All files have tests → gap_count=0 ----------

run_in_sandbox <<'BODY'
echo "export function useFoo() {}" > web/src/hooks/useFoo.ts
echo "test('useFoo')" > web/src/hooks/__tests__/useFoo.test.ts
git add . && git commit -q -m "add hook with test"
bash "$SUT" "HEAD~1" 2>&1
BODY
if [ "$SANDBOX_EXIT" -eq 0 ] && echo "$OUTPUT" | grep -q "gap_count=0"; then
  pass "reports gap_count=0 when all new source files have matching tests"
else
  fail "reports gap_count=0 when all new source files have matching tests" "got exit=$SANDBOX_EXIT, output: $OUTPUT"
fi

# ---------- Test 2: Missing test file → gap reported ----------

run_in_sandbox <<'BODY'
echo "export function useBar() {}" > web/src/hooks/useBar.ts
git add . && git commit -q -m "add hook without test"
bash "$SUT" "HEAD~1" 2>&1
BODY
if [ "$SANDBOX_EXIT" -eq 0 ] && echo "$OUTPUT" | grep -q "gap_count=1"; then
  # Verify the report mentions the file
  if [ -f "/tmp/test-coverage-gaps.md" ] && grep -q "useBar" "/tmp/test-coverage-gaps.md"; then
    pass "reports gap_count>0 and filename when source file has no test"
  else
    fail "reports gap_count>0 and filename when source file has no test" "report does not mention useBar"
  fi
else
  fail "reports gap_count>0 and filename when source file has no test" "got exit=$SANDBOX_EXIT, output: $OUTPUT"
fi

# ---------- Test 3: Component file without test → gap reported ----------

run_in_sandbox <<'BODY'
echo "export function MyCard() {}" > web/src/components/cards/MyCard.tsx
git add . && git commit -q -m "add component without test"
bash "$SUT" "HEAD~1" 2>&1
BODY
if echo "$OUTPUT" | grep -q "gap_count=1"; then
  if [ -f "/tmp/test-coverage-gaps.md" ] && grep -q "MyCard" "/tmp/test-coverage-gaps.md"; then
    pass "reports component gap when new .tsx has no test"
  else
    fail "reports component gap when new .tsx has no test" "report does not mention MyCard"
  fi
else
  fail "reports component gap when new .tsx has no test" "expected gap_count=1, output: $OUTPUT"
fi

# ---------- Test 4: Co-located test file is also accepted ----------

run_in_sandbox <<'BODY'
echo "export function Widget() {}" > web/src/components/cards/Widget.tsx
echo "test('Widget')" > web/src/components/cards/Widget.test.tsx
git add . && git commit -q -m "add component with co-located test"
bash "$SUT" "HEAD~1" 2>&1
BODY
if echo "$OUTPUT" | grep -q "gap_count=0"; then
  pass "accepts co-located test file (ComponentName.test.tsx alongside source)"
else
  fail "accepts co-located test file (ComponentName.test.tsx alongside source)" "expected gap_count=0, output: $OUTPUT"
fi

# ---------- Test 5: Generated/skipped files are excluded ----------

run_in_sandbox <<'BODY'
for name in index types constants demoData demo mocks fixtures stories; do
  echo "// auto" > "web/src/hooks/${name}.ts"
done
git add . && git commit -q -m "add skip-worthy files"
bash "$SUT" "HEAD~1" 2>&1
BODY
if echo "$OUTPUT" | grep -q "gap_count=0"; then
  pass "excludes index.ts, types.ts, constants.ts, demoData.ts from gap count"
else
  fail "excludes index.ts, types.ts, constants.ts, demoData.ts from gap count" "expected gap_count=0, output: $OUTPUT"
fi

# ---------- Test 6: Test/spec files not flagged ----------

run_in_sandbox <<'BODY'
echo "test('x')" > web/src/hooks/useSomething.test.ts
echo "test('x')" > web/src/components/cards/MyCard.spec.tsx
git add . && git commit -q -m "add test files only"
bash "$SUT" "HEAD~1" 2>&1
BODY
if echo "$OUTPUT" | grep -q "gap_count=0"; then
  pass "does not flag .test.ts or .spec.ts files as untested sources"
else
  fail "does not flag .test.ts or .spec.ts files as untested sources" "expected gap_count=0, output: $OUTPUT"
fi

# ---------- Test 7: Script always exits 0 ----------

run_in_sandbox <<'BODY'
echo "export function useUntested() {}" > web/src/hooks/useUntested.ts
git add . && git commit -q -m "add untested hook"
bash "$SUT" "HEAD~1" > /dev/null 2>&1
BODY
if [ "$SANDBOX_EXIT" -eq 0 ]; then
  pass "always exits 0 even when gaps exist (informational only)"
else
  fail "always exits 0 even when gaps exist (informational only)" "expected exit 0, got $SANDBOX_EXIT"
fi

# ---------- Test 8: Report has markdown structure ----------

run_in_sandbox <<'BODY'
echo "export function useMissing() {}" > web/src/hooks/useMissing.ts
git add . && git commit -q -m "add missing hook"
bash "$SUT" "HEAD~1" > /dev/null 2>&1
BODY
if [ -f "/tmp/test-coverage-gaps.md" ] && grep -q "Test Coverage Gaps" "/tmp/test-coverage-gaps.md" && grep -q "Suggested test location" "/tmp/test-coverage-gaps.md"; then
  pass "generates valid markdown report with table headers when gaps exist"
else
  fail "generates valid markdown report with table headers when gaps exist" "report missing expected markdown structure"
fi

# ---------- Test 9: Clean report when all covered ----------

run_in_sandbox <<'BODY'
echo "export function useGood() {}" > web/src/hooks/useGood.ts
echo "test('useGood')" > web/src/hooks/__tests__/useGood.test.ts
git add . && git commit -q -m "covered hook"
bash "$SUT" "HEAD~1" > /dev/null 2>&1
BODY
if [ -f "/tmp/test-coverage-gaps.md" ] && grep -q "Test Coverage Check" "/tmp/test-coverage-gaps.md" && grep -q "All new source files" "/tmp/test-coverage-gaps.md"; then
  pass "generates success markdown when no gaps"
else
  fail "generates success markdown when no gaps" "report should show success message"
fi

# ============================================================================
# Summary
# ============================================================================

summary
