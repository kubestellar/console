# Console Filtering & Data Consistency Plan - January 21, 2026

## Scope

Fix filtering, data handling, and consistency issues across the console application.

**Items addressed:**
- Item 6: Honoring status and severity filters
- Item 23: Time-series should not fake data - start at zero
- Item 24: Card cluster selectors should respond to global filter
- Item 25: Cards need search functionality
- Item 26: Take acknowledged alerts out of alert notifications
- Item 27: Remove dummy data alerts when demo mode is off
- Item 28: Pagination and filter consistency

---

## Inventory Reference

### Cards (57 total)
| Card | Global Filters | Search | List |
|------|----------------|--------|------|
| ActiveAlerts | Partial (cluster only) | No | Yes |
| AlertRules | No | No | Yes |
| AppStatus | Yes | No | Yes |
| ArgoCDApplications | Yes | No | Yes |
| ArgoCDHealth | Yes | No | Yes |
| ArgoCDSyncStatus | Yes | No | No |
| ChartVersions | Yes | No | Yes |
| ClusterComparison | Yes | No | Yes |
| ClusterCosts | Yes | No | Yes |
| ClusterFocus | Yes | No | Yes |
| ClusterHealth | Yes | No | Yes |
| ClusterMetrics | Yes | No | Yes |
| ClusterNetwork | Yes | No | Yes |
| ClusterResourceTree | Yes | Yes | Yes |
| ComputeOverview | Yes | No | Yes |
| CRDHealth | Yes | No | Yes |
| DeploymentIssues | Yes | No | Yes |
| DeploymentProgress | No | Yes | Yes |
| DeploymentStatus | Yes | Yes | Yes |
| EventsTimeline | Yes | No | Yes |
| EventStream | Yes | No | Yes |
| GitOpsDrift | No | No | Yes |
| GPUInventory | Yes | No | Yes |
| GPUOverview | Yes | No | Yes |
| GPUStatus | Yes | No | Yes |
| GPUUsageTrend | Yes | No | Yes |
| GPUUtilization | Yes | No | Yes |
| GPUWorkloads | Yes | No | Yes |
| HelmHistory | Yes | No | Yes |
| HelmReleaseStatus | Yes | No | Yes |
| HelmValuesDiff | Yes | No | Yes |
| ConsoleMissions | No | No | Yes |
| KubecostOverview | No | No | Yes |
| KustomizationStatus | Yes | No | Yes |
| KyvernoPolicies | No | No | Yes |
| NamespaceEvents | Yes | No | Yes |
| NamespaceOverview | Yes | No | Yes |
| NamespaceQuotas | Yes | Yes | Yes |
| NamespaceRBAC | Yes | No | Yes |
| NetworkOverview | Yes | No | Yes |
| OPAPolicies | Yes | No | Yes |
| OpenCostOverview | No | No | Yes |
| OperatorStatus | Yes | No | Yes |
| OperatorSubscriptions | Yes | No | Yes |
| OverlayComparison | Yes | No | Yes |
| PodHealthTrend | Yes | No | Yes |
| PodIssues | Yes | No | Yes |
| PVCStatus | Yes | No | Yes |
| ResourceCapacity | Yes | No | Yes |
| ResourceTrend | Yes | No | Yes |
| ResourceUsage | Yes | No | Yes |
| SecurityIssues | Yes | No | No |
| ServiceStatus | Yes | Yes | Yes |
| StorageOverview | Yes | No | Yes |
| TopPods | Yes | No | Yes |
| UpgradeStatus | Yes | No | Yes |
| UserManagement | No | No | Yes |

### Stats Blocks (10 types)
Clusters, Healthy, Unhealthy, Offline, Nodes, CPUs, Memory, Storage, GPUs, Pods

### Dashboards (19 templates)
cluster-overview, cluster-resource-tree, cluster-comparison, single-cluster-focus, namespace-dashboard, gitops-overview, helm-management, flux-dashboard, argocd-dashboard, security-overview, operator-management, gpu-dashboard, app-monitoring, troubleshooting, storage-overview, compute-overview, network-overview, ai-dashboard, cost-management

---

## Implementation Plan

### Phase 1: Core Filter Fixes (Item 6)

