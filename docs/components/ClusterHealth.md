# ClusterHealth

## Purpose
Provides a comprehensive overview of the entire Kubernetes fleet, tracking connectivity, health status (Ready/NotReady), authentication state (expired tokens), and resource capacity (CPU/Nodes/GPUs).

## Data Sources
- **Primary Hook**: `useClusters()` (Retrieves aggregated cluster telemetry)
- **Support Hooks**:
  - `useCachedGPUNodes`: Calculates per-cluster and global accelerator allocation.
  - `useGlobalFilters`: Scopes the "Summary Stats" to the user's selected clusters.
  - `useCardData`: Standard filtering (search `name`, `context`, `server`), sorting, and pagination.
  - `useCardLoadingState`: Coordinates skeletons until health checks complete.
- **Provider Priority**: (Backend REST → Backend SSE → Local Agent Proxy → Demo Data)

## Props / Configuration
| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `config` | `object` | `undefined` | Optional scoping (e.g., `{ cluster: string, namespace: string }`). |

## UI States
- **Loading**: Custom skeleton with header, stats grid, and list shimmer.
- **Empty**: `noClustersConfigured` message with onboarding prompt.
- **Error**: Inline warning box for connectivity or re-authentication (expired tokens).

## Logic & Patterns
- **Health Determination**: Healthy if `nodeCount > 0` OR `healthy === true`.
- **Status Mapping**: Clusters are categorized as "Healthy", "Unhealthy", "Auth Error" (key icon), or "Offline" (wifi icon).
- **Sorting**: Supported by `status`, `name`, `nodes`, and `pods`.
- **AI Integration**: `CardAIActions` triggers "AI Diagnose & Repair" for any unreachable or unhealthy clusters.
- **Drilldown**: Clicking a cluster name opens the detail modal for deep-dive metrics.

## Notes
- **Performance**: Performs parallel health checks across all context names (aliased vs. raw paths).
- **Edge Cases**: Handles cloud provider detection (EKS, GKE, AKS, OpenShift) via server URL analysis to provide direct links to the cloud console.
