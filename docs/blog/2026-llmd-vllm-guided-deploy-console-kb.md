---
title: "Running LLM-d on Kubernetes: Guided Multi-Cluster Deploy with P/D Disaggregation via KubeStellar Console KB"
date: 2026-06-17
authors:
  - kubestellar-team
tags:
  - llm-d
  - vllm
  - ai-ml
  - kubernetes
  - gpu
  - multi-cluster
  - platform-engineering
  - inference
draft: true
---

# Running LLM-d on Kubernetes
## Guided Multi-Cluster Deploy with P/D Disaggregation via KubeStellar Console KB

> **Draft** — ready for review. Related: #18746

Deploying large language model inference workloads on Kubernetes is hard. Deploying them across multiple clusters with production-grade features like Prefill/Decode disaggregation and intelligent scheduling is harder still. The **KubeStellar Console KB** now ships 9 guided LLM-d missions and 16 vLLM missions that turn this into a step-by-step interactive process.

---

## What Is LLM-d?

[LLM-d](https://github.com/llm-d/llm-d) is NVIDIA’s framework for distributed large language model serving on Kubernetes. It extends vLLM with:

- **Prefill/Decode (P/D) disaggregation** — separates the prefill and decode phases onto specialized worker pools, dramatically reducing inter-token latency for models with long input sequences
- **NIXL KV-cache transfer** — efficient KV-cache migration between prefill and decode workers using NVIDIA’s NIXL communication library
- **Load-aware inference scheduling** — routes requests based on real-time worker load and approximate prefix-cache state
- **Workload autoscaling** — horizontal pod autoscaling tuned for inference workload patterns

LLM-d is designed for production multi-GPU clusters running large models (70B–120B+ parameters) where latency SLOs matter.

---

## The Console KB LLM-d Mission Suite

KubeStellar Console KB ships 9 dedicated LLM-d install missions:

### 1. Prefill/Decode Disaggregation (`install-llmd-pd-disaggregation`)

The flagship mission. Deploys GPT-OSS-120B using vLLM with P/D disaggregation on 8×H200 GPUs:

- 4 prefill workers + 4 decode workers
- NIXL for KV-cache transfer between worker pools
- Reduces inter-token latency by 40–60% for long-context inputs
- Includes verification steps to confirm P/D routing is working

**When to use**: Production deployments of 70B+ models where time-to-first-token and inter-token latency are SLO-critical.

### 2. Intelligent Inference Scheduling (`install-llmd-inference-scheduling`)

The recommended out-of-the-box scheduling configuration for vLLM deployments using LLM-d. Defaults to 16 GPUs (8 replicas × 2 GPUs each) and supports:

- NVIDIA, AMD, Intel XPU, Intel Gaudi, TPU backends
- CPU-only mode for testing
- Load-aware routing
- Approximate prefix-cache-aware load balancing

### 3. Workload Autoscaling (`install-llmd-workload-autoscaling`)

Horizontal Pod Autoscaler configuration tuned for inference workloads. Scales on inference-specific metrics (queue depth, TTFT, tokens-per-second) rather than generic CPU/memory.

### 4. Tiered Prefix Cache (`install-llmd-tiered-prefix-cache`)

Deploys a three-tier KV-cache hierarchy (hot/warm/cold) to maximize cache hit rates for repeated or similar prompts. Critical for chatbot and RAG workloads with predictable prompt structures.

### 5. Simulated Accelerators (`install-llmd-simulated-accelerators`)

Deploys LLM-d with simulated GPU accelerators — useful for testing scheduling logic, autoscaling policies, and operational runbooks without needing physical GPUs.

### Additional Missions

- `install-llmd-benchmark` — LLM-d benchmark suite
- `install-llmd-precise-prefix-cache` — Precise prefix matching for deterministic cache behavior
- `install-llmd-predicted-latency` — Predicted-latency scheduling
- `install-llmd-wide-ep-lws` — Wide expert-parallelism LWS deployment

---

## vLLM Missions (16 Community-Sourced Fixes)

Beyond the LLM-d suite, console-kb has **16 vLLM-specific missions** sourced from real vLLM GitHub issues:

| Mission | Source Issue | What it fixes |
|---------|-------------|---------------|
| GGUF support | vLLM #1002 | Quantized GGUF model loading |
| MiniMax-01 model | vLLM #12073 | New model architecture support |
| Python 3.13 support | vLLM #12083 | Runtime compatibility |
| Jina embeddings v3 | vLLM #12154 | Embedding model support |
| Grammar support | vLLM #1229 | Structured generation |
| Qwen2.5-VL | vLLM #12486 | Vision-language model |
| OpenAI Responses API | vLLM #14721 | API compatibility |
| Gemma3 GGUF | vLLM #14753 | Google’s Gemma3 in GGUF format |
| vLLM on Mac Metal | vLLM #2081 | Apple Silicon support |
| ...and 7 more | | |

All missions are importable directly into KubeStellar Console.

---

## Multi-Cluster LLM Inference with KubeStellar

KubeStellar’s multi-cluster architecture makes LLM-d even more powerful:

**Cross-cluster inference routing**: Deploy prefill workers in a high-memory cluster (H200) and decode workers in a cost-optimized cluster with consumer GPUs. KubeStellar’s BindingPolicy distributes workloads across clusters based on hardware availability.

**GPU fleet visibility**: The console’s **Volcano status card** shows GPU queue utilization across all clusters. The **DCGM metrics** card surfaces per-GPU memory, temperature, and utilization. You can see where capacity exists before scheduling a large model deploy.

**Workload placement**: The `install-llmd-inference-scheduling` mission supports multiple hardware backends — match the right model size to the right GPU tier across your fleet.

---

## Getting Started

**Import a mission directly:**
```
console.kubestellar.io/missions/install-llmd-pd-disaggregation
```

**Browse all LLM-d missions:**
```
console.kubestellar.io/kb?category=llm-d
```

**Try the console in demo mode (no cluster needed):**
```bash
git clone https://github.com/kubestellar/console
cd console && ./start-dev.sh
# Open http://localhost:5174
```

---

## What’s Next

The console-kb LLM-d missions are scaffolded from the LLM-d documentation and best practices. As LLM-d evolves (the project is actively developed by NVIDIA), we’ll update missions to track new capabilities. If you’re an LLM-d contributor or user and want to add or improve a mission, contributions are welcome at [kubestellar/console-kb](https://github.com/kubestellar/console-kb).

---

*This post is a draft. Intended publish targets: KubeStellar blog, CNCF blog, r/LocalLLM, r/MachineLearning, r/kubernetes, Hacker News, LLM-d community channels.*