#### 1.1 Fix filterByStatus substring matching bug
**File:** `web/src/hooks/useGlobalFilters.tsx` (lines 389-396)

**Problem:** Uses `status.includes(s)` (substring match) instead of exact match

**Change:**
```typescript
// FROM:
return effectiveSelectedStatuses.some(s => status.includes(s))

// TO:
return effectiveSelectedStatuses.includes(status as StatusLevel)
```

#### 1.2 Update ActiveAlerts to honor severity/status filters
**File:** `web/src/components/cards/ActiveAlerts.tsx`

**Changes:**
1. Import `filterBySeverity`, `filterByStatus`, `customFilter` from useGlobalFilters
2. Apply severity filter to filteredAlerts
3. Apply status filter to filteredAlerts
4. Apply customFilter for text search

#### 1.3 Add global filters to cards missing them
**Priority cards:**
- `AlertRules.tsx` - add cluster + customFilter
- `GitOpsDrift.tsx` - add cluster filter
- `ConsoleMissions.tsx` - add cluster filter

---

### Phase 2: Time-Series Data (Item 23)

#### 2.1 Remove synthetic data from ResourceTrend
**File:** `web/src/components/cards/ResourceTrend.tsx` (lines 169-189)

**Change:** Remove synthetic 10-point history generation. Start with single real data point.

**New empty state:**
```tsx
{history.length < 2 ? (
  <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm">
    <TrendingUp className="w-6 h-6 mb-2 opacity-50" />
    <span>Collecting data...</span>
    <span className="text-xs">Chart will appear after first interval</span>
  </div>
) : ( /* chart */ )}
```

#### 2.2 Remove synthetic data from PodHealthTrend
**File:** `web/src/components/cards/PodHealthTrend.tsx` (lines 184-204)

Apply same pattern as ResourceTrend.

#### 2.3 Add "Simulated" indicator to ClusterMetrics
**File:** `web/src/components/cards/ClusterMetrics.tsx`

Add visual indicator when showing generated historical data.

---

### Phase 3: Local Cluster Filter Memory (Item 24)

#### 3.1 Create useLocalClusterFilter hook
**New file:** `web/src/hooks/useLocalClusterFilter.ts`

**Features:**
- Track previous local selection before global filter applied
- Restore local selection when global filter cleared
- Integrate with useGlobalFilters

#### 3.2 Update cards to use new hook
**Files:**
- `ResourceTrend.tsx`
- `PodHealthTrend.tsx`
- `ClusterMetrics.tsx`
- `GPUUtilization.tsx`
- `ActiveAlerts.tsx`

---

### Phase 4: Search Functionality (Item 25)

#### 4.1 Create reusable SearchInput component
**New file:** `web/src/components/ui/SearchInput.tsx`

#### 4.2 Add search to high-priority cards
**Priority order:**
1. `AlertRules.tsx` - search by rule name, metric
2. `ActiveAlerts.tsx` - search by name, message, cluster
3. `HelmReleaseStatus.tsx` - search by release name, namespace
4. `ArgoCDApplications.tsx` - search by app name
5. `OperatorStatus.tsx` - search by operator name
6. `PodIssues.tsx` - search by pod name, namespace
7. `PVCStatus.tsx` - search by PVC name
8. `NamespaceRBAC.tsx` - search by role/binding name

---

### Phase 5: Acknowledged Alerts (Item 26)

#### 5.1 Filter acknowledged alerts from active list
**File:** `web/src/hooks/useAlerts.ts` (lines 178-180)

**Change:**
```typescript
// FROM:
const activeAlerts = alerts.filter(a => a.status === 'firing')

// TO:
const activeAlerts = alerts.filter(a => a.status === 'firing' && !a.acknowledgedAt)
```

#### 5.2 Add separate "Acknowledged" section or filter option
**File:** `web/src/components/cards/ActiveAlerts.tsx`

Add toggle to show/hide acknowledged alerts.

---

### Phase 6: Demo Mode Data Control (Item 27)

#### 6.1 Conditional dummy data based on demo mode
**File:** `web/src/hooks/useAlerts.ts`

**Change:** Only generate dummy alerts when demo mode is enabled.

