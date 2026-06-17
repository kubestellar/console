---
slug: kubestellar-argocd-partnership-multi-cluster-gitops
title: "Multi-cluster GitOps observability: KubeStellar + ArgoCD partnership"
description: "Joint initiative between KubeStellar and the Argo Project to showcase multi-cluster GitOps deployments and application health tracking across distributed Kubernetes infrastructure."
date: 2026-06-17
authors: ["kubestellar-team", "argo-community"]
tags: ["argocd", "gitops", "multi-cluster", "partnership", "integration", "observability"]
---

# Multi-cluster GitOps observability: KubeStellar + ArgoCD

KubeStellar Console and Argo CD are natural partners in modern multi-cluster Kubernetes deployments. This joint initiative showcases how the two projects complement each other to provide a unified observability and GitOps experience across distributed clusters.

## The Partnership

The Argo Project and KubeStellar communities have joined forces to:

1. **Surface ArgoCD health and status** at a glance across all KubeStellar-managed clusters
2. **Showcase ArgoCD Applications and ApplicationSets** in a purpose-built dashboard
3. **Enable guided multi-cluster GitOps workflows** via KubeStellar missions
4. **Cross-link documentation** to help users adopt both technologies together

## What You Get

### 1. Unified Multi-Cluster GitOps Dashboard

KubeStellar Console includes four dedicated ArgoCD cards on its primary dashboard:
- **ArgoCD Applications** — View application status across all clusters
- **ArgoCD ApplicationSets** — Monitor multi-cluster application templates
- **ArgoCD Health** — Real-time health metrics and sync status
- **ArgoCD SyncStatus** — Application sync compliance at a glance

These cards automatically aggregate ArgoCD state from all KubeStellar-managed clusters, eliminating the need to log into each cluster individually.

### 2. Quick-Start Mission

The console includes a guided installation mission for ArgoCD, automating:
- Helm chart deployment
- RBAC configuration for KubeStellar workspaces
- Namespace and secret setup
- Integration with the KubeStellar platform

### 3. Shared Documentation

- [KubeStellar Console — ArgoCD Integration Guide](../community/partners/argocd.md)
- [Argo Project — KubeStellar Ecosystem](https://argoproj.github.io) (cross-linked)
- Scale testing results: [GitOpsCon 2023 — Argo Scalability Study](https://www.youtube.com/embed/PB3OTXDjFjg)

## Why This Matters

**GitOps at scale** is essential for modern platforms:
- **Single pane of glass** — Monitor all applications and clusters from one dashboard
- **Event-driven deployment** — Leverage ArgoCD's declarative reconciliation across multiple clusters
- **Compliance and auditing** — KubeStellar's platform ensures consistent policy enforcement

Together, KubeStellar and Argo CD provide enterprise teams with:
- Reduced operational overhead
- Faster time-to-value for new clusters
- Improved disaster recovery and failover
- Native CNCF ecosystem integration

## Getting Started

1. **Install KubeStellar Console** — [Quickstart Guide](../console/getting-started.md)
2. **Launch the ArgoCD Mission** — Use the console's guided setup wizard
3. **Add your clusters** — Configure KubeStellar locations pointing to your infrastructure
4. **View unified status** — ArgoCD cards populate automatically

## Community

Join the conversation:
- **Argo Project Slack** — [#argo-cd](https://slack.cncf.io)
- **KubeStellar Discussions** — [GitHub Discussions](https://github.com/kubestellar/kubestellar/discussions)
- **Community Calls** — Monthly demos and Q&A

## Learn More

- [Full ArgoCD Integration Documentation](../community/partners/argocd.md)
- [KubeStellar Architecture](../kubestellar/README.md)
- [ArgoCD Operator Manual](https://argo-cd.readthedocs.io)

---

*This partnership reflects both projects' commitment to CNCF ecosystem interoperability and enterprise Kubernetes operations at scale.*
