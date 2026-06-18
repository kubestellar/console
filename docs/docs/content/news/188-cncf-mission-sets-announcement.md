# 188 Guided Runbooks for the CNCF Ecosystem: KubeStellar Console's Mission Library

*June 2026*

The KubeStellar Console team is excited to announce a major milestone: **188 CNCF project mission sets** are now available in the [console-kb](https://github.com/kubestellar/console-kb) repository.

This is, by far, the most comprehensive library of **AI-powered Kubernetes operational runbooks** available in any open-source project.

---

## What Are Mission Sets?

Each mission set is a collection of guided, end-to-end workflows for a specific CNCF or open-source project. A mission set typically includes:

- **Install missions** — step-by-step deployment with pre-flight validation, configuration, and verification
- **Fix missions** — diagnose and repair common issues (pod crashes, network problems, resource exhaustion)
- **Upgrade missions** — safely upgrade to new versions with rollback capability
- **Drift detection** — compare actual cluster state against desired configuration and fix deviations
- **Security audits** — scan for misconfigurations, policy violations, and CVE exposure

Mission sets are **not documentation**. They are executable workflows — the console runs them live against your clusters, streams progress, and verifies outcomes.

---

## Coverage Across the CNCF Landscape

The 188 mission sets span the full breadth of the CNCF ecosystem:

| Category | Example Projects | Mission Count |
|----------|-----------------|---------------|
| **Networking** | Cilium, Istio, Linkerd, Calico, Submariner, MetalLB | 24 |
| **Storage** | Rook, Longhorn, OpenEBS, Velero, MinIO | 18 |
| **Security** | Falco, OPA, Kyverno, Notary, cert-manager, Trivy | 22 |
| **Observability** | Prometheus, Grafana, OpenTelemetry, Jaeger, Fluentd, Thanos | 26 |
| **CI/CD & GitOps** | ArgoCD, Flux, Tekton, Jenkins X, Spinnaker | 19 |
| **Service Mesh** | Istio, Linkerd, Consul, Open Service Mesh | 15 |
| **Serverless** | Knative, OpenFaaS, Fission, KEDA | 12 |
| **ML/AI** | Kubeflow, KServe, Seldon, BentoML | 11 |
| **Multi-cluster** | KubeStellar, Open Cluster Management, Submariner | 13 |
| **Other** | etcd, Helm, kustomize, Crossplane, Dapr, KubeVirt, and 100+ more | 38 |

Every mission is written to be **cluster-agnostic** — they work on EKS, GKE, AKS, OpenShift, kind, k3s, or any conformant Kubernetes distribution.

---

## Why This Matters for the CNCF Ecosystem

CNCF projects are extraordinarily powerful, but their operational complexity is a major barrier to adoption. The number one question we hear from platform teams is:

> "How do I actually **run** this in production?"

Documentation answers part of that question. But guided missions go further:

1. **Pre-flight validation** — before installing anything, the console checks if your cluster meets the requirements (Kubernetes version, available CRDs, RBAC, storage classes, network policies)
2. **Live execution** — stream logs and status as the work happens, so you can see exactly what the mission is doing
3. **Verification** — confirm the outcome by checking actual cluster state, not assumptions
4. **Rollback** — uninstall or revert changes if something goes wrong

Missions reduce the time-to-value for CNCF projects from **days** (reading docs, trial-and-error, Slack questions) to **minutes** (click, configure, run).

---

## Community Contributions Welcome

The 188 mission sets are maintained by the KubeStellar community, but we are actively seeking contributions from **upstream project maintainers** and **end users** who have operational expertise.

If you maintain a CNCF project or have battle-tested runbooks for a project in your production clusters, we would love to collaborate on turning those into mission sets.

### How to Contribute

1. Fork [console-kb](https://github.com/kubestellar/console-kb)
2. Add your mission set to the `runbooks/` directory (see [existing missions](https://github.com/kubestellar/console-kb/tree/main/runbooks) for examples)
3. Open a pull request with a clear description of what the mission does
4. The KubeStellar team will review, test, and merge

Mission contributions are credited to the author and linked to the upstream project. If your mission set is adopted by the upstream project, we will list it as an **endorsed mission** in the console.

---

## Upstream Project Endorsements

Several CNCF projects have already reviewed and endorsed their mission sets:

- **Submariner** — endorsed in [submariner-io/submariner#3907](https://github.com/submariner-io/submariner/issues/3907)
- **OpenCost** — endorsed by OpenCost maintainers
- **KitOps** — endorsed by KitOps maintainers
- **Cadence** — endorsed by Cadence maintainers
- **Microcks** — endorsed by Microcks maintainers

If you are a maintainer of a CNCF project and want to review your mission set, please open an issue in [kubestellar/console-kb](https://github.com/kubestellar/console-kb/issues).

---

## Try It Now

The mission library is available in the latest version of KubeStellar Console:

1. **Self-hosted**: [Install the console](https://github.com/kubestellar/console#local-install-self-host) and navigate to **Missions**
2. **Demo mode**: Visit [console.kubestellar.io/missions](https://console.kubestellar.io/missions) to browse all 188 mission sets (demo data only)

---

## Sharing with CNCF Project Communities

We are rolling out announcements to individual CNCF project communities over the coming weeks. If you are active in the ArgoCD, Flux, Prometheus, Istio, or any other CNCF project Slack channel, you may see a post about the mission sets specific to that project.

Example posts:

- **#argo-cd** on CNCF Slack: "KubeStellar Console now ships 8 guided missions for ArgoCD — install, sync, rollback, and troubleshoot common issues. Check them out: [link]"
- **#prometheus** on CNCF Slack: "12 Prometheus missions now available in KubeStellar Console — deploy, configure, scrape validation, alert rule audits, and more. Full list: [link]"

---

## Next Steps

The mission library is growing. Our goal is to have **250+ mission sets** covering the entire CNCF landscape by the end of 2026.

If you want to contribute, collaborate, or just explore the library, here are the links:

- [console-kb on GitHub](https://github.com/kubestellar/console-kb)
- [Mission catalog browser](https://console.kubestellar.io/missions)
- [Community Slack](https://kubestellar.io/slack)

---

## Get Involved

- **Try the missions** — [console.kubestellar.io/missions](https://console.kubestellar.io/missions)
- **Contribute a mission** — [console-kb repository](https://github.com/kubestellar/console-kb)
- **Join the community** — [KubeStellar Slack](https://kubestellar.io/slack)

Thank you to the 20+ contributors who have helped build this library. This is just the beginning.
