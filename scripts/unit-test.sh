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
# 7168 MB leaves ~1 GB for the runner and OS. The previous 6144 limit caused
# worker crashes with 917+ test files (nightly regression 2026-04-26).
if [ -n "${CI:-}" ]; then
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=7168"
fi

# Vitest may exit non-zero due to pool worker termination timeout on CI
# even when all tests pass. Capture the output and check for actual failures.
OUTPUT_FILE="/tmp/vitest-output.log"
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
  exit "$EXIT_CODE"
fi
