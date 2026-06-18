# Contributing a Dashboard Card to KubeStellar Console

**Welcome!** This guide walks you through adding a new dashboard card to KubeStellar Console.

## What is a Dashboard Card?

A **dashboard card** is a reusable UI component that displays real-time data from Kubernetes clusters, external APIs, or computed metrics. Examples:
- **Pod Status Card**: Shows running/pending/failed pods across clusters
- **ArgoCD Sync Card**: Displays ArgoCD application sync status
- **GPU Allocation Card**: Monitors GPU usage by namespace

Cards are:
- **Cached**: Data persists in IndexedDB/SQLite for instant load on revisit
- **Multi-cluster aware**: Automatically aggregate data across clusters
- **Demo-capable**: Fallback to static demo data when no API keys are present
- **i18n-ready**: User-facing strings use `react-i18next`

## Card Architecture

Every card follows this pattern:

```
1. Hook (data fetching)    →   useCachedPods.ts
2. Component (UI)          →   PodsCard.tsx
3. Registry (metadata)     →   cardRegistry.ts
4. Demo data (fallback)    →   getDemoPods()
```

## Step-by-Step: Adding a New Card

### Example: "Deployments Status" Card

---

### Step 1: Create the Hook

**File**: `web/src/hooks/useCachedDeployments.ts`

```tsx
import { useCache } from '@/lib/cache'

interface DeploymentStatus {
  cluster: string
  namespace: string
  name: string
  available: boolean
  replicas: number
  ready: number
}

const DEMO_DEPLOYMENTS: DeploymentStatus[] = [
  { cluster: 'prod-us-east', namespace: 'default', name: 'nginx', available: true, replicas: 3, ready: 3 },
  { cluster: 'prod-eu-west', namespace: 'app', name: 'frontend', available: false, replicas: 2, ready: 1 },
]

async function fetchDeployments(): Promise<DeploymentStatus[]> {
  const resp = await fetch('/api/deployments', { signal: AbortSignal.timeout(10000) })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}

export function useCachedDeployments() {
  return useCache<DeploymentStatus[]>({
    key: 'deployments-status',
    fetcher: fetchDeployments,
    initialData: [],
    demoData: DEMO_DEPLOYMENTS,
    category: 'default',
  })
}
```

---

### Step 2: Create the Component

**File**: `web/src/components/cards/DeploymentsCard.tsx`

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCardLoadingState } from '@/hooks/useCardLoadingState'
import { useCachedDeployments } from '@/hooks/useCachedDeployments'
import { CheckCircle, XCircle } from 'lucide-react'

export function DeploymentsCard() {
  const { data, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures } = useCachedDeployments()

  useCardLoadingState({
    isLoading,
    isRefreshing,
    isDemoData,
    hasAnyData: data.length > 0,
    isFailed,
    consecutiveFailures,
  })

  const available = (data || []).filter(d => d.available).length
  const degraded = (data || []).filter(d => !d.available).length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deployments Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <span>{available} Available</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-400" />
            <span>{degraded} Degraded</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

---

### Step 3: Register the Card

**File**: `web/src/lib/cardRegistry.ts`

```tsx
import { DeploymentsCard } from '@/components/cards/DeploymentsCard'

export const CARD_REGISTRY: CardRegistry = {
  'deployments-status': {
    id: 'deployments-status',
    title: 'Deployments Status',
    description: 'Monitor Deployment availability across clusters',
    category: 'workloads',
    component: DeploymentsCard,
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    tags: ['kubernetes', 'deployments', 'availability'],
    tier: 'free',
  },
}
```

---

### Step 4: Test Locally

```bash
cd web
npm run dev -- --port 5174
```

Verify:
- [ ] Card renders without errors
- [ ] Data loads (or shows demo data)
- [ ] Refresh icon animates when refetching
- [ ] Demo badge appears in demo mode
- [ ] No console errors

---

### Step 5: Open a Pull Request

```bash
git checkout -b add-deployments-card
git add .
git commit -s -m "✨ feat: add Deployments Status card"
git push origin add-deployments-card
```

---

## Common Patterns

### Array Safety
Always guard arrays: `(data || []).map(item => ...)`

### Cluster Deduplication
Use `DeduplicatedClusters()` when iterating clusters.

### No Magic Numbers
Use named constants: `const FETCH_TIMEOUT_MS = 10000`

---

## Getting Help

- **CNCF Slack**: #kubestellar
- **GitHub Discussions**: https://github.com/kubestellar/console/discussions

---

**Fixes**: #18945
