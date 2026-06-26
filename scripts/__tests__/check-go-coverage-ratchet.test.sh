#!/bin/bash
# scripts/__tests__/check-go-coverage-ratchet.test.sh

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

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SUT="${SCRIPT_DIR}/check-go-coverage-ratchet.sh"
FIXTURE_DIR="${SCRIPT_DIR}/testdata/check-go-coverage-ratchet"
REPORT_FILE="${FIXTURE_DIR}/report.md"

run_case() {
  local total_file="$1"
  local package_file="$2"
  rm -f "$REPORT_FILE"
  set +e
  OUTPUT=$(bash "$SUT" "${FIXTURE_DIR}/sample.coverprofile" "$total_file" "$package_file" "$REPORT_FILE" 2>&1)
  EXIT_CODE=$?
  set -e
}

echo ""
echo "check-go-coverage-ratchet.sh"
echo ""

run_case "${FIXTURE_DIR}/total-pass.txt" "${FIXTURE_DIR}/packages-pass.txt"
if [ "$EXIT_CODE" -eq 0 ] && grep -q '| total | 58.3% | 58.3% | :white_check_mark: |' "$REPORT_FILE" && grep -q '| pkg/k8s | 25.0% | 25.0% | :white_check_mark: |' "$REPORT_FILE"; then
  pass "passes when total and package floors are met"
else
  fail "passes when total and package floors are met" "exit=$EXIT_CODE output=$OUTPUT"
fi

run_case "${FIXTURE_DIR}/total-fail.txt" "${FIXTURE_DIR}/packages-pass.txt"
if [ "$EXIT_CODE" -ne 0 ] && echo "$OUTPUT" | grep -q 'below ratchet floor 60.0%'; then
  pass "fails when total coverage drops below the stored floor"
else
  fail "fails when total coverage drops below the stored floor" "exit=$EXIT_CODE output=$OUTPUT"
fi

run_case "${FIXTURE_DIR}/total-pass.txt" "${FIXTURE_DIR}/packages-fail.txt"
if [ "$EXIT_CODE" -ne 0 ] && echo "$OUTPUT" | grep -q 'pkg/k8s is 25.0% which is below ratchet floor 30.0%'; then
  pass "fails when package coverage drops below its stored floor"
else
  fail "fails when package coverage drops below its stored floor" "exit=$EXIT_CODE output=$OUTPUT"
fi

run_case "${FIXTURE_DIR}/total-pass.txt" "${FIXTURE_DIR}/packages-missing.txt"
if [ "$EXIT_CODE" -ne 0 ] && echo "$OUTPUT" | grep -q 'Package pkg/missing was not found'; then
  pass "fails when an enforced package is absent from the coverprofile"
else
  fail "fails when an enforced package is absent from the coverprofile" "exit=$EXIT_CODE output=$OUTPUT"
fi

summary
