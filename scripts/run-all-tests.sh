#!/bin/bash
# Master test runner — runs ALL test scripts in /scripts/ sequentially and
# generates a unified summary report. This is the single entry point for
# the full CNCF graduation test suite.
#
# Usage:
#   ./scripts/run-all-tests.sh              # Run all test scripts
#   ./scripts/run-all-tests.sh --fast       # Skip long-running tests (fuzz, playwright)
#
# Output:
#   /tmp/all-tests-report.json              — unified JSON data
#   /tmp/all-tests-summary.md               — unified human-readable summary
#
# Exit code:
#   0 — all suites passed
#   1 — one or more suites failed

set -euo pipefail

cd "$(dirname "$0")/.."

# ============================================================================
# Colors & argument parsing
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

FAST_MODE=""
for arg in "$@"; do
  case "$arg" in
    --fast) FAST_MODE="1" ;;
  esac
done

REPORT_JSON="/tmp/all-tests-report.json"
REPORT_MD="/tmp/all-tests-summary.md"

echo -e "${BOLD}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  KubeStellar Console — Full Test Suite            ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${DIM}Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)${NC}"
echo ""

# ============================================================================
# Test scripts to run (in order)
# ============================================================================

# Scripts that do fast static checks (no external deps required)
declare -a FAST_SCRIPTS=(
  "scripts/consistency-test.sh"
  "scripts/helm-lint-test.sh"
  "scripts/license-compliance-test.sh"
  "scripts/mission-security-test.sh"
  "scripts/card-registry-integrity-test.sh"
  "scripts/unit-test.sh"
)

# Scripts that run Go tests
declare -a GO_SCRIPTS=(
  "scripts/auth-lifecycle-test.sh"
  "scripts/settings-migration-test.sh"
  "scripts/update-lifecycle-test.sh"
  "scripts/websocket-resilience-test.sh"
  "scripts/gosec-test.sh"
  "scripts/dependency-audit-test.sh"
)

# Security scanning scripts
declare -a SECURITY_SCRIPTS=(
  "scripts/secret-scan-test.sh"
  "scripts/ts-sast-test.sh"
  "scripts/container-scan-test.sh"
  "scripts/security-headers-test.sh"
)

# Scripts that require a running server, Playwright, or are long-running
declare -a SLOW_SCRIPTS=(
  "scripts/api-contract-test.sh"
  "scripts/api-fuzz-test.sh"
  "scripts/error-boundary-test.sh"
)

# Build full list
# In --fast mode, only run FAST_SCRIPTS (quick static checks). Go tests,
# security scans, and Playwright tests are all skipped to keep the run
# under a few minutes (#3395).
declare -a ALL_SCRIPTS=()
for s in "${FAST_SCRIPTS[@]}"; do ALL_SCRIPTS+=("$s"); done
if [ -z "$FAST_MODE" ]; then
  for s in "${GO_SCRIPTS[@]}"; do ALL_SCRIPTS+=("$s"); done
  for s in "${SECURITY_SCRIPTS[@]}"; do ALL_SCRIPTS+=("$s"); done
  for s in "${SLOW_SCRIPTS[@]}"; do ALL_SCRIPTS+=("$s"); done
fi

# In --fast mode, record Go/Security/Slow scripts as skipped so they appear in reports
declare -a FAST_SKIPPED_SCRIPTS=()
if [ -n "$FAST_MODE" ]; then
  for s in "${GO_SCRIPTS[@]}"; do FAST_SKIPPED_SCRIPTS+=("$s"); done
  for s in "${SECURITY_SCRIPTS[@]}"; do FAST_SKIPPED_SCRIPTS+=("$s"); done
  for s in "${SLOW_SCRIPTS[@]}"; do FAST_SKIPPED_SCRIPTS+=("$s"); done
fi

TOTAL=0
PASSED_SUITES=0
FAILED_SUITES=0
SKIPPED_SUITES=0
RESULTS=""
declare -a FAILED_NAMES=()
declare -A SUITE_STATUS=()  # Tracks actual pass/fail/skip per suite name

# Extract a short failure reason from a log file, JSON-escaped for embedding
extract_failure_reason() {
  local log_file="$1"
  local reason
  # Strip ANSI codes, grab last 5 non-empty lines, join with newlines,
  # then use jq to produce a properly JSON-escaped string (handles
  # backslashes, tabs, control chars, quotes — all of which broke the
  # hand-rolled sed escaping and caused jq parse errors in the nightly
  # comparison step, see #9346).
  reason=$(sed 's/\x1b\[[0-9;]*m//g' "$log_file" 2>/dev/null \
    | grep -v '^\s*$' \
    | tail -5 \
    | head -c 500 \
    | jq -Rs '.' 2>/dev/null \
    | sed 's/^"//;s/"$//') || true
  echo "$reason"
}

