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

set -uo pipefail

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
  "scripts/error-boundary-test.sh"
  "scripts/mission-security-test.sh"
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

# Scripts that require a running server or are long-running
declare -a SLOW_SCRIPTS=(
  "scripts/api-contract-test.sh"
  "scripts/api-fuzz-test.sh"
)

# Build full list
declare -a ALL_SCRIPTS=()
for s in "${FAST_SCRIPTS[@]}"; do ALL_SCRIPTS+=("$s"); done
for s in "${GO_SCRIPTS[@]}"; do ALL_SCRIPTS+=("$s"); done
if [ -z "$FAST_MODE" ]; then
  for s in "${SLOW_SCRIPTS[@]}"; do ALL_SCRIPTS+=("$s"); done
fi

TOTAL=0
PASSED_SUITES=0
FAILED_SUITES=0
SKIPPED_SUITES=0
RESULTS=""
declare -a FAILED_NAMES=()

# ============================================================================
# Run each test suite
# ============================================================================

for script in "${ALL_SCRIPTS[@]}"; do
  SUITE_NAME=$(basename "$script" .sh)
  TOTAL=$((TOTAL + 1))

  if [ ! -f "$script" ]; then
    echo -e "  ${DIM}⊘  ${SUITE_NAME}${NC} — script not found"
    SKIPPED_SUITES=$((SKIPPED_SUITES + 1))
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
    RESULTS="${RESULTS}{\"suite\":\"${SUITE_NAME}\",\"status\":\"pass\",\"duration\":${SUITE_DURATION}},"
  else
    echo -e "    ${RED}❌ FAIL${NC}  (${SUITE_DURATION}s)"
    # Show last few lines of output for failed suites
    tail -3 "$SUITE_OUTPUT" 2>/dev/null | while IFS= read -r line; do
      echo -e "      ${DIM}${line}${NC}"
    done
    FAILED_SUITES=$((FAILED_SUITES + 1))
    FAILED_NAMES+=("$SUITE_NAME")
    RESULTS="${RESULTS}{\"suite\":\"${SUITE_NAME}\",\"status\":\"fail\",\"duration\":${SUITE_DURATION}},"
  fi
done

echo ""

# ============================================================================
# Playwright-based tests: build once, share a single preview server
# ============================================================================

declare -a PLAYWRIGHT_SCRIPTS=(
  "scripts/console-error-scan.sh"
  "scripts/nav-test.sh"
  "scripts/perf-test.sh"
  "scripts/ui-compliance-test.sh"
  "scripts/cache-test.sh"
)

PREVIEW_PORT=4174
PREVIEW_PID=""

stop_preview_server() {
  if [ -n "$PREVIEW_PID" ]; then
    kill "$PREVIEW_PID" 2>/dev/null
    wait "$PREVIEW_PID" 2>/dev/null
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
          RESULTS="${RESULTS}{\"suite\":\"${SUITE_NAME}\",\"status\":\"skip\",\"duration\":0},"
        done
      else
        echo -e "  ${GREEN}✓${NC} Preview server running on port ${PREVIEW_PORT}"
        echo ""
        echo -e "${BOLD}Playwright-based tests:${NC}"
        echo ""

        # Export PLAYWRIGHT_BASE_URL so Playwright configs skip their own webServer
        export PLAYWRIGHT_BASE_URL="http://127.0.0.1:${PREVIEW_PORT}"

        for script in "${PLAYWRIGHT_SCRIPTS[@]}"; do
          SUITE_NAME=$(basename "$script" .sh)
          TOTAL=$((TOTAL + 1))

          if [ ! -f "$script" ]; then
            echo -e "  ${DIM}⊘  ${SUITE_NAME}${NC} — script not found"
            SKIPPED_SUITES=$((SKIPPED_SUITES + 1))
            RESULTS="${RESULTS}{\"suite\":\"${SUITE_NAME}\",\"status\":\"skip\",\"duration\":0},"
            continue
          fi

          echo -e "  ${BOLD}▶ ${SUITE_NAME}${NC}"
          SUITE_START=$(date +%s)
          SUITE_OUTPUT="/tmp/suite-${SUITE_NAME}.log"
          SUITE_EXIT=0
          bash "$script" > "$SUITE_OUTPUT" 2>&1 || SUITE_EXIT=$?
          SUITE_END=$(date +%s)
          SUITE_DURATION=$((SUITE_END - SUITE_START))

          if [ "$SUITE_EXIT" -eq 0 ]; then
            echo -e "    ${GREEN}✓ PASS${NC}  (${SUITE_DURATION}s)"
            PASSED_SUITES=$((PASSED_SUITES + 1))
            RESULTS="${RESULTS}{\"suite\":\"${SUITE_NAME}\",\"status\":\"pass\",\"duration\":${SUITE_DURATION}},"
          else
            echo -e "    ${RED}❌ FAIL${NC}  (${SUITE_DURATION}s)"
            tail -3 "$SUITE_OUTPUT" 2>/dev/null | while IFS= read -r line; do
              echo -e "      ${DIM}${line}${NC}"
            done
            FAILED_SUITES=$((FAILED_SUITES + 1))
            FAILED_NAMES+=("$SUITE_NAME")
            RESULTS="${RESULTS}{\"suite\":\"${SUITE_NAME}\",\"status\":\"fail\",\"duration\":${SUITE_DURATION}},"
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
    RESULTS="${RESULTS}{\"suite\":\"${SUITE_NAME}\",\"status\":\"skip\",\"duration\":0},"
  done
fi

echo ""

# ============================================================================
# Generate reports
# ============================================================================

RESULTS="${RESULTS%,}"

cat > "$REPORT_JSON" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "fastMode": $([ -n "$FAST_MODE" ] && echo "true" || echo "false"),
  "summary": {
    "total": ${TOTAL},
    "passed": ${PASSED_SUITES},
    "failed": ${FAILED_SUITES},
    "skipped": ${SKIPPED_SUITES}
  },
  "results": [${RESULTS}]
}
EOF

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

EOF

# Add suite results to markdown
for script in "${ALL_SCRIPTS[@]}" "${PLAYWRIGHT_SCRIPTS[@]}"; do
  SUITE_NAME=$(basename "$script" .sh)
  SUITE_LOG="/tmp/suite-${SUITE_NAME}.log"
  if [ -f "$SUITE_LOG" ]; then
    if grep -q "passed\|PASS\|All.*checks passed" "$SUITE_LOG" 2>/dev/null; then
      echo "| \`${SUITE_NAME}\` | PASS |" >> "$REPORT_MD"
    else
      echo "| \`${SUITE_NAME}\` | FAIL |" >> "$REPORT_MD"
    fi
  else
    echo "| \`${SUITE_NAME}\` | SKIP |" >> "$REPORT_MD"
  fi
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
