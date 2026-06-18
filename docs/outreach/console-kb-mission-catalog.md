# KubeStellar Console KB — Mission Catalog

> **Last updated**: June 2026  
> **Total missions**: 389+ across 8 categories  
> **Import any mission**: `https://console.kubestellar.io/kb`

The [KubeStellar Console KB](https://github.com/kubestellar/console-kb) is a community knowledge base of AI-powered missions for Kubernetes operations. Missions are interactive, step-by-step guided procedures that execute live `kubectl` commands with verification and rollback steps.

---

## Mission Categories

| Category | Count | What it covers |
|----------|-------|----------------|
| [CNCF Install](#cncf-install) | 201 | Guided install missions for CNCF projects |
| [CNCF Generated Fixes](#cncf-generated-fixes) | 188 | Fixes sourced from real CNCF project GitHub issues |
| [Platform Install](#platform-install) | 64 | AI/ML platforms, agent runtimes, storage, gaming |
| [LLM-d Inference](#llm-d-inference) | 9 | NVIDIA LLM-d guided deploy with P/D disaggregation |
| [Operational Runbooks](#operational-runbooks) | 10 | etcd, Velero, cert rotation, disaster recovery |
| [Security Fixes](#security-fixes) | 1+ | CVE guided remediations, network policy, workload operations |

**Total: 389+ missions** covering the full Kubernetes ecosystem.

---

## CNCF Install

201 guided install missions for CNCF projects. Highlights:

**Observability**: Alertmanager, OpenTelemetry (collector, operator), Cortex, Thanos  
**Networking**: Aeraki Mesh, APISIX, Calico, Cilium, CoreDNS, Contour  
**GitOps**: Argo CD, Argo Events, Argo Rollouts, Argo Workflows, Atlantis  
**Security**: Capsule, cert-manager, Confidential Containers, Copa  
**Data**: Artifact Hub, CubFS, NATS  
**Platforms**: Backstage, Carvel, CDK8s, Crossplane, Clusterpedia  
**AI/ML**: Claude Desktop (MCP integration), Container2Wasm  
...and 180+ more.

[Browse all →](https://console.kubestellar.io/kb?category=cncf-install)

---

## CNCF Generated Fixes

188 fix missions sourced from real open issues in CNCF project GitHub repos. Each mission addresses a specific bug or feature request that appeared in the project’s issue tracker.

**Covered projects** (partial list): Akri, Alertmanager, Antrea, APISIX, Argo, Argo Events, Argo Rollouts, Argo Workflows, Armada, Atlantis, Backstage, Bank Vaults, Buildpacks, Caddy, Cadence, Capsule, Cartography, CDK8s, cert-manager, Cilium, ClickHouse, Cloud Custodian, CloudEvents, Clusternet, Clusterpedia, Confidential Containers, Consul...

**AI inference**: vLLM (16 missions), LiteLLM (23 missions)

[Browse all →](https://console.kubestellar.io/kb?category=cncf-generated)

---

## Platform Install

64 guided install missions for platforms and tools beyond the CNCF catalog.

**AI/ML inference**:
- `install-ollama` — Ollama on Kubernetes (Kimi-K2.5, GLM-5, and other popular models)
- `install-kagenti` — Kagenti AI agent control plane (A2A + MCP protocols, LangGraph/CrewAI/AutoGen)

**Multi-cluster**:
- `install-k0rdent` — k0rdent Kubernetes cluster lifecycle manager

**Policy & security**:
- `install-cedar` — Cedar policy language from AWS
- `install-opa` — Open Policy Agent
- `install-in-toto` — Software supply chain security
- `install-oscal-compass` — OSCAL/NIST compliance tooling

**Networking**:
- `install-higress` — Cloud-native API gateway
- `install-kube-ovn` — Kubernetes OVN networking

**Data & storage**:
- `install-cloudnativepg` — PostgreSQL operator

**Developer platforms**:
- `install-openchoreo` — Internal developer platform
- `install-hexa` — Hexa policy orchestration

[Browse all →](https://console.kubestellar.io/kb?category=platform-install)

---

## LLM-d Inference

9 dedicated missions for NVIDIA’s LLM-d distributed inference framework.

| Mission | Hardware | What it deploys |
|---------|----------|----------------|
| `install-llmd-pd-disaggregation` | 8×H200 | GPT-OSS-120B with P/D disaggregation + NIXL |
| `install-llmd-inference-scheduling` | 16 GPUs | Load-aware + prefix-cache-aware scheduling |
| `install-llmd-workload-autoscaling` | Any | HPA tuned for inference workloads |
| `install-llmd-tiered-prefix-cache` | Any | Hot/warm/cold KV-cache hierarchy |
| `install-llmd-precise-prefix-cache` | Any | Deterministic prefix matching |
| `install-llmd-predicted-latency` | Any | Predicted-latency-aware scheduling |
| `install-llmd-benchmark` | Any | LLM-d benchmark suite |
| `install-llmd-simulated-accelerators` | CPU | Simulated GPU accelerators for testing |
| `install-llmd-wide-ep-lws` | Multi-GPU | Wide expert-parallelism LWS |

[Browse all →](https://console.kubestellar.io/kb?category=llm-d)

---

## Operational Runbooks

10 production-grade runbooks for critical Kubernetes operations. All are executable as interactive AI missions.

| Runbook | When to use |
|---------|------------|
| `disaster-recovery` | Full cluster failure and recovery |
| `restore-etcd-snapshot` | etcd data corruption or loss |
| `restore-velero-backup` | Application-level backup restore |
| `certificate-rotation` | TLS cert expiry or rotation event |
| `cluster-upgrade` | In-place Kubernetes version upgrade |
| `node-drain` | Safe node maintenance / decommission |
| `rbac-audit` | Security review of RBAC permissions |
| `rollback-kubestellar-controller` | KubeStellar controller rollback |
| `upgrade-kubestellar-controller` | KubeStellar controller upgrade |
| `install-kubestellar-controller` | First-time KubeStellar install |

[Browse all →](https://console.kubestellar.io/kb?category=runbooks)

---

## Security Fixes

| Mission | CVE | Severity | Fixed in |
|---------|-----|----------|----------|
| `cve-2026-3864-nfs-csi-path-traversal` | CVE-2026-3864 | CVSS 6.5 Medium | NFS CSI v4.13.1 |

New CVE missions are added as vulnerabilities are published for commonly deployed CNCF components.

[Browse all →](https://console.kubestellar.io/kb?category=security)

---

## Orbit Recurring Missions

Orbit missions are **scheduled, recurring** operational routines (not one-time fixes). They run weekly or on a cadence to maintain cluster health.

| Mission | Cadence | What it monitors |
|---------|---------|------------------|
| `orbit-health-check` | Weekly | Crash-looping pods, pending workloads, service endpoints |
| `orbit-version-drift` | Weekly | Outdated Helm charts, stale image tags |
| `orbit-cert-rotation` | Scheduled | TLS certificate rotation |
| `orbit-backup-verification` | Scheduled | Backup pipeline health |
| `orbit-resource-quota` | Scheduled | Quota utilization + impending exhaustion |

[Browse Orbit missions →](https://console.kubestellar.io/kb?category=orbit)

---

## Importing Missions

**In KubeStellar Console:**
1. Go to **AI Missions → Import**
2. Paste or upload the mission JSON
3. Run against any cluster in your fleet

**Direct URL import:**
```
https://console.kubestellar.io/missions/<mission-name>
```

**Clone the full catalog:**
```bash
git clone https://github.com/kubestellar/console-kb
```

---

## Contributing

New missions are welcome! See [CONTRIBUTING.md](https://github.com/kubestellar/console-kb/blob/main/CONTRIBUTING.md) for the submission format and guidelines.

Highest-value contribution areas:
- CVE guided remediations for CNCF storage/networking/security components
- New CNCF project install missions (many projects are missing from `cncf-install/`)
- Orbit recurring maintenance missions
- LLM/AI inference platform missions

---

*This catalog is maintained by the outreach agent and updated monthly. File an issue to request a new category or mission.*
