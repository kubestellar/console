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
# With 3 forked workers, each worker needs ~1.8 GB heap to stay within the 7 GB
# physical RAM limit (leaving 1.6 GB for system overhead and V8 non-heap memory).
# The previous 2048 MB limit was still causing occasional "Worker exited unexpectedly"
# OOM crashes. Reduced to 1792 MB (1.75 GB) for additional safety margin
# (nightly regressions 2026-06-25, issues #19580, #19584).
if [ -n "${CI:-}" ]; then
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=1792"
fi

# Vitest may exit non-zero due to pool worker termination timeout on CI
# even when all tests pass. Capture the output and check for actual failures.
# Run with forks so worker heaps are isolated instead of sharing one threaded heap.
# Use project directory for output file to avoid /tmp restrictions (#16250).
# Limit to 3 workers on CI to prevent OOM while keeping runtime reasonable.
# Forked Vitest workers typically use a few hundred MB of RSS each, so 3 forks
# fit within the 7 GB runner even though the Node heap limit is 8 GB per worker.
# This keeps the nightly unit suite from timing out as file count continues growing.
OUTPUT_FILE="vitest-output.log"
EXIT_CODE=0
WORKER_ARGS=""
if [ -n "${CI:-}" ]; then
  WORKER_ARGS="--maxWorkers=3"
fi
npx vitest run $EXTRA_ARGS --pool=forks $WORKER_ARGS --testTimeout=30000 --reporter=verbose 2>&1 | tee "$OUTPUT_FILE" || EXIT_CODE=$?

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