# ============================================================================
# Run each test suite
# ============================================================================

for script in "${ALL_SCRIPTS[@]}"; do
  SUITE_NAME=$(basename "$script" .sh)
  TOTAL=$((TOTAL + 1))

  if [ ! -f "$script" ]; then
    echo -e "  ${DIM}⊘  ${SUITE_NAME}${NC} — script not found"
    SKIPPED_SUITES=$((SKIPPED_SUITES + 1))
    SUITE_STATUS["$SUITE_NAME"]="skip"
    RESULTS="${RESULTS}{\"suite\":\"${SUITE_NAME}\",\"status\":\"skip\",\"duration\":0},"
    continue
  fi

  echo -e "  ${BOLD}▶ ${SUITE_NAME}${NC}"

  # Run the script and capture output + exit code + duration
  SUITE_START=$(date +%s)
  SUITE_OUTPUT="/tmp/suite-${SUITE_NAME}.log"
  SUITE_EXIT=0
  bash "$script" > "$SUITE_OUTPUT" 2>&1 || SUITE_EXIT=$?
  SUITE_END=$(date +%s)
  SUITE_DURATION=$((SUITE_END - SUITE_START))

  if [ "$SUITE_EXIT" -eq 0 ]; then
    echo -e "    ${GREEN}✓ PASS${NC}  (${SUITE_DURATION}s)"
    PASSED_SUITES=$((PASSED_SUITES + 1))
    SUITE_STATUS["$SUITE_NAME"]="pass"
    RESULTS="${RESULTS}{\"suite\":\"${SUITE_NAME}\",\"status\":\"pass\",\"duration\":${SUITE_DURATION}},"
  else
    echo -e "    ${RED}❌ FAIL${NC}  (${SUITE_DURATION}s)"
    # Show last few lines of output for failed suites
    tail -3 "$SUITE_OUTPUT" 2>/dev/null | while IFS= read -r line; do
      echo -e "      ${DIM}${line}${NC}"
    done
    FAILED_SUITES=$((FAILED_SUITES + 1))
    FAILED_NAMES+=("$SUITE_NAME")
    SUITE_STATUS["$SUITE_NAME"]="fail"
    FAIL_REASON=$(extract_failure_reason "$SUITE_OUTPUT")
    RESULTS="${RESULTS}{\"suite\":\"${SUITE_NAME}\",\"status\":\"fail\",\"duration\":${SUITE_DURATION},\"failure_reason\":\"${FAIL_REASON}\"},"
  fi
done

# Record Go/Security/Slow scripts as skipped in --fast mode
if [ -n "$FAST_MODE" ] && [ "${#FAST_SKIPPED_SCRIPTS[@]}" -gt 0 ]; then
  echo -e "${DIM}Go, security, and slow tests skipped (--fast mode)${NC}"
  for script in "${FAST_SKIPPED_SCRIPTS[@]}"; do
    SUITE_NAME=$(basename "$script" .sh)
    TOTAL=$((TOTAL + 1))
    SKIPPED_SUITES=$((SKIPPED_SUITES + 1))
    SUITE_STATUS["$SUITE_NAME"]="skip"
    RESULTS="${RESULTS}{\"suite\":\"${SUITE_NAME}\",\"status\":\"skip\",\"duration\":0},"
  done
fi

echo ""

# ============================================================================
# Playwright-based tests: build once, share a single preview server
# ============================================================================

declare -a PLAYWRIGHT_SCRIPTS=(
  "scripts/console-error-scan.sh"
  "scripts/nav-test.sh"
  "scripts/perf-test.sh"
  "scripts/ui-compliance-test.sh"
  "scripts/deploy-test.sh"
  "scripts/cache-test.sh"
  "scripts/benchmark-test.sh"
  "scripts/ai-ml-test.sh"
  "scripts/a11y-test.sh"
  "scripts/error-resilience-test.sh"
  "scripts/i18n-test.sh"
  "scripts/interaction-test.sh"
  "scripts/security-e2e-test.sh"
)

PREVIEW_PORT=4174
PREVIEW_PID=""

stop_preview_server() {
  if [ -n "$PREVIEW_PID" ]; then
    kill "$PREVIEW_PID" 2>/dev/null || true
    wait "$PREVIEW_PID" 2>/dev/null || true
    PREVIEW_PID=""
  fi
}

