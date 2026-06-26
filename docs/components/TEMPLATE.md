# [Component Name]

## Purpose
A concise description of the component's role in the dashboard and the specific value it provides to the user (e.g., "Provides a high-level summary of the Kubernetes cluster fleet health and resource allocation").

## Data Sources
- **Primary Hook**: `{useCachedXxx}` (Retrieves base data set)
- **Support Hooks**:
  - `useGlobalFilters`: For severity or namespace scoping.
  - `useCardData`: For unified filtering, sorting, and pagination logic.
  - `useCardLoadingState`: For centralizing shimmers and empty states.
- **Provider Priority**: (e.g., Backend REST → Backend SSE → Local Agent Proxy → Demo Data)

## Props / Configuration
| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `config` | `object` | `undefined` | Optional scoping (e.g., `{ cluster: string, namespace: string }`). |

## UI States
- **Loading**: (e.g., `CardSkeleton` type "list" vs. custom SVG shimmer)
- **Empty**: (e.g., standard `CardEmptyState` with description "No issues found")
- **Error**: (e.g., `LimitedAccessWarning` or inline error toast)

## Logic & Patterns
- **Filtering**: (e.g., local search across 'name' and 'namespace' fields)
- **Sorting**: (e.g., alphabetical by name, descending by error count)
- **Data Transformation**: (e.g., calculating percentage of ready replicas from raw pod list)
- **AI Integration**: (e.g., `CardAIActions` for diagnosing failed deployments)

## Notes (Optional)
- **Performance**: (e.g., uses Web Workers for deep diffing large inventories)
- **Edge Cases**: (e.g., handles "unknown" provider status if cloud detection fails)