```typescript
import { getDemoMode } from './useDemoMode'

// In alert initialization:
const initialAlerts = getDemoMode() ? generateDummyAlerts() : []
```

#### 6.2 Update MSW handlers for demo mode awareness
**File:** `web/src/mocks/handlers.ts`

Conditionally return demo data based on demo mode state.

---

### Phase 7: Pagination & Filter Consistency (Item 28)

#### 7.1 Standardize pagination reset on filter change
**Files:** All cards using usePagination hook

**Pattern to implement:**
```typescript
// Reset to page 1 when filters change
useEffect(() => {
  goToPage(1)
}, [selectedClusters, selectedSeverities, selectedStatuses, customFilter])
```

#### 7.2 Convert limit-based cards to usePagination
**Cards to update:**
- `ActiveAlerts.tsx` - convert from limit state to usePagination
- `SecurityIssues.tsx` - already uses PaginatedList, ensure filter reset

#### 7.3 Update usePagination hook
**File:** `web/src/components/ui/Pagination.tsx`

Add `resetDependencies` parameter to auto-reset page on filter changes.

---

## Files to Modify Summary

### Hooks
- `web/src/hooks/useGlobalFilters.tsx` - fix filterByStatus
- `web/src/hooks/useAlerts.ts` - acknowledged filter, demo mode check
- `web/src/hooks/useLocalClusterFilter.ts` - NEW

### UI Components
- `web/src/components/ui/SearchInput.tsx` - NEW
- `web/src/components/ui/Pagination.tsx` - add reset dependencies

### Cards (13 cards)
- `ActiveAlerts.tsx` - severity/status filters, search, pagination, acknowledged toggle
- `AlertRules.tsx` - global filters, search
- `ArgoCDApplications.tsx` - search
- `GitOpsDrift.tsx` - global filters
- `GPUUtilization.tsx` - local cluster filter hook
- `HelmReleaseStatus.tsx` - search
- `ConsoleMissions.tsx` - global filters
- `NamespaceRBAC.tsx` - search
- `OperatorStatus.tsx` - search
- `PodHealthTrend.tsx` - local cluster filter hook, remove synthetic data
- `PodIssues.tsx` - search
- `PVCStatus.tsx` - search
- `ResourceTrend.tsx` - local cluster filter hook, remove synthetic data
- `ClusterMetrics.tsx` - simulated data indicator

### Mocks
- `web/src/mocks/handlers.ts` - demo mode awareness

---

## Testing Strategy

### Using Chrome DevTools MCP
- Frontend: `http://localhost:5174`
- Backend: `http://localhost:8080`

### Test Cases

**Phase 1 - Filter Fixes:**
1. Apply severity filter via navbar, verify ActiveAlerts respects it
2. Apply status filter, verify no false positive matches
3. Verify AlertRules responds to cluster filter

**Phase 2 - Time-Series:**
1. Clear localStorage: `localStorage.removeItem('resource-trend-history')`
2. Refresh, verify "Collecting data..." message appears
3. Wait for interval, verify single real data point appears

**Phase 3 - Local Cluster Filter:**
1. Select cluster in card local filter
2. Apply global cluster filter
3. Clear global filter
4. Verify local selection restored

**Phase 4 - Search:**
1. Type in AlertRules search box
2. Verify real-time filtering
3. Clear search, verify full list restored

**Phase 5 - Acknowledged Alerts:**
1. Acknowledge an alert
2. Verify it disappears from active list
3. Toggle "show acknowledged" to see it

**Phase 6 - Demo Mode:**
1. Turn demo mode OFF
2. Verify no dummy alerts appear
3. Turn demo mode ON
4. Verify dummy alerts appear

**Phase 7 - Pagination:**
1. Navigate to page 2 of a list
2. Change filter
3. Verify reset to page 1

---

## Execution Order

1. Phase 1: Core filter fixes (foundation for other changes)
2. Phase 6: Demo mode control (affects testing)
3. Phase 5: Acknowledged alerts
4. Phase 7: Pagination consistency
5. Phase 2: Time-series data
6. Phase 3: Local cluster filter hook
7. Phase 4: Search functionality (can be done incrementally)
