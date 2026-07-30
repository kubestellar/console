#!/usr/bin/env bash
# run-fullstack-e2e.sh — Run fullstack E2E tests locally against the Go backend.
#
# Mirrors .github/workflows/fullstack-e2e.yml so developers can run the same
# smoke tests without pushing to CI (fixes kubestellar/console#10688).
#
# Usage:
#   bash scripts/run-fullstack-e2e.sh
#   # or via npm:
#   cd web && npm run test:e2e:fullstack

set -euo pipefail

# ── Named constants (no magic numbers per CLAUDE.md) ─────────────────────────
readonly BACKEND_PORT=8080
readonly HEALTH_TIMEOUT_S=60
readonly HEALTH_POLL_INTERVAL_S=1
readonly DEV_JWT_SECRET='local-fullstack-e2e-jwt-secret-placeholder-not-a-real-key'

# ── Repo root ────────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
readonly REPO_ROOT
readonly BINARY_PATH="${REPO_ROOT}/console-binary-e2e"
readonly LOG_PATH="${REPO_ROOT}/console-e2e.log"

BACKEND_PID=""

# ── Cleanup on exit / error ──────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "── cleanup ──"
  if [ -n "${BACKEND_PID}" ] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    echo "Stopping backend (PID ${BACKEND_PID})…"
    kill "${BACKEND_PID}" || true
    wait "${BACKEND_PID}" 2>/dev/null || true
  fi
  if [ -f "${BINARY_PATH}" ]; then
    rm -f "${BINARY_PATH}"
    echo "Removed ${BINARY_PATH}"
  fi
  if [ -f "${LOG_PATH}" ]; then
    echo "Backend log kept at ${LOG_PATH}"
  fi
}
trap cleanup EXIT

# ── Step 1: Build Go backend ────────────────────────────────────────────────
echo "── Building Go backend ──"
cd "${REPO_ROOT}"
go build -o "${BINARY_PATH}" ./cmd/console

# ── Step 2: Build frontend ──────────────────────────────────────────────────
echo "── Building frontend ──"
cd "${REPO_ROOT}/web"
npm run build

# ── Step 3: Start Go backend ────────────────────────────────────────────────
echo "── Starting backend on port ${BACKEND_PORT} ──"
cd "${REPO_ROOT}"
JWT_SECRET="${DEV_JWT_SECRET}" PORT="${BACKEND_PORT}" "${BINARY_PATH}" > "${LOG_PATH}" 2>&1 &
BACKEND_PID=$!
echo "Backend PID: ${BACKEND_PID}"

# ── Step 4: Wait for /healthz ────────────────────────────────────────────────
echo "── Waiting for /healthz (up to ${HEALTH_TIMEOUT_S}s) ──"
for i in $(seq 1 "${HEALTH_TIMEOUT_S}"); do
  if curl -sf "http://localhost:${BACKEND_PORT}/healthz" > /dev/null 2>&1; then
    echo "Backend healthy after ${i}s"
    break
  fi
  if [ "${i}" -eq "${HEALTH_TIMEOUT_S}" ]; then
    echo "ERROR: Backend did not become healthy in ${HEALTH_TIMEOUT_S}s"
    echo "── console-e2e.log ──"
    cat "${LOG_PATH}" || true
    exit 1
  fi
  sleep "${HEALTH_POLL_INTERVAL_S}"
done

# ── Step 5: Run fullstack E2E specs ─────────────────────────────────────────
echo "── Running fullstack E2E tests ──"
cd "${REPO_ROOT}/web"
FULLSTACK_SMOKE=1 \
PLAYWRIGHT_BASE_URL="http://localhost:${BACKEND_PORT}" \
  npx playwright test \
    e2e/fullstack-smoke.spec.ts \
    e2e/mission-integration.spec.ts \
    --project=chromium

echo "── All fullstack E2E tests passed ──"
