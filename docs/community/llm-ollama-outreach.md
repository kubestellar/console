# LLM-d, vLLM, and Ollama Community Outreach

> Engaging the AI/ML inference community with guided Kubernetes deployment missions.

## LLM-d + vLLM Community (Issue #18746)

### Context
The console ships 9 LLM-d guided missions and a vLLM operator card. The AI inference community (vLLM 35k★, LLM-d growing) needs multi-cluster GPU scheduling observability — exactly what the console provides.

### Existing Console Assets
- **LLM-d Stack Discovery** (`useStackDiscovery` hook) — detects LLM-d deployments
- **GPU Cards** — GPU utilization, scheduling, and reservation across clusters
- **Stellar AI Provider** — routes to vLLM/Ollama endpoints

### Engagement Plan

| Action | Channel | Timeline |
|--------|---------|----------|
| Post vLLM card demo video | vLLM GitHub Discussions | Week 1 |
| Create "Deploy vLLM on K8s" mission in console-kb | PR to console-kb | Week 2 |
| Blog: "Multi-Cluster GPU Inference Observability" | dev.to / Medium | Week 3 |
| Contribute vLLM K8s operator observability guide | vLLM docs | Week 4 |

### Mission Proposals for console-kb

1. `llm-d/deploy-vllm-operator.yaml` — Install vLLM operator on K8s
2. `llm-d/multi-gpu-scheduling.yaml` — Configure multi-node GPU scheduling
3. `llm-d/model-serving-health.yaml` — Monitor model serving endpoints
4. `llm-d/autoscale-inference.yaml` — Set up HPA for inference pods
5. `llm-d/cost-optimization.yaml` — Right-size GPU allocations

---

## Ollama Community (Issues #18754, #18815)

### Context
Ollama (80k+ ★) is the most popular local LLM runtime. Users deploying Ollama on Kubernetes need:
- Installation guidance (StatefulSet, PVC, GPU scheduling)
- Health monitoring across clusters
- Model management (pull, serve, version)

### Console Integration
The Stellar provider system already supports Ollama (`providers.NewOllama(baseURL)`). The console validates Ollama connections are localhost-only (SSRF prevention via `stellarOllamaAllowedCIDRsEnv`).

### Guided Missions for console-kb

#### Mission 1: Deploy Ollama on Kubernetes
```yaml
apiVersion: kc-mission-v1
kind: Mission
metadata:
  name: deploy-ollama-kubernetes
spec:
  description: "Deploy Ollama as a StatefulSet with GPU access and persistent model storage"
  difficulty: intermediate
  tags: ["ollama", "gpu", "inference", "ai"]
  steps:
    - title: "Create namespace and PVC"
      tool: kubectl
    - title: "Deploy Ollama StatefulSet with GPU limits"
      tool: kubectl
    - title: "Expose Ollama service (ClusterIP)"
      tool: kubectl
    - title: "Pull a model"
      tool: kubectl-exec
    - title: "Verify health endpoint"
      tool: curl
```

#### Mission 2: Multi-Cluster Ollama Fleet
```yaml
apiVersion: kc-mission-v1
kind: Mission
metadata:
  name: ollama-multi-cluster-fleet
spec:
  description: "Deploy and monitor Ollama across multiple clusters with model sync"
  difficulty: advanced
  tags: ["ollama", "multi-cluster", "fleet"]
```

### Community Engagement

| Action | Channel | Timeline |
|--------|---------|----------|
| "Deploy Ollama on K8s" mission → console-kb | GitHub PR | Week 1 |
| Post in r/ollama: "Manage Ollama fleet" | Reddit | Week 2 |
| Ollama Discord: share multi-cluster demo | Discord | Week 2 |
| Blog: "From Local to Fleet: Ollama on K8s" | Medium | Week 3 |
| YouTube: 5-min demo video | KubeStellar channel | Week 4 |

## Success Metrics

| Metric | Target (90 days) |
|--------|-----------------|
| console-kb missions created | 7 (5 LLM-d + 2 Ollama) |
| Community post impressions | 5,000+ |
| GitHub stars from AI community | +30 |
| Mission completions (analytics) | 50+ |

## Related

- [Stellar Providers](../../pkg/api/handlers/stellar/providers.go) — Ollama integration
- [GPU Cards](../../web/src/components/cards/) — GPU monitoring
- [Stack Discovery](../../web/src/hooks/useStackDiscovery.ts) — LLM-d detection
