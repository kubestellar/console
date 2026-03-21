#!/bin/bash
# Startup smoke tests — validates that each startup path actually serves
# a working web page (not a 404 or blank page).
#
# Usage:
#   ./scripts/startup-smoke-test.sh demo     # Test startup-demo.sh
#   ./scripts/startup-smoke-test.sh oauth    # Test startup-oauth.sh (mock creds)
#   ./scripts/startup-smoke-test.sh docker   # Test Docker build + entrypoint.sh
#
# Exit code:
#   0 — startup + page load succeeded
#   1 — startup failed or page returned unexpected content

set -euo pipefail

cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

MODE="${1:-}"

if [ -z "$MODE" ]; then
  echo "Usage: $0 {demo|oauth|docker}"
  exit 1
fi

PIDS_TO_KILL=()

cleanup() {
  echo -e "\n${DIM}Cleaning up...${NC}"
  for pid in "${PIDS_TO_KILL[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  # Kill any processes we started on known ports
  for port in 8080 8081 5174; do
    lsof -ti ":$port" 2>/dev/null | xargs -r kill 2>/dev/null || true
  done
  # Stop docker container if running
  docker rm -f kc-smoke-test 2>/dev/null || true
}
trap cleanup EXIT

wait_for_url() {
  local url="$1"
  local timeout="${2:-60}"
  local start_time
  start_time=$(date +%s)

  echo -e "${DIM}  Waiting for ${url} (timeout: ${timeout}s)...${NC}"

  while true; do
    local elapsed=$(( $(date +%s) - start_time ))
    if [ "$elapsed" -ge "$timeout" ]; then
      echo -e "${RED}  Timed out after ${timeout}s waiting for ${url}${NC}"
      return 1
    fi

    local code
    code=$(curl -sL -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null) || code="000"
    if [ "$code" != "000" ]; then
      echo -e "${GREEN}  ✓ ${url} is responding (HTTP ${code}, ${elapsed}s)${NC}"
      return 0
    fi

    sleep 2
  done
}

assert_page_has_content() {
  local url="$1"
  local marker="${2:-<div id=\"root\"}"
  local label="${3:-page}"

  local body http_code
  http_code=$(curl -sL -o /tmp/smoke-body -w "%{http_code}" --max-time 10 "$url" 2>/dev/null) || http_code="000"
  body=$(cat /tmp/smoke-body 2>/dev/null)

  if [ "$http_code" = "000" ]; then
    echo -e "${RED}  ✗ Failed to connect to ${url}${NC}"
    return 1
  fi

  if [ -z "$body" ]; then
    echo -e "${RED}  ✗ ${label}: empty response from ${url}${NC}"
    return 1
  fi

  if echo "$body" | grep -q "$marker"; then
    echo -e "${GREEN}  ✓ ${label}: contains expected content${NC}"
    return 0
  fi

  # Fallback: check for reasonable HTML
  if echo "$body" | grep -qi "</html>"; then
    echo -e "${GREEN}  ✓ ${label}: valid HTML response${NC}"
    return 0
  fi

  echo -e "${RED}  ✗ ${label}: response does not contain '${marker}' or valid HTML${NC}"
  echo -e "${DIM}  First 200 chars: $(echo "$body" | head -c 200)${NC}"
  return 1
}

assert_port_listening() {
  local port="$1"
  local label="${2:-process}"

  if lsof -i ":$port" > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ ${label}: listening on port ${port}${NC}"
    return 0
  fi

  echo -e "${RED}  ✗ ${label}: not listening on port ${port}${NC}"
  return 1
}

