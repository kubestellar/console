# KubeStellar Console + Flux: GitOps Observability at Scale

> *Partner integration guide — see issue #18689*

KubeStellar Console ships a feature-complete Flux integration that surfaces the state of your GitOps stack — HelmReleases, Kustomizations, and GitRepositories — across every cluster in your kubeconfig, in a single browser tab.

---

## What You Get

The console's Flux integration covers three card surfaces:

| Card | What It Shows |
|------|--------------|
| **Flux Status** (`flux_status`) | Aggregated health of all Flux-managed resources across clusters: HelmRelease sync status, Kustomization reconciliation state, GitRepository fetch health, per-cluster error counts |
| **Kustomization Status** (`KustomizationStatus`) | Detailed view of every Kustomization object: last-applied revision, ready/not-ready state, source reference, reconcile interval |
| **GitOps Drift** (`GitOpsDrift`) | Detects and surfaces drift between the desired state in Git and the live cluster state |

All three cards use the console's cache-first architecture: data persists to SQLite WASM in a Web Worker, so revisiting a cluster tab shows instant data while a background refresh runs.

---

## Prerequisites

- Flux v2.x installed in one or more clusters (`flux check` passes)
- KubeStellar Console running locally (`./start.sh`) or self-hosted
- `kc-agent` running and connected to your kubeconfig

---

## Quick Start

### 1. Install the Console

```bash
curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash
```

This downloads a pre-built console binary and `kc-agent`, starts both, and opens `http://localhost:8080`. No cluster required for the initial evaluation — Flux demo data is built in.

### 2. Connect Your Cluster

`kc-agent` reads your `~/.kube/config` automatically. If your cluster is already in your kubeconfig:

```bash
kubectl config use-context <your-flux-cluster>
```

The console will discover it within seconds.

### 3. Add the Flux Cards to Your Dashboard

1. Open `http://localhost:8080`
2. Click **+ Add Card** in any dashboard
3. Search for "Flux" — you'll see **Flux Status**, **Kustomization Status**, and **GitOps Drift**
4. Add the cards you want; drag to rearrange

### 4. Multi-Cluster View

If you have multiple clusters with Flux installed, the console shows Flux state **across all clusters** simultaneously. Each card has a cluster selector that defaults to "All Clusters" — you can scope to a single cluster by clicking the cluster name.

---

## Demo Mode

Don't have a Flux cluster handy? Try the hosted demo at [console.kubestellar.io](https://console.kubestellar.io) — it runs on built-in demo data showing a realistic multi-cluster Flux setup with HelmReleases, Kustomizations, and some intentionally unhealthy resources for realism.

---

## What the Console Adds to a Flux Workflow

| Challenge | How the Console Helps |
|-----------|----------------------|
| Flux state is spread across `kubectl get hr -A` in N clusters | Single view across all clusters, no context switching |
| Debugging a failed HelmRelease requires `flux get hr` + `flux logs` | Card shows error message inline; one-click to pod logs drill-down |
| Drift detection is manual | GitOpsDrift card surfaces divergence automatically |
| Cross-cluster policy consistency | CrossClusterPolicyComparison card (works with Flux Kustomizations as policy delivery mechanism) |
| Sharing cluster health with non-kubectl users | Read-only console URL, no kubectl access required for observers |

---

## AI-Assisted Flux Troubleshooting

With `kc-agent` connected to an AI provider (Claude, OpenAI, or Gemini), you can ask the console's AI assistant about your Flux state:

```
"Why is the cert-manager HelmRelease failing on cluster prod-us-east?"
"What changed in the last 3 reconciliation cycles across all clusters?"
"Suggest a fix for the ImagePullBackOff in my flux-system namespace"
```

The AI reads live cluster state through `kc-agent` and answers with context-aware responses.

---

## Installing Flux with a Mission

The console ships an **install mission** for Flux that walks through the complete setup:

1. Prerequisites check (cluster version, RBAC)
2. Flux CLI install
3. `flux bootstrap` with your Git repository
4. Verification that all Flux controllers are running
5. First Kustomization deployment

To run the mission: navigate to **Missions** in the console sidebar, search "Flux", and click **Start Mission**.

---

## Architecture Notes for Flux Contributors

The Flux integration is implemented in `web/src/components/cards/flux_status/`:

```
flux_status/
├── index.tsx           # Card component
├── useFluxStatus.ts    # Data fetching hook (useCached pattern)
├── demoData.ts         # Demo data for hosted demo and offline use
└── __tests__/          # Unit tests
```

The hook uses the `useCache` factory with `category: 'default'` (30-second refresh interval). Data flows through `kc-agent` → Kubernetes API → `useFluxStatus` → card component.

**To extend the integration**: add a new card component in `kubestellar/console-marketplace` following the same pattern. See the [console-marketplace contributing guide](https://github.com/kubestellar/console-marketplace) for details.

---

## Add Your Organization to ADOPTERS.md

If you're using the console with Flux in production or evaluation, we'd love to list your organization:

1. Fork [`kubestellar/console`](https://github.com/kubestellar/console)
2. Add your org to [`ADOPTERS.md`](../ADOPTERS.md)
3. Open a PR with the title: `📖 docs: add <Org> to ADOPTERS.md`

---

## Community and Support

- **CNCF Slack**: `#kubestellar` (KubeStellar Console), `#flux` (Flux project)
- **GitHub Issues**: [github.com/kubestellar/console/issues](https://github.com/kubestellar/console/issues)
- **Hosted demo**: [console.kubestellar.io](https://console.kubestellar.io)

---

*KubeStellar Console is open source under Apache 2.0. KubeStellar is a [CNCF Sandbox project](https://kubestellar.io).*
