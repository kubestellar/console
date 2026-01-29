# Storage Optimization Analysis

## Overview

Analysis of 109 cards, 20 dashboards, and 93 stats blocks for IndexedDB and localStorage optimization.

## Storage Strategy

| Storage Type | Use Case | Size Limit | Access Pattern |
|--------------|----------|------------|----------------|
| **IndexedDB** | Large data, history, logs | 50MB+ | Async, cacheable |
| **localStorage** | Preferences, small config | ~5MB | Sync, fast access |
| **In-Memory** | Real-time, transient | Unlimited | No persistence |

---

## Category 1: IndexedDB Required (Large Data)

These components deal with large, cacheable data that benefits from IndexedDB's larger quota.

### Logs & Events (5 cards)
| Card | Type | Data Size | Recommendation |
|------|------|-----------|----------------|
| event_stream | events | Large | IndexedDB - cache last 1000 events |
| namespace_events | events | Large | IndexedDB - per-namespace event cache |
| events_timeline | timeseries | Medium | IndexedDB - 24h rolling window |
| prow_history | events | Large | IndexedDB - build history cache |
| helm_history | events | Medium | IndexedDB - release history |

### Metrics History (6 cards)
| Card | Type | Data Size | Recommendation |
|------|------|-----------|----------------|
| cluster_metrics | timeseries | Large | IndexedDB - 24h metrics per cluster |
| resource_trend | timeseries | Large | IndexedDB - resource history |
| pod_health_trend | timeseries | Medium | IndexedDB - health snapshots |
| gpu_usage_trend | timeseries | Medium | IndexedDB - GPU metrics history |
| gpu_utilization | timeseries | Medium | IndexedDB - utilization data |
| compliance_score | gauge | Small | IndexedDB - historical scores |

### Security Scans (5 cards)
| Card | Type | Data Size | Recommendation |
|------|------|-----------|----------------|
| trivy_scan | status | Large | IndexedDB - vulnerability data |
| kubescape_scan | status | Large | IndexedDB - compliance data |
| falco_alerts | status | Large | IndexedDB - runtime alerts |
| security_issues | table | Large | IndexedDB - issue cache |
| policy_violations | table | Medium | IndexedDB - violations log |

### Workload Detection (7 cards)
| Card | Type | Data Size | Recommendation |
|------|------|-----------|----------------|
| llm_inference | table | Large | IndexedDB - inference logs |
| llm_models | table | Medium | IndexedDB - model inventory |
| ml_jobs | table | Large | IndexedDB - job history |
| ml_notebooks | table | Medium | IndexedDB - notebook list |
| prow_jobs | table | Large | IndexedDB - job results |
| prow_status | status | Medium | IndexedDB - status cache |
| github_activity | table | Medium | IndexedDB - activity feed |

### Utilities (2 cards)
| Card | Type | Data Size | Recommendation |
|------|------|-----------|----------------|
| kubectl | interactive | Large | **DONE** - Uses IndexedDB via KubectlStore |
| network_utils | interactive | Medium | IndexedDB - command history |

**Total: 25 cards should use IndexedDB**

---

## Category 2: localStorage Preferred (Small Config)

These components have small, frequently-accessed configuration data.

### Dashboard State (stored in useDashboardCards hook)
- Card layout/order per dashboard
- Collapsed card state
- Filter preferences
- Sort preferences

### Card Preferences (per card)
| Setting | Storage Key | Size |
|---------|-------------|------|
| Cluster filter | `kubestellar-card-filter:{cardType}` | ~100 bytes |
| Sort order | `kubestellar-card-sort:{cardType}` | ~50 bytes |
| Collapsed state | `kubestellar-card-collapsed:{cardType}` | ~10 bytes |
| Refresh interval | `kubestellar-card-refresh:{cardType}` | ~20 bytes |

### Global Preferences
| Setting | Storage Key | Size |
|---------|-------------|------|
| Theme | `kubestellar-theme` | ~20 bytes |
| Sidebar collapsed | `kubestellar-sidebar` | ~10 bytes |
| Global cluster filter | `kubestellar-global-clusters` | ~500 bytes |
| Tour completed | `kubestellar-tour-completed` | ~10 bytes |
| Onboarding | `demo-user-onboarded` | ~10 bytes |

### Game High Scores (21 games)
| Game | Storage Key | Size |
|------|-------------|------|
| All games | `kubestellar-game-{type}-highscore` | ~50 bytes each |

**Estimated localStorage usage: ~50KB total (well under 5MB limit)**

---

## Category 3: In-Memory Only (Real-time Data)

These components show real-time data and don't benefit from caching.

### Status Cards (always fresh)
| Card | Reason |
|------|--------|
| cluster_health | Must show current state |
| active_alerts | Alerts need to be current |
| deployment_status | Deployments change frequently |
| pod_issues | Issues need immediate visibility |
| deployment_issues | Same as above |
| upgrade_status | Upgrade state is transient |

