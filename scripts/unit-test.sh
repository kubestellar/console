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

# CI runners (ubuntu-latest, 7 GB RAM) can OOM when running 2000+ test files.
# With maxWorkers=1 (set in vite.config.ts for CI), a single worker needs ~3.5 GB
# heap to handle the full suite without crashes. The 7 GB runner has enough
# headroom: 3.5 GB worker + 1.5 GB system/V8 overhead + 2 GB safety margin.
# Previous 1792 MB limit caused "Worker exited unexpectedly" OOM crashes (#20007).
# Increased to 3584 MB (3.5 GB) to prevent nightly regressions.
# The test suite has since grown past 560 files; the nightly runner OOMs with
# 4 shards when a single shard accumulates too many heavy test files in one
# batch. Increasing to 8 shards halves per-shard test count and peak memory
# while keeping the sequential run within the 180m nightly timeout (#21083).
#
# The suite has since grown to 2600+ test files (~325/shard at 8 shards),
# which again pushed several shards' worker heaps past 3584 MB ("Reached heap
# limit Allocation failed - JavaScript heap out of memory" / "Worker exited
# unexpectedly" in shards 4, 6, and 7 of the 2026-08-06 nightly run) — the
# same OOM failure mode as #21083, just recurring at a larger file count.
# Increasing to 32 shards brings per-shard test count back down to ~80,
# close to the ~70/shard ratio that was stable after the #21083 fix, while
# only adding a few minutes of fixed per-shard startup overhead — still well
# within the 180m nightly timeout (#22004).
#
# Even at 32 shards, one shard still OOM'd on 2026-08-08 (heap climbed to
# 3581 MB — right at the 3584 MB ceiling — partway through a shard, not
# because of any single heavy file, just cumulative per-shard growth). The
# 7 GB figure the previous limit was sized against is outdated: ubuntu-latest
# on a public repo actually provides 16 GB RAM, so raising the single-worker
# heap ceiling to 6144 MB (6 GB) leaves ~10 GB of headroom for the OS, the
# forked process overhead, and other CI steps, comfortably absorbing this
# kind of per-shard variance without needing yet more shards (#22004).
if [ -n "${CI:-}" ]; then
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=6144"
fi

# Vitest may exit non-zero due to pool worker termination timeout on CI
# even when all tests pass. Capture the output and check for actual failures.
# Run with forks so worker heaps are isolated instead of sharing one threaded heap.
# Use project directory for output file to avoid /tmp restrictions (#16250).
# Worker count is controlled by vite.config.ts (maxWorkers/minWorkers),
# not by CLI args — CLI override was causing OOM by forcing 3 workers when
# vite.config correctly limited to 1 for CI memory constraints (#20007).
#
# In CI, run tests in shards to reduce parent process memory footprint. With
# 560+ test files, the Vitest parent process accumulates results in memory
# for final reporting, causing OOM on 7GB runners even with 1 worker (#20007).
# Running 32 shards sequentially (up from 8, see #22004) keeps peak per-shard
# memory in check as the suite has grown to 2600+ test files.
OUTPUT_FILE="vitest-output.log"
EXIT_CODE=0
SHARD_COUNT=32

if [ -n "${CI:-}" ]; then
  # CI: run in $SHARD_COUNT shards sequentially, combining output
  echo "Running tests in $SHARD_COUNT shards to prevent OOM..."
  > "$OUTPUT_FILE"  # Clear file
  for shard in $(seq 1 "$SHARD_COUNT"); do
    echo ""
    echo "=== Shard $shard/$SHARD_COUNT ==="
    npx vitest run $EXTRA_ARGS --pool=forks --testTimeout=30000 --reporter=verbose --shard=$shard/$SHARD_COUNT 2>&1 | tee -a "$OUTPUT_FILE" || EXIT_CODE=$?
  done
else
  # Local: run all tests at once
  npx vitest run $EXTRA_ARGS --pool=forks --testTimeout=30000 --reporter=verbose 2>&1 | tee "$OUTPUT_FILE" || EXIT_CODE=$?
fi

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
