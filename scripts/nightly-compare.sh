#!/bin/bash
# Compare the latest nightly test result with the previous run and generate
# a markdown summary suitable for a GitHub issue comment.
#
# Usage:
#   ./scripts/nightly-compare.sh <current.json> [results-dir]
#
# Output:
#   Writes comparison markdown to stdout.
#   Exit code 0 = no regressions, 1 = regressions found.

set -euo pipefail

CURRENT_FILE="${1:?Usage: nightly-compare.sh <current.json> [results-dir]}"
RESULTS_DIR="${2:-test-results/nightly}"

# ============================================================================
# Constants
# ============================================================================

TREND_WINDOW=7  # number of recent runs to include in trend data

# ============================================================================
# Helpers
# ============================================================================

jq_or_fail() {
  if ! command -v jq &>/dev/null; then
    echo "ERROR: jq is required" >&2
    exit 1
  fi
  jq "$@"
}

# ============================================================================
# Load current results (bail early if JSON is malformed)
# ============================================================================

if ! jq empty "$CURRENT_FILE" 2>/dev/null; then
  echo "## :warning: Nightly Test Results"
  echo ""
  echo "_The test results JSON is malformed and cannot be parsed._"
  echo "_Check the [workflow run](https://github.com/kubestellar/console/actions) for details._"
  echo ""
  echo "**Date:** $(date -u +%Y-%m-%d)"
  echo "**File:** \`$CURRENT_FILE\`"
  exit 1
fi

CUR_TOTAL=$(jq_or_fail -r '.summary.total' "$CURRENT_FILE")
CUR_PASSED=$(jq_or_fail -r '.summary.passed' "$CURRENT_FILE")
CUR_FAILED=$(jq_or_fail -r '.summary.failed' "$CURRENT_FILE")
CUR_SKIPPED=$(jq_or_fail -r '.summary.skipped' "$CURRENT_FILE")
CUR_TS=$(jq_or_fail -r '.timestamp' "$CURRENT_FILE")

# ============================================================================
# Find previous result (most recent file before current)
# ============================================================================

