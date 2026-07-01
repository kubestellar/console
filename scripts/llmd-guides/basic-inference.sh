#!/usr/bin/env bash
# E2E test scaffold for the llm-d basic-inference guide.
# TODO: Implement full guide steps. Currently validates cluster prerequisites only.
set -euo pipefail

GUIDE_NAME="basic-inference"
LOG_FILE="scripts/llmd-guides/${GUIDE_NAME}.log"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG_FILE"; }

log "=== ${GUIDE_NAME} Guide E2E (scaffold) ==="

# Verify cluster access
if ! kubectl cluster-info &>/dev/null; then
  log "ERROR: kubectl cannot reach cluster"
  exit 1
fi
log "Cluster access OK"

# Verify OpenShift
if ! oc whoami &>/dev/null; then
  log "ERROR: oc not authenticated"
  exit 1
fi
log "OpenShift access OK"

log "=== ${GUIDE_NAME} Guide E2E PASSED (scaffold only) ==="
exit 0
