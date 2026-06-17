# KubeStellar Console: Flux GitOps Integration Guide

The KubeStellar Console includes a built-in Flux integration for teams running GitOps across one or many clusters. The integration focuses on **observability and operator workflow support** for the three Flux resource types that usually define a deployment pipeline:

- **GitRepository** sources
- **Kustomization** reconciliations
- **HelmRelease** rollouts

Together, these views let platform teams see whether Flux is installed, whether sources are ready, which reconciliations are healthy, and where Helm-based rollouts are blocked or degraded.

## What the Flux integration includes

The console ships a dedicated Flux status card implementation in `web/src/components/cards/flux_status/` plus supporting config, demo data, and tests.

### Core capabilities

- **Fleet-wide Flux visibility** across clusters discovered by the console
- **Aggregated health state** with `healthy`, `degraded`, and `not-installed` modes
- **Per-resource readiness** for Git repositories, kustomizations, and Helm releases
- **Revision-aware status** so operators can correlate readiness with Git revisions or chart versions
- **Demo-mode fallback** for hosted demos and disconnected environments
- **Cache-backed refresh behavior** using the console's `useCache` data layer

### Related GitOps surfaces

Flux is also represented in other GitOps-oriented cards and views:

- **Flux CD** (`flux_status`) — high-level GitOps summary for sources, kustomizations, and Helm releases
- **Kustomization Status** (`kustomization_status`) — detailed Flux kustomization inventory with filters, sorting, and drill-down support
- **GitOps Drift**, **Overlay Comparison**, **Helm Releases**, **Helm History**, and **Helm Values Diff** — complementary workflows often used alongside Flux-managed clusters

## How the Flux cards work

### Flux CD card

The main Flux card summarizes the state of all detected Flux resources:

- Counts total and not-ready **GitRepository**, **Kustomization**, and **HelmRelease** objects
- Shows a top-level health badge (`healthy` or `degraded`)
- Falls back to a **not installed** empty state when no Flux resources are detected
- Displays a **Demo** badge when the card is rendering demo data
- Lists individual resources with:
  - resource kind
  - cluster
  - namespace
  - readiness
  - reason or revision when available

The card uses the console's unified cache and loading-state system, so it supports warm-cache rendering, background refresh, and demo fallback consistently with other production cards.

### Data sources behind the card

The Flux hook combines three backend data paths:

| Resource type | Source |
| --- | --- |
| GitRepository | `/api/mcp/custom-resources?group=source.toolkit.fluxcd.io&version=v1&resource=gitrepositories` |
| Kustomization | `/api/gitops/kustomizations` |
| HelmRelease | `/api/gitops/helm-releases` |

This design lets the console mix direct CRD discovery with GitOps-specific API handlers already used elsewhere in the product.

### Kustomization Status card

The separate **Kustomization Status** card gives a more detailed Flux-specific operational view:

- cluster and namespace filtering
- local search
- sort by status, name, namespace, or last applied time
- status breakdowns such as `Ready`, `NotReady`, `Progressing`, and `Suspended`
- drill-down entry points for deeper investigation

This is useful when a team wants more than a summary card and needs to inspect which Flux-managed applications are blocked in a specific cluster or namespace.

## GitOps workflow support

The Flux integration is designed to support common GitOps workflows in the console:

1. **Confirm Flux is present**  
   Add the **Flux CD** card to a dashboard. If no Flux resources are found, the console shows a not-installed state instead of a misleading empty success state.

2. **Watch reconciliation health across clusters**  
   Use the top-level Flux health summary to spot clusters where sources, kustomizations, or Helm releases are not ready.

3. **Trace issues to a specific layer**  
   Use the per-section breakdown to determine whether a failure starts at the Git source layer, the kustomize reconciliation layer, or the Helm release layer.

4. **Inspect Kustomization-level details**  
   Add the **Kustomization Status** card for namespace- and cluster-level filtering when the summary card shows degradation.

5. **Pair Flux with adjacent GitOps cards**  
   Use Flux alongside **Helm History**, **Helm Values Diff**, **Overlay Comparison**, and **GitOps Drift** to investigate rollout failures, config drift, or manifest differences.

## How to add Flux cards to a dashboard

1. Open a dashboard in the KubeStellar Console.
2. Click **Add Card**.
3. Open the **GitOps** category.
4. Add one or both of these cards:
   - **Flux CD**
   - **Kustomization Status**

If Flux is not installed, the console can still show install guidance through the card install mapping for Flux-aware cards.

## Demo and test coverage

The Flux integration is covered by:

- dedicated demo data for realistic healthy and degraded states
- hook tests for cache behavior and status aggregation
- component tests for skeleton, error, not-installed, degraded, and demo-badge states
- card-config coverage to keep the Flux card registered in the GitOps catalog

## When to use this integration

Use the Flux integration when you want the console to act as a **GitOps operations dashboard** for Flux-managed clusters:

- platform teams monitoring multiple clusters
- operators validating Git source and reconciliation health
- teams demoing a GitOps-ready console without a live cluster connection
- maintainers correlating Helm and kustomize rollout state from one UI