PREV_FILE=""
CURRENT_BASENAME=$(basename "$CURRENT_FILE")
for f in $(ls -1 "$RESULTS_DIR"/*.json 2>/dev/null | sort -r); do
  if [ "$(basename "$f")" != "$CURRENT_BASENAME" ]; then
    PREV_FILE="$f"
    break
  fi
done

# ============================================================================
# Generate comparison
# ============================================================================

HAS_REGRESSION=0

# Header with pass rate badge
PASS_RATE=$(( CUR_PASSED * 100 / (CUR_TOTAL > 0 ? CUR_TOTAL : 1) ))
if [ "$CUR_FAILED" -eq 0 ]; then
  STATUS_EMOJI="white_check_mark"
  STATUS_TEXT="All tests passing"
else
  STATUS_EMOJI="warning"
  STATUS_TEXT="${CUR_FAILED} test(s) failing"
fi

cat <<EOF
## :${STATUS_EMOJI}: Nightly Test Results — ${CUR_TS}

**Pass rate: ${PASS_RATE}%** (${CUR_PASSED}/${CUR_TOTAL} passed, ${CUR_FAILED} failed, ${CUR_SKIPPED} skipped)

EOF

# ============================================================================
# Comparison with previous run
# ============================================================================

if [ -n "$PREV_FILE" ]; then
  PREV_TOTAL=$(jq_or_fail -r '.summary.total' "$PREV_FILE")
  PREV_PASSED=$(jq_or_fail -r '.summary.passed' "$PREV_FILE")
  PREV_FAILED=$(jq_or_fail -r '.summary.failed' "$PREV_FILE")
  PREV_TS=$(jq_or_fail -r '.timestamp' "$PREV_FILE")

  DELTA_PASSED=$((CUR_PASSED - PREV_PASSED))
  DELTA_FAILED=$((CUR_FAILED - PREV_FAILED))

  echo "### Comparison with previous run (${PREV_TS})"
  echo ""

  if [ "$DELTA_PASSED" -gt 0 ]; then
    echo ":chart_with_upwards_trend: **+${DELTA_PASSED} more passing** than previous run"
  elif [ "$DELTA_PASSED" -lt 0 ]; then
    echo ":chart_with_downwards_trend: **${DELTA_PASSED} fewer passing** than previous run"
  else
    echo ":left_right_arrow: Same number of passing tests as previous run"
  fi
  echo ""

  # Per-suite status changes
  NEW_FAILURES=""
  NEW_FIXES=""

  for suite in $(jq_or_fail -r '.results[].suite' "$CURRENT_FILE"); do
    CUR_STATUS=$(jq_or_fail -r --arg s "$suite" '.results[] | select(.suite == $s) | .status' "$CURRENT_FILE")
    PREV_STATUS=$(jq_or_fail -r --arg s "$suite" '.results[] | select(.suite == $s) | .status // "missing"' "$PREV_FILE")

    if [ "$CUR_STATUS" = "fail" ] && [ "$PREV_STATUS" = "pass" ]; then
      NEW_FAILURES="${NEW_FAILURES}\n- \`${suite}\` — was passing, now **failing**"
      HAS_REGRESSION=1
    elif [ "$CUR_STATUS" = "pass" ] && [ "$PREV_STATUS" = "fail" ]; then
      NEW_FIXES="${NEW_FIXES}\n- \`${suite}\` — was failing, now **passing** :tada:"
    fi
  done

  # New suites not in previous run
  for suite in $(jq_or_fail -r '.results[].suite' "$CURRENT_FILE"); do
    PREV_STATUS=$(jq_or_fail -r --arg s "$suite" '.results[] | select(.suite == $s) | .status // "missing"' "$PREV_FILE")
    if [ "$PREV_STATUS" = "missing" ]; then
      CUR_STATUS=$(jq_or_fail -r --arg s "$suite" '.results[] | select(.suite == $s) | .status' "$CURRENT_FILE")
      NEW_FIXES="${NEW_FIXES}\n- \`${suite}\` — **new suite** (${CUR_STATUS})"
    fi
  done

  if [ -n "$NEW_FAILURES" ]; then
    echo "#### :rotating_light: Regressions"
    echo -e "$NEW_FAILURES"
    echo ""
  fi

  if [ -n "$NEW_FIXES" ]; then
    echo "#### :sparkles: Improvements"
    echo -e "$NEW_FIXES"
    echo ""
  fi

  if [ -z "$NEW_FAILURES" ] && [ -z "$NEW_FIXES" ]; then
    echo "No suite status changes from previous run."
    echo ""
  fi
else
  echo "_First nightly run — no previous data for comparison._"
  echo ""
fi

# ============================================================================
# Full suite table
# ============================================================================

echo "### Suite Details"
echo ""
echo "| Suite | Status | Duration |"
echo "|-------|--------|----------|"

jq_or_fail -r '.results[] | "| `\(.suite)` | \(if .status == "pass" then ":white_check_mark: PASS" elif .status == "fail" then ":x: FAIL" else ":fast_forward: SKIP" end) | \(.duration)s |"' "$CURRENT_FILE"

echo ""

# ============================================================================
# Trend data (last N runs)
# ============================================================================

TREND_FILES=$(ls -1 "$RESULTS_DIR"/*.json 2>/dev/null | sort -r | head -"$TREND_WINDOW")
TREND_COUNT=$(echo "$TREND_FILES" | wc -l | tr -d ' ')

if [ "$TREND_COUNT" -gt 1 ]; then
  echo "### Trend (last ${TREND_COUNT} runs)"
  echo ""
  echo "| Date | Passed | Failed | Skipped | Total | Pass Rate |"
  echo "|------|--------|--------|---------|-------|-----------|"

  for f in $(echo "$TREND_FILES" | sort); do
    T_TS=$(jq_or_fail -r '.timestamp' "$f")
    T_DATE=$(echo "$T_TS" | cut -c1-10)
    T_PASSED=$(jq_or_fail -r '.summary.passed' "$f")
    T_FAILED=$(jq_or_fail -r '.summary.failed' "$f")
    T_SKIPPED=$(jq_or_fail -r '.summary.skipped' "$f")
    T_TOTAL=$(jq_or_fail -r '.summary.total' "$f")
    T_RATE=$(( T_PASSED * 100 / (T_TOTAL > 0 ? T_TOTAL : 1) ))
    echo "| ${T_DATE} | ${T_PASSED} | ${T_FAILED} | ${T_SKIPPED} | ${T_TOTAL} | ${T_RATE}% |"
  done

  echo ""

  # ASCII sparkline of pass rates
  echo "<details>"
  echo "<summary>Pass rate trend</summary>"
  echo ""
  echo '```'
  echo "100% |"
  for f in $(echo "$TREND_FILES" | sort); do
    T_PASSED=$(jq_or_fail -r '.summary.passed' "$f")
    T_TOTAL=$(jq_or_fail -r '.summary.total' "$f")
    T_RATE=$(( T_PASSED * 100 / (T_TOTAL > 0 ? T_TOTAL : 1) ))
    BAR_LEN=$(( T_RATE / 2 ))
    BAR=$(printf '%0.s█' $(seq 1 "$BAR_LEN"))
    T_DATE=$(jq_or_fail -r '.timestamp' "$f" | cut -c6-10)
    printf "  %s |%s %d%%\n" "$T_DATE" "$BAR" "$T_RATE"
  done
  echo "     +$(printf '%0.s-' $(seq 1 52))"
  echo '```'
  echo ""
  echo "</details>"
  echo ""
fi

# ============================================================================
# Currently failing suites (for quick reference)
# ============================================================================

FAILING=$(jq_or_fail -r '.results[] | select(.status == "fail") | .suite' "$CURRENT_FILE")
if [ -n "$FAILING" ]; then
  echo "### :x: Currently Failing"
  echo ""
  for suite in $FAILING; do
    REASON=$(jq_or_fail -r --arg s "$suite" '.results[] | select(.suite == $s) | .failure_reason // ""' "$CURRENT_FILE")
    if [ -n "$REASON" ]; then
      echo "<details>"
      echo "<summary><code>${suite}</code> — FAILED</summary>"
      echo ""
      echo '```'
      echo -e "$REASON"
      echo '```'
      echo ""
      echo "</details>"
    else
      echo "- \`${suite}\` — see CI artifacts for details"
    fi
  done
  echo ""
fi

echo "---"
echo "_Generated by the nightly test suite workflow. Results stored in \`test-results/nightly/\`._"

exit "$HAS_REGRESSION"
