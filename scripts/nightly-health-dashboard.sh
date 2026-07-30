#!/bin/bash
# Generate a JSON health summary from nightly test results suitable for the
# Console dashboard.  Analyses the last N daily result files and produces:
#
#   - Total suites / passing / failing counts
#   - Pass-rate trend over the analysis window
#   - Flaky test detection (suites that alternate pass/fail)
#   - Average duration trend per suite
#   - Per-suite stability score
#
# Usage:
#   ./scripts/nightly-health-dashboard.sh [results-dir] [window]
#
# Arguments:
#   results-dir  Directory containing dated JSON files (default: test-results/nightly)
#   window       Number of recent runs to analyse (default: 7)
#
# Output:
#   Writes a JSON document to stdout.

set -euo pipefail

# ============================================================================
# Arguments & defaults
# ============================================================================

RESULTS_DIR="${1:-test-results/nightly}"
WINDOW="${2:-7}"

# ============================================================================
# Pre-flight
# ============================================================================

if ! command -v jq &>/dev/null; then
  echo '{"error":"jq is required but not installed"}' >&2
  exit 1
fi

if [ ! -d "$RESULTS_DIR" ]; then
  echo '{"error":"results directory not found","dir":"'"$RESULTS_DIR"'"}' >&2
  exit 1
fi