if [ -z "$FAST_MODE" ]; then
  # Check if npm/node are available (required for Playwright)
  if ! command -v npx &>/dev/null; then
    echo -e "${DIM}Playwright tests skipped (npx not found)${NC}"
    for script in "${PLAYWRIGHT_SCRIPTS[@]}"; do
      SUITE_NAME=$(basename "$script" .sh)
      TOTAL=$((TOTAL + 1))
      SKIPPED_SUITES=$((SKIPPED_SUITES + 1))
      SUITE_STATUS["$SUITE_NAME"]="skip"
      RESULTS="${RESULTS}{\"suite\":\"${SUITE_NAME}\",\"status\":\"skip\",\"duration\":0},"
    done
  else
    echo -e "${BOLD}Building frontend for Playwright tests...${NC}"
    BUILD_EXIT=0
    cd web
    npm run build > /tmp/suite-playwright-build.log 2>&1 || BUILD_EXIT=$?
    cd ..

    if [ "$BUILD_EXIT" -ne 0 ]; then
      echo -e "  ${RED}❌ Frontend build failed — skipping Playwright tests${NC}"
      echo -e "  ${DIM}See /tmp/suite-playwright-build.log${NC}"
      for script in "${PLAYWRIGHT_SCRIPTS[@]}"; do
        SUITE_NAME=$(basename "$script" .sh)
        TOTAL=$((TOTAL + 1))
        SKIPPED_SUITES=$((SKIPPED_SUITES + 1))
        SUITE_STATUS["$SUITE_NAME"]="skip"
        RESULTS="${RESULTS}{\"suite\":\"${SUITE_NAME}\",\"status\":\"skip\",\"duration\":0},"
      done
    else
      # Start a single vite preview server for all Playwright scripts
      cd web
      npx vite preview --port "$PREVIEW_PORT" --host > /tmp/suite-vite-preview.log 2>&1 &
      PREVIEW_PID=$!
      cd ..
      trap 'stop_preview_server' EXIT

      # Wait for the preview server to be ready (up to 15s)
      WAIT_SECS=15
      READY=""
      for i in $(seq 1 "$WAIT_SECS"); do
        if curl -sf "http://127.0.0.1:${PREVIEW_PORT}" --max-time 2 > /dev/null 2>&1; then
          READY="1"
          break
        fi
        sleep 1
      done

      if [ -z "$READY" ]; then
        echo -e "  ${RED}❌ Vite preview server failed to start — skipping Playwright tests${NC}"
        stop_preview_server
        for script in "${PLAYWRIGHT_SCRIPTS[@]}"; do
          SUITE_NAME=$(basename "$script" .sh)
          TOTAL=$((TOTAL + 1))
          SKIPPED_SUITES=$((SKIPPED_SUITES + 1))
          SUITE_STATUS["$SUITE_NAME"]="skip"
          RESULTS="${RESULTS}{\"suite\":\"${SUITE_NAME}\",\"status\":\"skip\",\"duration\":0},"
        done
      else
        echo -e "  ${GREEN}✓${NC} Preview server running on port ${PREVIEW_PORT}"
        echo ""
        echo -e "${BOLD}Playwright-based tests:${NC}"
        echo ""

        # Export PLAYWRIGHT_BASE_URL so Playwright configs skip their own webServer
        export PLAYWRIGHT_BASE_URL="http://127.0.0.1:${PREVIEW_PORT}"

        # Per-suite wall-clock cap (seconds). Prevents a single hanging suite
        # (e.g. benchmark retries against unresponsive external services) from
        # consuming the entire nightly workflow budget. 5 minutes is the default
        # and is generous for most Playwright suites. A handful of heavier
        # suites exceed this routinely (#8981, #8986, #8987) — they get an
        # explicit override below. Keep the default tight so a genuinely hung
        # suite still fails fast.
        PLAYWRIGHT_SUITE_TIMEOUT_SECS=300

        # Per-suite timeout overrides (seconds). Only list suites that need
        # MORE time than the default. See:
        #   #8981 console-error-scan: 38+ routes × ~5s settle ≈ 250-270s, right
        #     at the 300s cap. Bumping to 600s gives headroom for additional
        #     routes without re-firing nightly regressions.
        #   #8984 ui-compliance-test: renders every registered card type; total
        #     card count keeps growing as we add cards.
        #   #8985 cache-test: renders all cards via the same compliance harness.
        #   #8986 benchmark-test: 12 tests × up to 60s each ≈ 720s worst case.
        #   #8987 ai-ml-test: 15 tests × up to 300s each in pathological cases.
        #   #9098 nav-test: 6 serial scenarios (warmup/cold/warm/from-main/
        #     from-clusters/rapid-nav) × ~60-120s each ≈ 480-720s total.
        #     Default 300s cap killed it mid-run after warm-nav completed.
        #   #9099 perf-test: same serial scenario structure as nav-test.
        #   #9346 nav-test, perf-test, ai-ml-test: 600s not enough — all 3
        #     consistently hit the cap mid-run with work remaining (nav-test
        #     completes 5/6 scenarios, perf-test still iterating dashboards,
        #     ai-ml-test retries consuming budget). 900s matches their
        #     Playwright-level timeout (900_000ms) and fits within the 120m
        #     workflow backstop.
        declare -A PLAYWRIGHT_SUITE_TIMEOUT_OVERRIDES=(
          ["console-error-scan"]=600
          ["ui-compliance-test"]=600
          ["cache-test"]=600
          ["benchmark-test"]=600
          ["ai-ml-test"]=900
          ["nav-test"]=900
          ["perf-test"]=900
        )

        for script in "${PLAYWRIGHT_SCRIPTS[@]}"; do
          SUITE_NAME=$(basename "$script" .sh)
          TOTAL=$((TOTAL + 1))

          if [ ! -f "$script" ]; then
            echo -e "  ${DIM}⊘  ${SUITE_NAME}${NC} — script not found"
            SKIPPED_SUITES=$((SKIPPED_SUITES + 1))
            SUITE_STATUS["$SUITE_NAME"]="skip"
            RESULTS="${RESULTS}{\"suite\":\"${SUITE_NAME}\",\"status\":\"skip\",\"duration\":0},"
            continue
          fi

          # Resolve the per-suite timeout (override wins, else default).
          SUITE_TIMEOUT_SECS="${PLAYWRIGHT_SUITE_TIMEOUT_OVERRIDES[$SUITE_NAME]:-$PLAYWRIGHT_SUITE_TIMEOUT_SECS}"

          echo -e "  ${BOLD}▶ ${SUITE_NAME}${NC}"
          SUITE_START=$(date +%s)
          SUITE_OUTPUT="/tmp/suite-${SUITE_NAME}.log"
          SUITE_EXIT=0
          timeout "${SUITE_TIMEOUT_SECS}" bash "$script" > "$SUITE_OUTPUT" 2>&1 || SUITE_EXIT=$?
          SUITE_END=$(date +%s)
          SUITE_DURATION=$((SUITE_END - SUITE_START))

          # timeout(1) returns 124 when the command is killed by the timer
          TIMEOUT_EXIT_CODE=124
          if [ "$SUITE_EXIT" -eq "$TIMEOUT_EXIT_CODE" ]; then
            echo -e "    ${RED}⏱  TIMEOUT${NC} after ${SUITE_TIMEOUT_SECS}s"
            echo "Suite killed after ${SUITE_TIMEOUT_SECS}s wall-clock timeout" >> "$SUITE_OUTPUT"
          fi

          if [ "$SUITE_EXIT" -eq 0 ]; then
            echo -e "    ${GREEN}✓ PASS${NC}  (${SUITE_DURATION}s)"
            PASSED_SUITES=$((PASSED_SUITES + 1))
            SUITE_STATUS["$SUITE_NAME"]="pass"
            RESULTS="${RESULTS}{\"suite\":\"${SUITE_NAME}\",\"status\":\"pass\",\"duration\":${SUITE_DURATION}},"
          else
            echo -e "    ${RED}❌ FAIL${NC}  (${SUITE_DURATION}s)"
            tail -3 "$SUITE_OUTPUT" 2>/dev/null | while IFS= read -r line; do
              echo -e "      ${DIM}${line}${NC}"
            done
            FAILED_SUITES=$((FAILED_SUITES + 1))
            FAILED_NAMES+=("$SUITE_NAME")
            SUITE_STATUS["$SUITE_NAME"]="fail"
            FAIL_REASON=$(extract_failure_reason "$SUITE_OUTPUT")
            RESULTS="${RESULTS}{\"suite\":\"${SUITE_NAME}\",\"status\":\"fail\",\"duration\":${SUITE_DURATION},\"failure_reason\":\"${FAIL_REASON}\"},"
          fi
        done

        unset PLAYWRIGHT_BASE_URL
        stop_preview_server
      fi
    fi
  fi
