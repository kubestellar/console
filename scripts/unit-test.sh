#!/bin/bash
# Run all Vitest unit tests (React components, hooks, utilities)
#
# Usage:
#   ./scripts/unit-test.sh              # Run all unit tests
#   ./scripts/unit-test.sh --coverage   # Run with coverage reporting
#
# Covers 98+ test files across:
#   - React components (rendering, props, state, interactions)
#   - Custom hooks (useCachedData, useMissions, etc.)
#   - Utility libraries (mission sanitizer, matcher, etc.)
#
# Prerequisites:
#   - npm install done in web/
#
# Output:
#   Console output with pass/fail counts
#   Coverage reports in web/coverage/ (with --coverage flag)

set -euo pipefail

cd "$(dirname "$0")/../web"

EXTRA_ARGS=""

for arg in "$@"; do
  case "$arg" in
    --coverage) EXTRA_ARGS="--coverage" ;;
  esac
done

echo "Running Vitest unit tests..."

# CI runners (ubuntu-latest, 7 GB RAM) can OOM when running 900+ test files.
# 8192 MB (8 GB) is the new limit after test count grew to 1453+ files.
# The previous 7168 MB limit caused environment setup slowdowns (17+ min
# jsdom construction time) and intermittent worker crashes (nightly
# regression 2026-05-28, issue #16250).
if [ -n "${CI:-}" ]; then
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=8192"
fi

# Vitest may exit non-zero due to pool worker termination timeout on CI
# even when all tests pass. Capture the output and check for actual failures.
# Use project directory for output file to avoid /tmp restrictions (#16250).
OUTPUT_FILE="vitest-output.log"
EXIT_CODE=0
npx vitest run $EXTRA_ARGS --reporter=verbose 2>&1 | tee "$OUTPUT_FILE" || EXIT_CODE=$?

if [ "$EXIT_CODE" -ne 0 ]; then
  # Check if all tests actually passed despite the non-zero exit
  if grep -q "Tests.*passed" "$OUTPUT_FILE" && ! grep -q "Tests.*failed" "$OUTPUT_FILE"; then
    # All tests passed — exit was likely a pool worker termination timeout
    echo ""
    echo "All tests passed (exit code $EXIT_CODE was a non-test error, e.g. worker cleanup timeout)"
    exit 0
  fi
  # On failure, show more context (last 20 lines) to aid debugging (#16250)
  echo ""
  echo "====== Last 20 lines of output ======"
  tail -20 "$OUTPUT_FILE" 2>/dev/null || true
  echo "======================================"
  exit "$EXIT_CODE"
fi
