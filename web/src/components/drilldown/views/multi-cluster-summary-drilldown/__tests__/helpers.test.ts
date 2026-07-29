import { describe, expect, it } from 'vitest'
import { CheckCircle, XCircle, AlertTriangle, AlertCircle } from 'lucide-react'

import {
  computeSummaryStats,
  getStatusBadge,
  getViewConfig,
} from '../helpers'
import type { DrillDownViewType } from '../../../../../hooks/useDrillDown'

const ALL_VIEW_TYPES: DrillDownViewType[] = [
  'all-clusters',
  'all-namespaces',
  'all-deployments',
  'all-pods',
  'all-services',
  'all-nodes',
  'all-events',
  'all-alerts',
  'all-helm',
  'all-operators',
  'all-security',
  'all-gpu',
  'all-storage',
  'all-jobs',
]

describe('getViewConfig', () => {
  it('returns a distinct config for every known view type', () => {
    for (const view of ALL_VIEW_TYPES) {
      const cfg = getViewConfig(view)
      expect(cfg.icon).toBeDefined()
      expect(cfg.color).toMatch(/^text-/)
      expect(cfg.bgColor).toMatch(/^bg-/)
      expect(cfg.dataKey.length).toBeGreaterThan(0)
      expect(cfg.nameKey.length).toBeGreaterThan(0)
      expect(typeof cfg.getStatus).toBe('function')
    }
  })

  it('returns a fallback config for an unknown view type', () => {
    const cfg = getViewConfig('mystery-view' as DrillDownViewType)
    expect(cfg.dataKey).toBe('items')
    expect(cfg.nameKey).toBe('name')
    expect(cfg.color).toBe('text-muted-foreground')
    expect(cfg.getStatus({} as never)).toBe('unknown')
  })

  it('all-clusters getStatus prefers healthy=true → "healthy" else falls back to status', () => {
    const cfg = getViewConfig('all-clusters')
    expect(cfg.getStatus({ healthy: true, status: 'ignored' } as never)).toBe('healthy')
    expect(cfg.getStatus({ healthy: false, status: 'unreachable' } as never)).toBe('unreachable')
    expect(cfg.getStatus({ healthy: false } as never)).toBe('unknown')
  })

  it('all-namespaces getStatus always returns "active"', () => {
    expect(getViewConfig('all-namespaces').getStatus({} as never)).toBe('active')
  })

  it('all-deployments getStatus compares readyReplicas to replicas', () => {
    const gs = getViewConfig('all-deployments').getStatus
    expect(gs({ readyReplicas: 3, replicas: 3 } as never)).toBe('healthy')
    expect(gs({ readyReplicas: 2, replicas: 3 } as never)).toBe('unhealthy')
    expect(gs({} as never)).toBe('healthy') // undefined === undefined
  })

  it('all-pods getStatus prefers status, then phase, else unknown', () => {
    const gs = getViewConfig('all-pods').getStatus
    expect(gs({ status: 'Running' } as never)).toBe('Running')
    expect(gs({ phase: 'Pending' } as never)).toBe('Pending')
    expect(gs({} as never)).toBe('unknown')
  })

  it('all-nodes getStatus is "Ready" unless ready=false or status="NotReady"', () => {
    const gs = getViewConfig('all-nodes').getStatus
    expect(gs({ ready: true } as never)).toBe('Ready')
    expect(gs({} as never)).toBe('Ready')
    expect(gs({ ready: false } as never)).toBe('NotReady')
    expect(gs({ status: 'NotReady' } as never)).toBe('NotReady')
  })

  it('all-events getStatus defaults to "Normal"', () => {
    const gs = getViewConfig('all-events').getStatus
    expect(gs({} as never)).toBe('Normal')
    expect(gs({ type: 'Warning' } as never)).toBe('Warning')
  })

  it('all-gpu getStatus is "available" when available>0 else "busy"', () => {
    const gs = getViewConfig('all-gpu').getStatus
    expect(gs({ available: 4 } as never)).toBe('available')
    expect(gs({ available: 0 } as never)).toBe('busy')
    expect(gs({} as never)).toBe('busy')
  })

  it('exposes canonical dataKeys for well-known views', () => {
    expect(getViewConfig('all-clusters').dataKey).toBe('clusters')
    expect(getViewConfig('all-helm').dataKey).toBe('helmReleases')
    expect(getViewConfig('all-security').dataKey).toBe('securityIssues')
    expect(getViewConfig('all-storage').dataKey).toBe('pvcs')
    expect(getViewConfig('all-gpu').dataKey).toBe('gpuNodes')
  })
})

