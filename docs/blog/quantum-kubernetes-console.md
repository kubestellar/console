# From Qubits to Clusters: The World’s First Quantum-Aware Kubernetes Console

> *Draft for CNCF blog, IBM Quantum Network newsletter, dev.to, and kubestellar.io — see issue #18944*

---

**We didn’t set out to build a quantum computing dashboard. But when the Kubernetes control plane becomes the standard substrate for all compute — classical and quantum — it turns out that’s exactly what’s needed.**

KubeStellar Console is an open-source, AI-powered multi-cluster Kubernetes dashboard. It ships 313 cards covering the CNCF ecosystem. One of those cards connects to IBM Quantum hardware.

This is the story of how Kubernetes became a control plane for quantum workloads, and why that matters to platform engineers today.

---

## The Quantum Computing Infrastructure Problem

Research teams and enterprises running quantum workloads face an infrastructure management challenge that looks surprisingly familiar: heterogeneous backends, unpredictable job queues, noisy results that require post-processing, and a growing number of quantum hardware providers with incompatible APIs.

In 2025, a pattern emerged: teams started containerizing their quantum job submission workflows and running them on Kubernetes. The reasons are the same reasons teams containerized everything else:
- Reproducible environments
- Dependency isolation between quantum SDK versions
- Declarative scheduling and resource management
- GitOps-driven experiment tracking

The [quantum-kc-demo](https://github.com/kubestellar) project built the bridge: a Kubernetes workload that proxies IBM Quantum job submission, manages authentication tokens, and exposes quantum backend status as Kubernetes-native metrics. KubeStellar Console ships a card that visualizes it.

---

## What the Quantum Card Shows

The console’s quantum integration (`quantum-kc-demo` v0.4.0+) surfaces four views:

### 1. Quantum System Status

The `QuantumStatus` card shows the real-time state of the quantum backend connection: authentication health, backend availability, current qubit count, and error rates. It polls at a configurable interval (default 8s, tunable from 2–30s) so operators can balance freshness vs. API quota.

### 2. Qubit Grid

The `QuantumQubitGrid` renders a visual map of qubit connectivity and gate error rates for the connected IBM Quantum backend. Platform engineers can see at a glance which qubits are healthy, which are noisy, and which should be avoided when transpiling circuits for this specific backend.

This matters: qubit quality varies not just between IBM machines but over time on the same machine as calibration drifts. A live qubit grid in your cluster dashboard means your research team knows before they submit a job whether today’s calibration is suitable for their circuit.

### 3. QASM Circuit Viewer

The `QuantumCircuitViewer` renders the ASCII representation of the last-submitted QASM (Quantum Assembly Language) circuit. This is useful for debugging: when a quantum job fails, the first question is always “what circuit was actually submitted?” Having it visible in the same console as the Kubernetes pod logs for the job submission container closes a significant observability gap.

### 4. Histogram Card

The `QuantumHistogramCard` shows the result distribution from the most recent completed quantum circuit execution. This is the fundamental output of quantum computation — a probability distribution over bitstring outcomes. Seeing it alongside classical workload metrics in the same dashboard is genuinely new.

---

## Why This Is a Kubernetes Story, Not Just a Quantum Story

The quantum card works the same way as any other KubeStellar Console card:

1. A Go API handler (`/api/quantum/status`, `/api/quantum/qubits/simple`, `/api/quantum/qasm/circuit/ascii`) fetches data from the quantum-kc-demo workload running in the cluster
2. A TypeScript cache hook (`useCachedQuantum`) stores results in IndexedDB for instant display on revisit
3. A React component renders the visualization with full demo-mode fallback (so you can explore the UI without quantum hardware)

The quantum workload is just another Kubernetes deployment. It has health checks. It can be monitored with the same tools as a web server. Its logs flow to the same observability pipeline. KubeStellar Console treats it that way — and that’s the point.

**Kubernetes is becoming the universal control plane for compute.** Classical, edge, GPU, and now quantum. The platform engineering tools that will win are the ones that make this heterogeneous compute fabric manageable from a single interface.

---

## Getting Started

**Try the demo now** (no installation required):

→ [console.kubestellar.io](https://console.kubestellar.io) — navigate to the Quantum section in demo mode

**Run it in your cluster:**

```bash
# Deploy quantum-kc-demo to your cluster
kubectl apply -f https://raw.githubusercontent.com/kubestellar/quantum-kc-demo/main/deploy/kc-demo.yaml

# Start KubeStellar Console
curl -sSL https://get.kubestellar.io/console | bash
```

The quantum card will appear in your dashboard once `quantum-kc-demo` is running and your IBM Quantum credentials are configured in the workload’s secret.

---

## The Broader Vision

KubeStellar Console ships 313 cards today. They cover ArgoCD, Flux, Prometheus, Jaeger, KEDA, Harbor, Falco, Kyverno, OPA/Gatekeeper, Crossplane, Dapr, WasmCloud, Knative, Trivy, Kubescape, Inspektor Gadget, vCluster — and quantum computing.

Every new category of compute that runs on Kubernetes becomes a new card. That’s the thesis: not a specialized dashboard for each tool, but a composable, AI-assisted control plane for everything.

If you’re running quantum workloads on Kubernetes, we’d love to hear from you. Open an issue, join [CNCF Slack #kubestellar](https://slack.cncf.io/), or add your organization to [ADOPTERS.md](../../ADOPTERS.md).

---

## References

- [KubeStellar Console](https://github.com/kubestellar/console)
- [quantum-kc-demo workload](https://github.com/kubestellar)
- [IBM Quantum Network](https://quantum.ibm.com/)
- [Qiskit — IBM’s open-source quantum SDK](https://qiskit.org/)
- [CNCF #kubestellar Slack](https://slack.cncf.io/)

---

*Written by the KubeStellar Console community · June 2026*  
*[Submit corrections or improvements via PR](https://github.com/kubestellar/console/pulls)*
