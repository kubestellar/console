---
title: "Managing AI/ML Workloads Across Multi-Cluster Kubernetes: Volcano + WasmCloud in the KubeStellar Console"
date: 2026-06-17
authors:
  - kubestellar-team
tags:
  - kubernetes
  - multi-cluster
  - ai-ml
  - volcano
  - wasmcloud
  - webassembly
  - gpu
  - edge
draft: true
---

# Managing AI/ML Workloads Across Multi-Cluster Kubernetes: Volcano + WasmCloud in the KubeStellar Console

> **Draft** — ready for review by maintainers. Related: #18693 (Volcano), #18694 (WasmCloud).

Running AI/ML training jobs and WebAssembly workloads across multiple Kubernetes clusters has historically required stitching together dashboards, CLIs, and custom scripts. The KubeStellar Console now ships purpose-built monitoring cards for two CNCF incubating projects that are reshaping cloud-native compute: **Volcano** (batch/HPC scheduling) and **WasmCloud** (WebAssembly distributed applications).

This post walks through what these integrations surface, why multi-cluster visibility matters for each, and how to get started.

---

## Why Multi-Cluster AI/ML Visibility Matters

Modern AI/ML infrastructure rarely lives on a single cluster. GPU-dense training clusters sit in colocation facilities or cloud regions; inference workloads fan out to edge nodes closer to users or sensors; staging environments mirror production configurations across availability zones. Without a unified view, platform engineers resort to running the same `kubectl` commands across dozens of contexts — or building custom tooling that becomes a maintenance burden.

KubeStellar was built to solve exactly this problem. Its console aggregates signals from every cluster in your fleet into a single, queryable UI. The Volcano and WasmCloud cards extend this to the highest-value workload types in 2026: GPU batch jobs and WebAssembly microservices.

---

## Volcano: GPU Batch Scheduling Visibility at Scale

[Volcano](https://volcano.sh) is a CNCF Incubating scheduler that extends Kubernetes with gang scheduling, fair-share queues, preemption, and per-job resource accounting. It is the de-facto choice for PyTorch distributed training, MPI jobs, Spark, and Flink on Kubernetes.

### What the Volcano card surfaces

The **Volcano Status** card in KubeStellar Console displays:

| Signal | Why it matters |
|--------|----------------|
| **Queue capacity and utilization** | Know at a glance whether your training queues are saturated or have headroom |
| **Job phase distribution** | See pending / running / completed / failed jobs without running `vcctl` |
| **Pod groups** | Identify gang-scheduling groups waiting for quorum |
| **Aggregate GPU allocation** | Track GPU utilization across the entire cluster fleet |

### Multi-cluster value

When you manage GPU clusters in multiple regions or clouds, the Volcano card gives you fleet-level visibility: which cluster has idle GPUs? Which queue is backed up? Which training run is stuck in `Pending` waiting for resources that will never arrive?

This is especially powerful combined with KubeStellar's **ClusterCosts** and **ClusterMetrics** cards — you can correlate GPU spend with training throughput across every cluster in your inventory.

### Roadmap: live data bridge

The Volcano card currently renders demo data. The next step is a live bridge at `/api/volcano/status` that queries the Volcano scheduler API on each managed cluster and aggregates the results. Contributions welcome — see [#18693](https://github.com/kubestellar/console/issues/18693).

---

## WasmCloud: WebAssembly Lattice Visibility

[WasmCloud](https://wasmcloud.com) is a CNCF Incubating project that enables distributed applications built from portable WebAssembly components. A WasmCloud lattice spans hosts across clouds, edges, and IoT devices — making it one of the most exciting platforms for truly location-agnostic compute.

### What the WasmCloud card surfaces

The **WasmCloud Status** card displays:

| Signal | Why it matters |
|--------|----------------|
| **Lattice ID and host count** | Confirm your lattice is healthy and all expected hosts are connected |
| **Actor count** | Monitor the number of running WebAssembly actors (components) |
| **Capability provider count** | Track infrastructure bindings (HTTP, key-value, message broker, etc.) |
| **Active link definitions** | See which actors are connected to which capability providers |

### Multi-cluster value

WasmCloud lattices naturally span multiple Kubernetes clusters and bare-metal hosts. The KubeStellar Console brings the same multi-cluster federation approach to WasmCloud: instead of checking each lattice in isolation, you can monitor your entire distributed WasmCloud deployment from one place.

For edge deployments — manufacturing floors, retail stores, telco edge nodes — this is transformative. You see every host in every location, all link definitions, and any actors that have gone dark.

### Roadmap: live data bridge

The WasmCloud card currently renders demo data via the `nats-surveyor` or `wasmcloud-control-interface`. The path to live data is a bridge at `/api/wasmcloud/status` connecting to a WasmCloud host or NATS server. Contributions and feedback welcome — see [#18694](https://github.com/kubestellar/console/issues/18694).

---

## Getting Started

Both cards ship in the current release of KubeStellar Console. To try them out:

```bash
# Start in demo mode — no cluster needed
git clone https://github.com/kubestellar/console
cd console
./start-dev.sh
# Open http://localhost:5174 — Volcano and WasmCloud cards appear on the dashboard
```

For production deployments:

```bash
helm install ks-console deploy/helm \
  --namespace kubestellar \
  --create-namespace
```

The cards will render demo data until a live bridge is available. Watch the issues linked above for progress.

---

## The Broader Picture: 300+ Ecosystem Cards

Volcano and WasmCloud join a growing library of **300+ ecosystem cards** in the KubeStellar Console, covering:

- **Security**: SPIFFE/SPIRE, OPA, Kyverno, Trestle, Trivy, TUF
- **GitOps**: Argo CD, Flux, Argo Rollouts
- **Observability**: Thanos, Prometheus, OpenTelemetry, Grafana
- **Data**: Strimzi (Kafka), TiKV, Vitess, Trino
- **Storage**: Rook/Ceph, Longhorn
- **AI/ML**: Volcano (GPU scheduling), DCGM (GPU metrics)
- **Service mesh**: Istio, Linkerd, Envoy
- **Multi-cluster**: KubeStellar, Karmada, OCM

Every card follows the same caching contract (IndexedDB/SQLite, stale-while-revalidate), the same demo fallback pattern, and the same i18n pipeline — making it easy to contribute new integrations.

---

## Contributing

Want to add live data to the Volcano or WasmCloud cards? Or contribute a new ecosystem card?

- **Live Volcano bridge**: [#18693](https://github.com/kubestellar/console/issues/18693)
- **Live WasmCloud bridge**: [#18694](https://github.com/kubestellar/console/issues/18694)
- **New card template**: follow the `createCachedHook` factory pattern in `lib/cache/createCachedHook.ts`
- **Join the community**: [kubestellar.io/community](https://kubestellar.io/community)

---

*The KubeStellar Console is an open-source project under the Apache 2.0 license. Contributions, feedback, and ecosystem partnerships are always welcome.*