describe('getStatusBadge', () => {
  it.each(['Running', 'HEALTHY', 'ready', 'active', 'deployed', 'succeeded', 'available', 'normal'])(
    'maps healthy status %s to a green CheckCircle badge',
    (status) => {
      const b = getStatusBadge(status)
      expect(b.icon).toBe(CheckCircle)
      expect(b.color).toContain('green')
    },
  )

  it.each(['pending', 'Progressing', 'waiting', 'BUSY', 'Warning'])(
    'maps warning status %s to a yellow AlertTriangle badge',
    (status) => {
      const b = getStatusBadge(status)
      expect(b.icon).toBe(AlertTriangle)
      expect(b.color).toContain('yellow')
    },
  )

  it.each(['Failed', 'ERROR', 'unhealthy', 'NotReady', 'critical', 'CrashLoopBackOff', 'ImagePullBackOff'])(
    'maps failure status %s to a red XCircle badge',
    (status) => {
      const b = getStatusBadge(status)
      expect(b.icon).toBe(XCircle)
      expect(b.color).toContain('red')
    },
  )

  it('returns a neutral fallback for unknown statuses', () => {
    const b = getStatusBadge('mystery')
    expect(b.icon).toBe(AlertCircle)
    expect(b.color).toBe('text-muted-foreground')
    expect(b.bg).toBe('bg-secondary')
  })

  it('tolerates null/undefined/empty status without throwing', () => {
    expect(getStatusBadge(undefined as unknown as string).icon).toBe(AlertCircle)
    expect(getStatusBadge(null as unknown as string).icon).toBe(AlertCircle)
    expect(getStatusBadge('').icon).toBe(AlertCircle)
  })
})

describe('computeSummaryStats', () => {
  const getStatus = (item: { status?: string }) => item.status || ''
  const baseOpts = {
    searchQuery: '',
    statusFilter: 'all',
    clusterFilter: 'all',
    viewType: 'all-pods' as DrillDownViewType,
    expectedNodeCountFromClusters: 0,
    expectedPodCountFromClusters: 0,
  }

  it('counts healthy items using HEALTHY_STATUSES case-insensitively', () => {
    const items = [
      { status: 'Running' }, { status: 'healthy' }, { status: 'crashloopbackoff' }, { status: 'pending' },
    ]
    const s = computeSummaryStats(items, getStatus, baseOpts)
    expect(s.total).toBe(4)
    expect(s.healthy).toBe(2)
    expect(s.issues).toBe(2)
  })

  it('counts firing and resolved separately', () => {
    const items = [
      { status: 'firing' }, { status: 'firing' }, { status: 'resolved' }, { status: 'running' },
    ]
    const s = computeSummaryStats(items, getStatus, baseOpts)
    expect(s.firing).toBe(2)
    expect(s.resolved).toBe(1)
  })

  it('uses expectedNodeCountFromClusters as total when list is empty and filters are unset (all-nodes)', () => {
    const s = computeSummaryStats([], getStatus, {
      ...baseOpts, viewType: 'all-nodes', expectedNodeCountFromClusters: 12,
    })
    expect(s.total).toBe(12)
    expect(s.healthy).toBe(0)
    expect(s.issues).toBe(12)
  })

  it('uses expectedPodCountFromClusters as total when list is empty and filters are unset (all-pods)', () => {
    const s = computeSummaryStats([], getStatus, {
      ...baseOpts, viewType: 'all-pods', expectedPodCountFromClusters: 42,
    })
    expect(s.total).toBe(42)
  })

  it('does NOT substitute the expected count when a search query is set', () => {
    const s = computeSummaryStats([], getStatus, {
      ...baseOpts, viewType: 'all-nodes', expectedNodeCountFromClusters: 5, searchQuery: 'foo',
    })
    expect(s.total).toBe(0)
  })

  it('does NOT substitute when statusFilter or clusterFilter is set', () => {
    expect(computeSummaryStats([], getStatus, { ...baseOpts, viewType: 'all-nodes', expectedNodeCountFromClusters: 5, statusFilter: 'healthy' }).total).toBe(0)
    expect(computeSummaryStats([], getStatus, { ...baseOpts, viewType: 'all-nodes', expectedNodeCountFromClusters: 5, clusterFilter: 'prod' }).total).toBe(0)
  })

  it('does NOT substitute for viewTypes other than all-nodes/all-pods', () => {
    const s = computeSummaryStats([], getStatus, {
      ...baseOpts, viewType: 'all-deployments', expectedNodeCountFromClusters: 5, expectedPodCountFromClusters: 5,
    })
    expect(s.total).toBe(0)
  })

  it('tolerates items whose getStatus returns undefined/null', () => {
    const items = [{ status: undefined }, { status: 'running' }]
    const s = computeSummaryStats(items, getStatus, baseOpts)
    expect(s.healthy).toBe(1)
    expect(s.issues).toBe(1)
  })

  it('returns an all-zero summary for an empty list with no expected counts', () => {
    const s = computeSummaryStats([], getStatus, baseOpts)
    expect(s).toEqual({ total: 0, healthy: 0, issues: 0, firing: 0, resolved: 0 })
  })
})