else
  echo -e "${DIM}Playwright tests skipped (--fast mode)${NC}"
  for script in "${PLAYWRIGHT_SCRIPTS[@]}"; do
    SUITE_NAME=$(basename "$script" .sh)
    TOTAL=$((TOTAL + 1))
    SKIPPED_SUITES=$((SKIPPED_SUITES + 1))
    SUITE_STATUS["$SUITE_NAME"]="skip"
    RESULTS="${RESULTS}{\"suite\":\"${SUITE_NAME}\",\"status\":\"skip\",\"duration\":0},"
  done
fi

echo ""

# ============================================================================
# Generate reports
# ============================================================================

RESULTS="${RESULTS%,}"

# Build JSON report, validating with jq to catch malformed failure_reason
# strings (unescaped chars, shell-expanded $variables, etc.)
CANDIDATE_JSON="{
  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
  \"fastMode\": $([ -n "$FAST_MODE" ] && echo "true" || echo "false"),
  \"summary\": {
    \"total\": ${TOTAL},
    \"passed\": ${PASSED_SUITES},
    \"failed\": ${FAILED_SUITES},
    \"skipped\": ${SKIPPED_SUITES}
  },
  \"results\": [${RESULTS}]
}"

if echo "$CANDIDATE_JSON" | jq . > "$REPORT_JSON" 2>/dev/null; then
  : # valid JSON written
