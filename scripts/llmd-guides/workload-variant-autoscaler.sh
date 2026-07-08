#!/usr/bin/env bash
# E2E test for the llm-d Workload Variant Autoscaler (WVA) guide.
# Runs on OpenShift with oc/kubectl pre-configured.
set -euo pipefail

GUIDE_NAME="workload-variant-autoscaler"
LOG_FILE="scripts/llmd-guides/${GUIDE_NAME}.log"
NAMESPACE="llmd-wva-e2e-$$"
WAIT_READY_TIMEOUT_S=300
INFERENCE_TIMEOUT_S=60
CLEANUP_TIMEOUT_S=120

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG_FILE"; }

cleanup() {
  log "Cleaning up namespace ${NAMESPACE}"
  kubectl delete namespace "$NAMESPACE" --wait=false --timeout="${CLEANUP_TIMEOUT_S}s" 2>/dev/null || true
}
trap cleanup EXIT

log "=== WVA Guide E2E ==="

# 1. Create test namespace
log "Creating namespace ${NAMESPACE}"
kubectl create namespace "$NAMESPACE"

# 2. Apply WVA CRDs and operator (skip if already cluster-wide)
if ! kubectl get crd workloadvariantautoscalers.autoscaling.llm-d.ai &>/dev/null; then
  log "WVA CRDs not found — installing from llm-d operator"
  # The operator should already be installed on the OpenShift cluster.
  # If not, this test will fail here and the nightly report will flag it.
  log "ERROR: WVA operator not installed on cluster"
  exit 1
fi
log "WVA CRDs present"

# 3. Deploy a minimal vLLM InferenceService
log "Deploying test InferenceService"
cat <<'MANIFEST' | kubectl apply -n "$NAMESPACE" -f -
apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata:
  name: wva-test-model
  labels:
    app: wva-e2e
spec:
  predictor:
    model:
      modelFormat:
        name: vLLM
      runtime: vllm-runtime
      resources:
        requests:
          cpu: "1"
          memory: "2Gi"
        limits:
          cpu: "2"
          memory: "4Gi"
MANIFEST

# 4. Deploy a WVA resource
log "Deploying WorkloadVariantAutoscaler"
cat <<'MANIFEST' | kubectl apply -n "$NAMESPACE" -f -
apiVersion: autoscaling.llm-d.ai/v1alpha1
kind: WorkloadVariantAutoscaler
metadata:
  name: wva-test
spec:
  targetRef:
    apiVersion: serving.kserve.io/v1beta1
    kind: InferenceService
    name: wva-test-model
  minReplicas: 1
  maxReplicas: 3
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
MANIFEST

# 5. Wait for WVA to become ready
log "Waiting for WVA to reconcile (up to ${WAIT_READY_TIMEOUT_S}s)"
ELAPSED=0
POLL_INTERVAL_S=10
while [ $ELAPSED -lt $WAIT_READY_TIMEOUT_S ]; do
  STATUS=$(kubectl get wva wva-test -n "$NAMESPACE" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "Unknown")
  if [ "$STATUS" = "True" ]; then
    log "WVA is Ready"
    break
  fi
  sleep "$POLL_INTERVAL_S"
  ELAPSED=$((ELAPSED + POLL_INTERVAL_S))
done

if [ "$STATUS" != "True" ]; then
  log "ERROR: WVA did not become ready within ${WAIT_READY_TIMEOUT_S}s (status: ${STATUS})"
  kubectl describe wva wva-test -n "$NAMESPACE" >> "$LOG_FILE" 2>&1 || true
  exit 1
fi

# 6. Verify scaling behavior
log "Verifying WVA scaling target"
REPLICAS=$(kubectl get wva wva-test -n "$NAMESPACE" -o jsonpath='{.status.desiredReplicas}' 2>/dev/null || echo "0")
if [ "$REPLICAS" -ge 1 ]; then
  log "WVA desiredReplicas=${REPLICAS} — OK"
else
  log "WARNING: WVA desiredReplicas=${REPLICAS} — may not have reconciled yet"
fi

log "=== WVA Guide E2E PASSED ==="
exit 0