# Collect the most recent N result files (sorted newest-first).
mapfile -t FILES < <(find "$RESULTS_DIR" -maxdepth 1 -name '*.json' | sort -r | head -"$WINDOW")
FILE_COUNT=${#FILES[@]}

if [ "$FILE_COUNT" -eq 0 ]; then
  echo '{"error":"no result files found","dir":"'"$RESULTS_DIR"'"}' >&2
  exit 1
fi

# ============================================================================
# Latest run snapshot
# ============================================================================

LATEST="${FILES[0]}"
LATEST_TS=$(jq -r '.timestamp' "$LATEST")
LATEST_TOTAL=$(jq -r '.summary.total' "$LATEST")
LATEST_PASSED=$(jq -r '.summary.passed' "$LATEST")
LATEST_FAILED=$(jq -r '.summary.failed' "$LATEST")
LATEST_SKIPPED=$(jq -r '.summary.skipped' "$LATEST")

# ============================================================================
# Gather all suite names across the window
# ============================================================================

ALL_SUITES=$(for f in "${FILES[@]}"; do jq -r '.results[].suite' "$f"; done | sort -u)

# ============================================================================
# Build per-run trend array (oldest → newest)
# ============================================================================

TREND_JSON="["
FIRST_TREND=1
for (( i=FILE_COUNT-1; i>=0; i-- )); do
  f="${FILES[$i]}"
  ts=$(jq -r '.timestamp' "$f")
  passed=$(jq -r '.summary.passed' "$f")
  failed=$(jq -r '.summary.failed' "$f")
  skipped=$(jq -r '.summary.skipped' "$f")
  total=$(jq -r '.summary.total' "$f")
  rate=$(( passed * 100 / (total > 0 ? total : 1) ))

  # Compute average duration across all suites in this run
  avg_dur=$(jq '[.results[].duration] | if length > 0 then (add / length | . * 10 | round / 10) else 0 end' "$f")
  total_dur=$(jq '[.results[].duration] | add // 0' "$f")

  [ "$FIRST_TREND" -eq 1 ] && FIRST_TREND=0 || TREND_JSON+=","
  TREND_JSON+=$(cat <<ENTRY
{"date":"$ts","passed":$passed,"failed":$failed,"skipped":$skipped,"total":$total,"passRate":$rate,"avgDurationSec":$avg_dur,"totalDurationSec":$total_dur}
ENTRY
  )
done
TREND_JSON+="]"

# ============================================================================
# Flaky test detection & per-suite stability
# ============================================================================

# A suite is "flaky" if it changed status (pass↔fail) at least twice across
# the analysis window.  Stability score = (consistent runs / total runs) * 100.

SUITES_JSON="["
FIRST_SUITE=1

for suite in $ALL_SUITES; do
  statuses=()
  durations=()
  for (( i=FILE_COUNT-1; i>=0; i-- )); do
    f="${FILES[$i]}"
    s=$(jq -r --arg name "$suite" '.results[] | select(.suite == $name) | .status // "missing"' "$f")
    d=$(jq -r --arg name "$suite" '.results[] | select(.suite == $name) | .duration // 0' "$f")
    [ -z "$s" ] && s="missing"
    [ -z "$d" ] && d=0
    statuses+=("$s")
    durations+=("$d")
  done

  # Count status flips
  flips=0
  for (( j=1; j<${#statuses[@]}; j++ )); do
    prev="${statuses[$((j-1))]}"
    cur="${statuses[$j]}"
    if [ "$prev" != "$cur" ] && [ "$prev" != "missing" ] && [ "$cur" != "missing" ]; then
      (( flips++ )) || true
    fi
  done

  is_flaky="false"
  [ "$flips" -ge 2 ] && is_flaky="true"

  # Latest status
  latest_status="${statuses[${#statuses[@]}-1]}"

  # Stability = % of runs with same status as the most-common status
  pass_count=0
  fail_count=0
  present_count=0
  for st in "${statuses[@]}"; do
    [ "$st" = "missing" ] && continue
    (( present_count++ )) || true
    [ "$st" = "pass" ] && (( pass_count++ )) || true
    [ "$st" = "fail" ] && (( fail_count++ )) || true
  done
  dominant=$(( pass_count > fail_count ? pass_count : fail_count ))
  if [ "$present_count" -gt 0 ]; then
    stability=$(( dominant * 100 / present_count ))
  else
    stability=0
  fi

  # Duration stats (min / max / avg) — only from runs where suite was present
  dur_sum=0
  dur_count=0
  dur_min=999999
  dur_max=0
  for (( j=0; j<${#durations[@]}; j++ )); do
    [ "${statuses[$j]}" = "missing" ] && continue
    d="${durations[$j]}"
    (( dur_sum += d )) || true
    (( dur_count++ )) || true
    [ "$d" -lt "$dur_min" ] && dur_min=$d
    [ "$d" -gt "$dur_max" ] && dur_max=$d
  done
  if [ "$dur_count" -gt 0 ]; then
    dur_avg=$(( dur_sum / dur_count ))
  else
    dur_avg=0
    dur_min=0
  fi

  # Duration trend direction (compare first half avg vs second half avg)
  dur_trend="stable"
  if [ "$dur_count" -ge 4 ]; then
    half=$(( dur_count / 2 ))
    first_half_sum=0; first_half_n=0
    second_half_sum=0; second_half_n=0
    idx=0
    for (( j=0; j<${#durations[@]}; j++ )); do
      [ "${statuses[$j]}" = "missing" ] && continue
      d="${durations[$j]}"
      if [ "$idx" -lt "$half" ]; then
        (( first_half_sum += d )) || true
        (( first_half_n++ )) || true
      else
        (( second_half_sum += d )) || true
        (( second_half_n++ )) || true
      fi
      (( idx++ )) || true
    done
    if [ "$first_half_n" -gt 0 ] && [ "$second_half_n" -gt 0 ]; then
      first_avg=$(( first_half_sum / first_half_n ))
      second_avg=$(( second_half_sum / second_half_n ))
      # >10% change counts as a trend
      threshold=$(( first_avg / 10 ))
      [ "$threshold" -eq 0 ] && threshold=1
      if [ "$second_avg" -gt $(( first_avg + threshold )) ]; then
        dur_trend="slower"
      elif [ "$second_avg" -lt $(( first_avg - threshold )) ]; then
        dur_trend="faster"
      fi
    fi
  fi

  [ "$FIRST_SUITE" -eq 1 ] && FIRST_SUITE=0 || SUITES_JSON+=","
  SUITES_JSON+=$(cat <<SUITE
{"suite":"$suite","latestStatus":"$latest_status","isFlaky":$is_flaky,"flips":$flips,"stabilityPct":$stability,"passCount":$pass_count,"failCount":$fail_count,"presentRuns":$present_count,"durationAvgSec":$dur_avg,"durationMinSec":$dur_min,"durationMaxSec":$dur_max,"durationTrend":"$dur_trend"}
SUITE
  )
done
SUITES_JSON+="]"

# ============================================================================
# Overall health score
# ============================================================================

# Health = weighted combination of latest pass rate (60%) and average
# stability across suites (40%).
TOTAL_STABILITY=0
SUITE_COUNT=0
for suite in $ALL_SUITES; do
  (( SUITE_COUNT++ )) || true
done

if [ "$SUITE_COUNT" -gt 0 ]; then
  AVG_STABILITY=$(echo "$SUITES_JSON" | jq '[.[].stabilityPct] | add / length | round')
else
  AVG_STABILITY=0
fi

LATEST_RATE=$(( LATEST_PASSED * 100 / (LATEST_TOTAL > 0 ? LATEST_TOTAL : 1) ))
HEALTH_SCORE=$(( (LATEST_RATE * 60 + AVG_STABILITY * 40) / 100 ))

# Pass rate direction (comparing first run in window to latest)
OLDEST="${FILES[$((FILE_COUNT-1))]}"
OLDEST_PASSED=$(jq -r '.summary.passed' "$OLDEST")
OLDEST_TOTAL=$(jq -r '.summary.total' "$OLDEST")
OLDEST_RATE=$(( OLDEST_PASSED * 100 / (OLDEST_TOTAL > 0 ? OLDEST_TOTAL : 1) ))

if [ "$LATEST_RATE" -gt "$OLDEST_RATE" ]; then
  PASS_RATE_TREND="improving"
elif [ "$LATEST_RATE" -lt "$OLDEST_RATE" ]; then
  PASS_RATE_TREND="declining"
else
  PASS_RATE_TREND="stable"
fi

# Count flaky suites
FLAKY_COUNT=$(echo "$SUITES_JSON" | jq '[.[] | select(.isFlaky == true)] | length')

# ============================================================================
# Assemble final JSON
# ============================================================================

cat <<EOF
{
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "windowSize": $FILE_COUNT,
  "resultsDir": "$RESULTS_DIR",
  "latest": {
    "date": "$LATEST_TS",
    "total": $LATEST_TOTAL,
    "passed": $LATEST_PASSED,
    "failed": $LATEST_FAILED,
    "skipped": $LATEST_SKIPPED,
    "passRate": $LATEST_RATE
  },
  "health": {
    "score": $HEALTH_SCORE,
    "passRateTrend": "$PASS_RATE_TREND",
    "avgStabilityPct": $AVG_STABILITY,
    "flakyCount": $FLAKY_COUNT,
    "totalSuites": $SUITE_COUNT
  },
  "trend": $TREND_JSON,
  "suites": $SUITES_JSON
}
EOF