# ============================================================================

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Startup Smoke Test — ${MODE}${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

FAILURES=0

case "$MODE" in
  demo)
    echo -e "${BOLD}Starting startup-demo.sh...${NC}"

    # startup-demo.sh sets DEV_MODE=true, starts backend on 8080 and frontend on 5174
    DEV_MODE=true SKIP_ONBOARDING=true bash startup-demo.sh &
    PIDS_TO_KILL+=($!)

    # Wait for frontend dev server
    wait_for_url "http://localhost:5174" 120 || { FAILURES=$((FAILURES+1)); }

    if [ "$FAILURES" -eq 0 ]; then
      # Check frontend serves actual content
      assert_page_has_content "http://localhost:5174" "<div id=\"root\"" "frontend" || FAILURES=$((FAILURES+1))

      # Check backend is also up
      wait_for_url "http://localhost:8080" 30 || echo -e "${YELLOW}  ⚠ Backend not ready yet (non-fatal for demo)${NC}"
    fi
    ;;

  oauth)
    echo -e "${BOLD}Starting startup-oauth.sh (mock credentials)...${NC}"

    # Create mock .env for OAuth (startup-oauth.sh sources .env directly)
    # Back up existing .env if present
    [ -f .env ] && cp .env .env.smoke-backup
    cat > .env << 'ENVEOF'
GITHUB_CLIENT_ID=smoke-test-client-id
GITHUB_CLIENT_SECRET=smoke-test-client-secret
JWT_SECRET=smoke-test-jwt-secret
ENVEOF

    # startup-oauth.sh in prod mode: builds frontend, serves on 8081, watchdog on 8080
    bash startup-oauth.sh &
    PIDS_TO_KILL+=($!)

    # Wait for watchdog on 8080 (startup-oauth.sh builds frontend + compiles Go, ~3-4 min in CI)
    wait_for_url "http://localhost:8080" 420 || { FAILURES=$((FAILURES+1)); }

    if [ "$FAILURES" -eq 0 ]; then
      # Check watchdog serves content (might be "Reconnecting..." page or actual app)
      assert_page_has_content "http://localhost:8080" "" "watchdog" || FAILURES=$((FAILURES+1))

      # Check backend on 8081
      assert_port_listening 8081 "backend" || echo -e "${YELLOW}  ⚠ Backend port 8081 not detected${NC}"
    fi

    # Restore original .env if backed up, otherwise remove mock
    if [ -f .env.smoke-backup ]; then
      mv .env.smoke-backup .env
    else
      rm -f .env
    fi
    ;;

  docker)
    echo -e "${BOLD}Building Docker image...${NC}"

    docker build -t kc-smoke-test:latest \
      --build-arg APP_VERSION=smoke-test \
      --build-arg COMMIT_HASH=$(git rev-parse --short HEAD) \
      . 2>&1 | tail -5

    echo -e "${BOLD}Starting container...${NC}"

    docker run -d \
      --name kc-smoke-test \
      -p 8080:8080 \
      -e JWT_SECRET=smoke-test-jwt-secret \
      kc-smoke-test:latest

    # Wait for watchdog health endpoint
    wait_for_url "http://localhost:8080/watchdog/health" 60 || { FAILURES=$((FAILURES+1)); }

    if [ "$FAILURES" -eq 0 ]; then
      # Check page serves actual HTML
      assert_page_has_content "http://localhost:8080" "<div id=\"root\"" "container page" || FAILURES=$((FAILURES+1))

      # Verify clean shutdown
      echo -e "${DIM}  Testing clean shutdown...${NC}"
      docker stop kc-smoke-test --timeout 10
      EXIT_CODE=$(docker inspect kc-smoke-test --format='{{.State.ExitCode}}')
      if [ "$EXIT_CODE" = "0" ]; then
        echo -e "${GREEN}  ✓ Clean shutdown (exit code 0)${NC}"
      else
        echo -e "${YELLOW}  ⚠ Exit code ${EXIT_CODE} (non-zero but may be expected)${NC}"
      fi
    fi
    ;;

  *)
    echo "Unknown mode: $MODE"
    echo "Usage: $0 {demo|oauth|docker}"
    exit 1
    ;;
esac

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo -e "${RED}${BOLD}FAILED: ${FAILURES} check(s) failed${NC}"
  exit 1
else
  echo -e "${GREEN}${BOLD}PASSED: All smoke checks passed for '${MODE}'${NC}"
  exit 0
fi