else
  echo "WARNING: Generated JSON was malformed — writing minimal report" >&2
  jq -n \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson fm "$([ -n "$FAST_MODE" ] && echo "true" || echo "false")" \
    --argjson total "$TOTAL" \
    --argjson passed "$PASSED_SUITES" \
    --argjson failed "$FAILED_SUITES" \
    --argjson skipped "$SKIPPED_SUITES" \
    '{timestamp: $ts, fastMode: $fm, summary: {total: $total, passed: $passed, failed: $failed, skipped: $skipped}, results: []}' \
    > "$REPORT_JSON"
fi

cat > "$REPORT_MD" << EOF
# KubeStellar Console — Full Test Suite

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Mode:** $([ -n "$FAST_MODE" ] && echo "Fast (skipping fuzz/playwright)" || echo "Full")

## Summary

| Metric   | Count |
|----------|-------|
| Total    | ${TOTAL} |
| Passed   | ${PASSED_SUITES} |
| Failed   | ${FAILED_SUITES} |
| Skipped  | ${SKIPPED_SUITES} |

## Suites

| Suite | Status |
|-------|--------|
EOF

# Add suite results to markdown using the SUITE_STATUS associative array
# which records the actual exit-code-based pass/fail/skip for each suite.
for script in "${ALL_SCRIPTS[@]}" "${FAST_SKIPPED_SCRIPTS[@]}" "${PLAYWRIGHT_SCRIPTS[@]}"; do
  SUITE_NAME=$(basename "$script" .sh)
  STATUS="${SUITE_STATUS[$SUITE_NAME]:-skip}"
  case "$STATUS" in
    pass) echo "| \`${SUITE_NAME}\` | :white_check_mark: PASS |" >> "$REPORT_MD" ;;
    fail) echo "| \`${SUITE_NAME}\` | :x: FAIL |" >> "$REPORT_MD" ;;
    *)    echo "| \`${SUITE_NAME}\` | :fast_forward: SKIP |" >> "$REPORT_MD" ;;
  esac
done

# ============================================================================
# Summary
# ============================================================================

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Summary${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Total:    ${TOTAL}"
echo -e "  ${GREEN}Passed:   ${PASSED_SUITES}${NC}"
echo -e "  ${RED}Failed:   ${FAILED_SUITES}${NC}"
echo -e "  ${DIM}Skipped:  ${SKIPPED_SUITES}${NC}"
echo ""

if [ "${#FAILED_NAMES[@]}" -gt 0 ]; then
  echo -e "${RED}${BOLD}Failed suites:${NC}"
  for name in "${FAILED_NAMES[@]}"; do
    echo -e "  ${RED}• ${name}${NC}  (see /tmp/suite-${name}.log)"
  done
  echo ""
fi

echo -e "${DIM}Finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)${NC}"
echo ""
echo "Reports:"
echo "  JSON:     $REPORT_JSON"
echo "  Summary:  $REPORT_MD"
echo "  Logs:     /tmp/suite-*.log"

[ "$FAILED_SUITES" -gt 0 ] && exit 1
exit 0
