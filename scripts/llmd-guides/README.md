# llm-d Guide E2E Scripts

Each script in this directory corresponds to one llm-d guide and is executed
nightly by `.github/workflows/nightly-llmd-guides.yml` on OpenShift runners.

## Adding a new guide

1. Create `<guide-name>.sh` matching one of the matrix entries in the workflow.
2. The script must exit 0 on success, non-zero on failure.
3. Logs can be written to `scripts/llmd-guides/<guide-name>.log` — they are
   uploaded as artifacts automatically.
4. The runner has `oc` and `kubectl` pre-configured with cluster access.

## Guides

| Script | Guide | Status |
|--------|-------|--------|
| `workload-variant-autoscaler.sh` | WVA quickstart | Active |
| `basic-inference.sh` | Basic vLLM inference | Scaffold |
| `multi-model.sh` | Multi-model serving | Scaffold |
| `gateway.sh` | Gateway configuration | Scaffold |
| `epp-config.sh` | EPP configuration | Scaffold |
| `autoscaler.sh` | Autoscaler setup | Scaffold |
| `model-mesh.sh` | ModelMesh serving | Scaffold |
| `custom-metrics.sh` | Custom metrics | Scaffold |