### Gauge/Status Displays
| Card | Reason |
|------|--------|
| resource_usage | Real-time resource monitoring |
| gpu_overview | GPU state changes rapidly |
| namespace_quotas | Quota usage is live |
| compute_overview | Live compute metrics |

**Total: ~15 cards are real-time only**

---

## Category 4: Hybrid Approach (Both)

Some components benefit from using both storage types.

### Pattern: Large Data + Preferences
```typescript
// IndexedDB for data
const { data } = useCache({
  key: 'security-issues',
  fetcher: fetchSecurityIssues,
  category: 'pods',
})

// localStorage for preferences
const [sortBy, setSortBy] = useLocalStorage('security-issues-sort', 'severity')
const [clusterFilter] = useLocalStorage('security-issues-cluster', [])
```

### Cards Using Hybrid Approach
| Card | IndexedDB | localStorage |
|------|-----------|--------------|
| All table cards | Row data | Sort, filter, page |
| All timeseries | History data | Time range pref |
| Dashboards | Card content | Layout, order |

---

## Implementation Checklist

### Phase 1: Core Infrastructure ✅ COMPLETE
- [x] IndexedDB wrapper class (`IndexedDBStorage` in cache/index.ts)
- [x] Migration from localStorage (`migrateFromLocalStorage`)
- [x] useCache hook with IndexedDB backend
- [x] Quota exceeded error handling
- [x] `useLocalPreference` hook for small preferences (cache/hooks.ts)
- [x] `useIndexedData` hook for large data (cache/hooks.ts)

### Phase 2: Data Hooks Using IndexedDB ✅ COMPLETE
All primary data hooks now use `useCache` which stores data in IndexedDB:
- [x] `useCachedPods` - Pod data
- [x] `useCachedEvents` - Event stream data (100 events cached)
- [x] `useCachedPodIssues` - Pod issues
- [x] `useCachedDeploymentIssues` - Deployment issues
- [x] `useCachedDeployments` - Deployments
- [x] `useCachedServices` - Services
- [x] `useCachedProwJobs` - Prow CI jobs
- [x] `useCachedLLMdServers` - LLM inference servers
- [x] `useCachedLLMdModels` - LLM models

### Phase 3: Interactive Cards ✅ COMPLETE
- [x] Kubectl terminal - Uses `KubectlStore` singleton with IndexedDB
  - Command history persisted
  - Output state shared between card/modal
  - Saved commands feature

### Phase 4: Trend Cards (LOW PRIORITY)
These cards use localStorage but with short TTL (30 min) and limited data (24 points):
- [ ] ResourceTrend - Could migrate to useIndexedData
- [ ] PodHealthTrend - Could migrate to useIndexedData
- [ ] GPUUsageTrend - Could migrate to useIndexedData
- [ ] ClusterMetrics - Could migrate to useIndexedData

**Note**: Low priority because data is small and auto-expires. No quota issues expected.

### Phase 5: Preferences (localStorage - CORRECT)
These correctly use localStorage for small config:
- [x] Card collapse state (`useCardCollapse`)
- [x] Cluster filter preferences (`useChartFilters`)
- [x] Sort preferences
- [x] Dashboard card order
- [x] Theme settings
- [x] Game high scores

### Remaining Work
1. **Optional**: Migrate trend cards to `useIndexedData` for consistency
2. **Optional**: Create `useTrendHistory` shared hook for trend cards
3. **Monitor**: Watch for any new localStorage quota issues

---

## Storage Key Naming Convention

```
IndexedDB keys:
  {category}:{subcategory}:{identifier}
  Examples:
    events:cluster:prod-us-east
    metrics:cluster:prod-us-east:cpu
    security:trivy:scan-20260126

localStorage keys:
  kubestellar-{feature}:{setting}
  Examples:
    kubestellar-card-filter:deployment-issues
    kubestellar-theme
    kubestellar-tour-completed
```

---

## Quota Management

### IndexedDB Quota
- Request persistent storage: `navigator.storage.persist()`
- Monitor usage: `navigator.storage.estimate()`
- Clear old data: Keep last 7 days of metrics, last 1000 events

### localStorage Quota
- Total budget: 2MB (leave headroom)
- Per-key limit: 100KB
- Cleanup: Remove keys older than 30 days

---

## Migration Script

Run on app startup to migrate old localStorage cache:

```typescript
// In main.tsx
import { migrateFromLocalStorage } from './lib/cache'

// During app initialization
await migrateFromLocalStorage()
```

This will:
1. Find all `ksc_cache:*` keys in localStorage
2. Move data to IndexedDB
3. Remove old localStorage entries
4. Clean up kubectl-history (major quota offender)
