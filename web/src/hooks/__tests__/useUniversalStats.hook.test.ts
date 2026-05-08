import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ─── Mock factories ───────────────────────────────────────────────
// Each mock is assigned to a variable so individual tests can override
// return values via mockReturnValue / mockReturnValueOnce.

const mockUseClusters = vi.fn(() => ({
  deduplicatedClusters: [] as unknown[],
  clusters: [] as unknown[],
  isLoading: false,
}))
const mockUsePodIssues = vi.fn(() => ({ issues: [] as unknown[], isLoading: false }))
const mockUseDeployments = vi.fn(() => ({ deployments: [] as unknown[], isLoading: false }))
const mockUseDeploymentIssues = vi.fn(() => ({ issues: [] as unknown[], isLoading: false }))
const mockUsePVCs = vi.fn(() => ({ pvcs: [] as unknown[], isLoading: false }))
const mockUseServices = vi.fn(() => ({ services: [] as unknown[], isLoading: false }))
const mockUseEvents = vi.fn(() => ({ events: [] as unknown[], isLoading: false }))
const mockUseWarningEvents = vi.fn(() => ({ events: [] as unknown[], isLoading: false }))
const mockUseSecurityIssues = vi.fn(() => ({ issues: [] as unknown[], isLoading: false }))
const mockUseHelmReleases = vi.fn(() => ({ releases: [] as unknown[], isLoading: false }))
const mockUseOperatorSubscriptions = vi.fn(() => ({ subscriptions: [] as unknown[], isLoading: false }))
const mockUseOperators = vi.fn(() => ({ operators: [] as unknown[], isLoading: false }))
const mockUseGPUNodes = vi.fn(() => ({ nodes: [] as unknown[], isLoading: false }))

const mockUseAlerts = vi.fn(() => ({ alerts: [], stats: undefined as never, isLoading: false }))
const mockUseAlertRules = vi.fn(() => ({ rules: [] as unknown[], isLoading: false }))

const mockDrillToAllClusters = vi.fn()
const mockDrillToAllNodes = vi.fn()
const mockDrillToAllPods = vi.fn()
const mockDrillToAllDeployments = vi.fn()
const mockDrillToAllServices = vi.fn()
const mockDrillToAllEvents = vi.fn()
const mockDrillToAllAlerts = vi.fn()
const mockDrillToAllHelm = vi.fn()
const mockDrillToAllOperators = vi.fn()
const mockDrillToAllSecurity = vi.fn()
const mockDrillToAllGPU = vi.fn()
const mockDrillToAllStorage = vi.fn()

vi.mock('../useMCP', () => ({
  useClusters: (...args: unknown[]) => mockUseClusters(...args),
  usePodIssues: (...args: unknown[]) => mockUsePodIssues(...args),
  useDeployments: (...args: unknown[]) => mockUseDeployments(...args),
  useDeploymentIssues: (...args: unknown[]) => mockUseDeploymentIssues(...args),
  usePVCs: (...args: unknown[]) => mockUsePVCs(...args),
  useServices: (...args: unknown[]) => mockUseServices(...args),
  useEvents: (...args: unknown[]) => mockUseEvents(...args),
  useWarningEvents: (...args: unknown[]) => mockUseWarningEvents(...args),
  useSecurityIssues: (...args: unknown[]) => mockUseSecurityIssues(...args),
  useHelmReleases: (...args: unknown[]) => mockUseHelmReleases(...args),
  useOperatorSubscriptions: (...args: unknown[]) => mockUseOperatorSubscriptions(...args),
  useOperators: (...args: unknown[]) => mockUseOperators(...args),
  useGPUNodes: (...args: unknown[]) => mockUseGPUNodes(...args),
}))

vi.mock('../useCachedData', () => ({
  useCachedPVCs: (...args: unknown[]) => mockUsePVCs(...args),
}))

const mockUseIngresses = vi.fn(() => ({ ingresses: [] as unknown[], isLoading: false }))

vi.mock('../mcp/networking', () => ({
  useIngresses: (...args: unknown[]) => mockUseIngresses(...args),
}))

vi.mock('../useAlerts', () => ({
  useAlerts: (...args: unknown[]) => mockUseAlerts(...args),
  useAlertRules: (...args: unknown[]) => mockUseAlertRules(...args),
}))

vi.mock('../useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToAllClusters: mockDrillToAllClusters,
    drillToAllNodes: mockDrillToAllNodes,
    drillToAllPods: mockDrillToAllPods,
    drillToAllDeployments: mockDrillToAllDeployments,
    drillToAllServices: mockDrillToAllServices,
    drillToAllEvents: mockDrillToAllEvents,
    drillToAllAlerts: mockDrillToAllAlerts,
    drillToAllHelm: mockDrillToAllHelm,
    drillToAllOperators: mockDrillToAllOperators,
    drillToAllSecurity: mockDrillToAllSecurity,
    drillToAllGPU: mockDrillToAllGPU,
    drillToAllStorage: mockDrillToAllStorage,
  }),
}))

import { useUniversalStats, createMergedStatValueGetter } from '../useUniversalStats'

// ─── Helpers ──────────────────────────────────────────────────────

function getStatValue(blockId: string) {
  const { result } = renderHook(() => useUniversalStats())
  return result.current.getStatValue(blockId)
}

/** Build a minimal cluster object with sensible defaults */
function makeCluster(overrides: Record<string, unknown> = {}) {
  return {
    name: 'cluster-1',
    healthy: true,
    reachable: true,
    nodeCount: 3,
    podCount: 10,
    cpuCores: 8,
    memoryGB: 32,
    storageGB: 100,
    namespaces: ['default', 'kube-system'],
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────

describe('useUniversalStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset every mock to empty defaults
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [], clusters: [], isLoading: false })
    mockUsePodIssues.mockReturnValue({ issues: [], isLoading: false })
    mockUseDeployments.mockReturnValue({ deployments: [], isLoading: false })
    mockUseDeploymentIssues.mockReturnValue({ issues: [], isLoading: false })
    mockUsePVCs.mockReturnValue({ pvcs: [], isLoading: false })
    mockUseServices.mockReturnValue({ services: [], isLoading: false })
    mockUseEvents.mockReturnValue({ events: [], isLoading: false })
    mockUseWarningEvents.mockReturnValue({ events: [], isLoading: false })
    mockUseSecurityIssues.mockReturnValue({ issues: [], isLoading: false })
    mockUseHelmReleases.mockReturnValue({ releases: [], isLoading: false })
    mockUseOperatorSubscriptions.mockReturnValue({ subscriptions: [], isLoading: false })
    mockUseOperators.mockReturnValue({ operators: [], isLoading: false })
    mockUseGPUNodes.mockReturnValue({ nodes: [], isLoading: false })
    mockUseAlerts.mockReturnValue({ alerts: [], stats: undefined as never, isLoading: false })
    mockUseAlertRules.mockReturnValue({ rules: [], isLoading: false })
  })

  // ════════════════════════════════════════════════════════════════
  // Hook shape & loading state
  // ════════════════════════════════════════════════════════════════

  it('returns expected shape with getStatValue, isLoading, and clusters', () => {
    const { result } = renderHook(() => useUniversalStats())
    expect(result.current).toHaveProperty('getStatValue')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('clusters')
    expect(typeof result.current.getStatValue).toBe('function')
  })

  it('propagates isLoading from useClusters', () => {
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [], clusters: [], isLoading: true })
    const { result } = renderHook(() => useUniversalStats())
    expect(result.current.isLoading).toBe(true)
  })

  it('returns safeClusters array (deduplicatedClusters) as clusters', () => {
    const clusters = [makeCluster({ name: 'a' }), makeCluster({ name: 'b' })]
    mockUseClusters.mockReturnValue({ deduplicatedClusters: clusters, clusters, isLoading: false })
    const { result } = renderHook(() => useUniversalStats())
    expect(result.current.clusters).toHaveLength(2)
  })

  // ════════════════════════════════════════════════════════════════
  // Unknown block ID returns undefined
  // ════════════════════════════════════════════════════════════════

  it('returns undefined for unknown block IDs', () => {
    expect(getStatValue('nonexistent_stat_id')).toBeUndefined()
    expect(getStatValue('')).toBeUndefined()
  })

  // ════════════════════════════════════════════════════════════════
  // Empty / null-safe data handling
  // ════════════════════════════════════════════════════════════════

  describe('empty / null-safe data handling', () => {
    it('handles null deduplicatedClusters gracefully', () => {
      mockUseClusters.mockReturnValue({ deduplicatedClusters: null as any, clusters: [], isLoading: false })
      const stat = getStatValue('clusters')
      expect(stat?.value).toBe(0)
    })

    it('handles undefined issues from usePodIssues', () => {
      mockUsePodIssues.mockReturnValue({ issues: undefined as never, isLoading: false })
      expect(getStatValue('pod_issues')?.value).toBe(0)
    })

    it('handles undefined deployments', () => {
      mockUseDeployments.mockReturnValue({ deployments: undefined as never, isLoading: false })
      expect(getStatValue('deployments')?.value).toBe(0)
    })

    it('handles undefined pvcs', () => {
      mockUsePVCs.mockReturnValue({ pvcs: undefined as never, isLoading: false })
      expect(getStatValue('pvcs')?.value).toBe(0)
    })

    it('handles undefined services', () => {
      mockUseServices.mockReturnValue({ services: undefined as never, isLoading: false })
      expect(getStatValue('services')?.value).toBe(0)
    })

    it('handles undefined events', () => {
      mockUseEvents.mockReturnValue({ events: undefined as never, isLoading: false })
      expect(getStatValue('normal')?.value).toBe(0)
    })

    it('handles undefined warning events', () => {
      mockUseWarningEvents.mockReturnValue({ events: undefined as never, isLoading: false })
      expect(getStatValue('warning')?.value).toBe(0)
    })

    it('handles undefined security issues', () => {
      mockUseSecurityIssues.mockReturnValue({ issues: undefined as never, isLoading: false })
      expect(getStatValue('high')?.value).toBe(0)
    })

    it('handles undefined helm releases', () => {
      mockUseHelmReleases.mockReturnValue({ releases: undefined as never, isLoading: false })
      expect(getStatValue('helm')?.value).toBe(0)
    })

    it('handles undefined operators', () => {
      mockUseOperators.mockReturnValue({ operators: undefined as never, isLoading: false })
      expect(getStatValue('operators')?.value).toBe(0)
    })

    it('handles undefined operator subscriptions', () => {
      mockUseOperatorSubscriptions.mockReturnValue({ subscriptions: undefined as never, isLoading: false })
      expect(getStatValue('subscriptions')?.value).toBe(0)
    })

    it('handles undefined GPU nodes', () => {
      mockUseGPUNodes.mockReturnValue({ nodes: undefined as never, isLoading: false })
      expect(getStatValue('gpus')?.value).toBe(0)
    })

    it('handles undefined alert stats', () => {
      mockUseAlerts.mockReturnValue({ alerts: [], stats: undefined as never, isLoading: false })
      expect(getStatValue('firing')?.value).toBe(0)
      expect(getStatValue('resolved')?.value).toBe(0)
    })

    it('handles undefined alert rules', () => {
      mockUseAlertRules.mockReturnValue({ rules: undefined as never, isLoading: false })
      expect(getStatValue('rules_enabled')?.value).toBe(0)
      expect(getStatValue('rules_disabled')?.value).toBe(0)
    })

    it('returns 0 for all cluster-derived stats when clusters is empty', () => {
      expect(getStatValue('clusters')?.value).toBe(0)
      expect(getStatValue('healthy')?.value).toBe(0)
      expect(getStatValue('unhealthy')?.value).toBe(0)
      expect(getStatValue('unreachable')?.value).toBe(0)
      expect(getStatValue('nodes')?.value).toBe(0)
      expect(getStatValue('pods')?.value).toBe(0)
      expect(getStatValue('cpus')?.value).toBe(0)
      expect(getStatValue('namespaces')?.value).toBe(0)
    })

    it('handles clusters with missing optional fields (nodeCount, podCount, etc.)', () => {
      mockUseClusters.mockReturnValue({
        deduplicatedClusters: [{ name: 'bare', healthy: true, reachable: true }],
        clusters: [],
        isLoading: false,
      })
      expect(getStatValue('nodes')?.value).toBe(0)
      expect(getStatValue('pods')?.value).toBe(0)
      expect(getStatValue('cpus')?.value).toBe(0)
      expect(getStatValue('memory')?.value).toBe('0 GB')
      expect(getStatValue('storage')?.value).toBe('0 GB')
    })

    it('handles clusters with missing namespaces array', () => {
      mockUseClusters.mockReturnValue({
        deduplicatedClusters: [{ name: 'no-ns', healthy: true, reachable: true }],
        clusters: [],
        isLoading: false,
      })
      expect(getStatValue('namespaces')?.value).toBe(0)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // Cluster stat computations
  // ════════════════════════════════════════════════════════════════

  describe('cluster stats', () => {
    const twoClusters = [
      makeCluster({ name: 'c1', healthy: true, reachable: true, nodeCount: 5, podCount: 20, cpuCores: 16, memoryGB: 64, storageGB: 200, namespaces: ['default', 'monitoring'] }),
      makeCluster({ name: 'c2', healthy: false, reachable: false, nodeCount: 2, podCount: 8, cpuCores: 4, memoryGB: 16, storageGB: 50, namespaces: ['default', 'prod'] }),
    ]

    beforeEach(() => {
      mockUseClusters.mockReturnValue({ deduplicatedClusters: twoClusters, clusters: twoClusters, isLoading: false })
    })

    it('counts total clusters', () => {
      expect(getStatValue('clusters')?.value).toBe(2)
      expect(getStatValue('clusters')?.sublabel).toBe('total clusters')
    })

    it('counts healthy clusters', () => {
      expect(getStatValue('healthy')?.value).toBe(1)
    })

    it('counts only explicitly unhealthy clusters', () => {
      expect(getStatValue('unhealthy')?.value).toBe(0)
    })

    it('counts unreachable clusters', () => {
      expect(getStatValue('unreachable')?.value).toBe(1)
      expect(getStatValue('unreachable')?.sublabel).toBe('offline')
    })

    it('counts confirmed errorType failures as unreachable even before reachable flips false', () => {
      mockUseClusters.mockReturnValue({
        deduplicatedClusters: [makeCluster({ name: 'c3', healthy: false, reachable: true, errorType: 'network' })],
        clusters: [makeCluster({ name: 'c3', healthy: false, reachable: true, errorType: 'network' })],
        isLoading: false,
      })

      expect(getStatValue('healthy')?.value).toBe(0)
      expect(getStatValue('unhealthy')?.value).toBe(0)
      expect(getStatValue('unreachable')?.value).toBe(1)
    })

    it('sums total nodes across clusters', () => {
      expect(getStatValue('nodes')?.value).toBe(7) // 5 + 2
    })

    it('sums total pods across clusters', () => {
      expect(getStatValue('pods')?.value).toBe(28) // 20 + 8
    })

    it('total_pods mirrors pods value', () => {
      expect(getStatValue('total_pods')?.value).toBe(28)
      expect(getStatValue('total_pods')?.sublabel).toBe('across all clusters')
    })

    it('sums total CPUs', () => {
      expect(getStatValue('cpus')?.value).toBe(20) // 16 + 4
    })

    it('formats memory as rounded GB string', () => {
      expect(getStatValue('memory')?.value).toBe('80 GB') // Math.round(64 + 16)
      expect(getStatValue('memory')?.sublabel).toBe('total memory')
    })

    it('formats storage as rounded GB string', () => {
      expect(getStatValue('storage')?.value).toBe('250 GB') // Math.round(200 + 50)
      expect(getStatValue('storage')?.sublabel).toBe('total storage')
    })

    it('de-duplicates namespaces across clusters', () => {
      // 'default' appears in both, so unique set is {default, monitoring, prod} = 3
      expect(getStatValue('namespaces')?.value).toBe(3)
    })

    it('marks clusters as clickable when > 0', () => {
      expect(getStatValue('clusters')?.isClickable).toBe(true)
    })

    it('marks clusters as not clickable when 0', () => {
      mockUseClusters.mockReturnValue({ deduplicatedClusters: [], clusters: [], isLoading: false })
      expect(getStatValue('clusters')?.isClickable).toBe(false)
    })

    it('marks unreachable as never clickable', () => {
      expect(getStatValue('unreachable')?.isClickable).toBe(false)
    })

    it('marks cpus as never clickable', () => {
      expect(getStatValue('cpus')?.isClickable).toBe(false)
    })

    it('marks memory and storage as never clickable', () => {
      expect(getStatValue('memory')?.isClickable).toBe(false)
      expect(getStatValue('storage')?.isClickable).toBe(false)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // Pod / Workload stats
  // ════════════════════════════════════════════════════════════════

  describe('pod and workload stats', () => {
    it('counts pod issues', () => {
      mockUsePodIssues.mockReturnValue({
        issues: [
          { status: 'Running', restarts: 0 },
          { status: 'Pending', restarts: 5 },
          { status: 'Pending', restarts: 0 },
        ],
        isLoading: false,
      })
      expect(getStatValue('pod_issues')?.value).toBe(3)
      expect(getStatValue('issues')?.value).toBe(3) // alias
    })

    it('counts pending pods', () => {
      mockUsePodIssues.mockReturnValue({
        issues: [
          { status: 'Pending', restarts: 0 },
          { status: 'Running', restarts: 0 },
          { status: 'Pending', restarts: 2 },
        ],
        isLoading: false,
      })
      expect(getStatValue('pending')?.value).toBe(2)
    })

    it('counts high-restart pods (restarts > 10)', () => {
      mockUsePodIssues.mockReturnValue({
        issues: [
          { status: 'Running', restarts: 11 }, // above threshold
          { status: 'Running', restarts: 10 }, // at threshold, NOT above
          { status: 'Running', restarts: 100 }, // way above
          { status: 'Running', restarts: 0 },
        ],
        isLoading: false,
      })
      expect(getStatValue('restarts')?.value).toBe(2) // 11 and 100
    })

    it('counts deployments', () => {
      mockUseDeployments.mockReturnValue({
        deployments: [{ name: 'd1' }, { name: 'd2' }, { name: 'd3' }],
        isLoading: false,
      })
      expect(getStatValue('deployments')?.value).toBe(3)
    })

    it('counts deployment issues', () => {
      mockUseDeploymentIssues.mockReturnValue({
        issues: [{ name: 'issue1' }],
        isLoading: false,
      })
      expect(getStatValue('deployment_issues')?.value).toBe(1)
      expect(getStatValue('critical')?.value).toBe(1) // critical mirrors deployment issues
    })
  })

  // ════════════════════════════════════════════════════════════════
  // Storage stats (PVC)
  // ════════════════════════════════════════════════════════════════

  describe('storage stats', () => {
    beforeEach(() => {
      mockUsePVCs.mockReturnValue({
        pvcs: [
          { status: 'Bound', storageClass: 'gp3' },
          { status: 'Bound', storageClass: 'gp3' },
          { status: 'Pending', storageClass: 'standard' },
          { status: 'Bound', storageClass: null }, // no storage class
        ],
        isLoading: false,
      })
    })

    it('counts total PVCs', () => {
      expect(getStatValue('pvcs')?.value).toBe(4)
    })

    it('counts bound PVCs', () => {
      expect(getStatValue('bound')?.value).toBe(3)
    })

    it('counts unique storage classes, filtering null/undefined', () => {
      expect(getStatValue('storage_classes')?.value).toBe(2) // gp3, standard
    })

    it('ephemeral shows totalStorageGB from clusters', () => {
      mockUseClusters.mockReturnValue({
        deduplicatedClusters: [makeCluster({ storageGB: 512.7 })],
        clusters: [],
        isLoading: false,
      })
      expect(getStatValue('ephemeral')?.value).toBe('513') // Math.round(512.7)
      expect(getStatValue('ephemeral')?.sublabel).toBe('GB allocatable')
      expect(getStatValue('ephemeral')?.isClickable).toBe(true) // always clickable
    })

    it('pvcs not clickable when 0', () => {
      mockUsePVCs.mockReturnValue({ pvcs: [], isLoading: false })
      expect(getStatValue('pvcs')?.isClickable).toBe(false)
    })

    it('bound is never clickable', () => {
      expect(getStatValue('bound')?.isClickable).toBe(false)
    })

    it('storage_classes is never clickable', () => {
      expect(getStatValue('storage_classes')?.isClickable).toBe(false)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // Network / Service stats
  // ════════════════════════════════════════════════════════════════

  describe('network stats', () => {
    beforeEach(() => {
      mockUseServices.mockReturnValue({
        services: [
          { type: 'LoadBalancer' },
          { type: 'LoadBalancer' },
          { type: 'NodePort' },
          { type: 'ClusterIP' },
          { type: 'ClusterIP' },
          { type: 'ClusterIP' },
        ],
        isLoading: false,
      })
    })

    it('counts total services', () => {
      expect(getStatValue('services')?.value).toBe(6)
    })

    it('counts load balancers', () => {
      expect(getStatValue('loadbalancers')?.value).toBe(2)
      expect(getStatValue('loadbalancers')?.sublabel).toBe('external access')
    })

    it('counts NodePort services', () => {
      expect(getStatValue('nodeport')?.value).toBe(1)
    })

    it('counts ClusterIP services', () => {
      expect(getStatValue('clusterip')?.value).toBe(3)
    })

    it('returns ingress count from useIngresses hook', () => {
      mockUseIngresses.mockReturnValue({ ingresses: [{ name: 'ing-1' }, { name: 'ing-2' }], isLoading: false })
      expect(getStatValue('ingresses')?.value).toBe(2)
    })

    it('returns zero ingresses when none exist', () => {
      mockUseIngresses.mockReturnValue({ ingresses: [], isLoading: false })
      expect(getStatValue('ingresses')?.value).toBe(0)
    })

    it('endpoints sums service endpoint counts', () => {
      mockUseServices.mockReturnValue({
        services: [
          { type: 'ClusterIP', endpoints: 3 },
          { type: 'ClusterIP', endpoints: 2 },
          { type: 'NodePort', endpoints: 1 },
        ],
        isLoading: false,
      })
      expect(getStatValue('endpoints')?.value).toBe(6)
    })

    it('sets isClickable=false for service types with 0 count', () => {
      mockUseServices.mockReturnValue({ services: [], isLoading: false })
      expect(getStatValue('loadbalancers')?.isClickable).toBe(false)
      expect(getStatValue('nodeport')?.isClickable).toBe(false)
      expect(getStatValue('clusterip')?.isClickable).toBe(false)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // Security stats
  // ════════════════════════════════════════════════════════════════

  describe('security stats', () => {
    beforeEach(() => {
      mockUseSecurityIssues.mockReturnValue({
        issues: [
          { severity: 'high', issue: 'Running as root user' },
          { severity: 'high', issue: 'Privileged container detected' },
          { severity: 'medium', issue: 'Missing network policy' },
          { severity: 'low', issue: 'Default service account used' },
          { severity: 'low', issue: 'Root filesystem writable' },
        ],
        isLoading: false,
      })
    })

    it('counts high severity issues', () => {
      expect(getStatValue('high')?.value).toBe(2)
    })

    it('counts medium severity issues', () => {
      expect(getStatValue('medium')?.value).toBe(1)
    })

    it('counts low severity issues', () => {
      expect(getStatValue('low')?.value).toBe(2)
    })

    it('counts privileged containers (case-insensitive match on "privileged")', () => {
      expect(getStatValue('privileged')?.value).toBe(1)
    })

    it('counts root containers (case-insensitive match on "root")', () => {
      // Two issues contain "root": "Running as root user" and "Root filesystem writable"
      expect(getStatValue('root')?.value).toBe(2)
    })

    it('handles issues with null/undefined issue text (privileged/root detection)', () => {
      mockUseSecurityIssues.mockReturnValue({
        issues: [
          { severity: 'high', issue: undefined },
          { severity: 'medium', issue: null },
        ],
        isLoading: false,
      })
      // Should not throw and should count 0
      expect(getStatValue('privileged')?.value).toBe(0)
      expect(getStatValue('root')?.value).toBe(0)
    })

    it('sets isClickable based on count > 0', () => {
      expect(getStatValue('high')?.isClickable).toBe(true)
      mockUseSecurityIssues.mockReturnValue({ issues: [], isLoading: false })
      expect(getStatValue('high')?.isClickable).toBe(false)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // Helm / GitOps stats
  // ════════════════════════════════════════════════════════════════

  describe('helm / gitops stats', () => {
    beforeEach(() => {
      mockUseHelmReleases.mockReturnValue({
        releases: [
          { status: 'deployed' },
          { status: 'deployed' },
          { status: 'failed' },
          { status: 'pending-install' },
        ],
        isLoading: false,
      })
    })

    it('counts total helm releases', () => {
      expect(getStatValue('helm')?.value).toBe(4)
    })

    it('counts deployed (synced) releases', () => {
      expect(getStatValue('deployed')?.value).toBe(2)
    })

    it('counts failed (drifted) releases', () => {
      expect(getStatValue('failed')?.value).toBe(1)
    })

    it('calculates "other" as total - deployed - failed, min 0', () => {
      expect(getStatValue('other')?.value).toBe(1) // 4 - 2 - 1
    })

    it('kustomize always returns 0', () => {
      expect(getStatValue('kustomize')?.value).toBe(0)
    })

    it('other is never negative (Math.max with 0)', () => {
      mockUseHelmReleases.mockReturnValue({
        releases: [
          { status: 'deployed' },
          { status: 'failed' },
        ],
        isLoading: false,
      })
      // 2 total, 1 deployed, 1 failed => other = 0
      expect(getStatValue('other')?.value).toBe(0)
    })

    it('other is not clickable', () => {
      expect(getStatValue('other')?.isClickable).toBe(false)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // Event stats
  // ════════════════════════════════════════════════════════════════

  describe('event stats', () => {
    it('counts total events', () => {
      mockUseEvents.mockReturnValue({
        events: [{ type: 'Normal' }, { type: 'Warning' }, { type: 'Normal' }],
        isLoading: false,
      })
      expect(getStatValue('total')?.value).toBe(3)
      expect(getStatValue('total')?.sublabel).toBe('total events')
    })

    it('falls back to totalClusters when events are empty', () => {
      mockUseClusters.mockReturnValue({
        deduplicatedClusters: [makeCluster(), makeCluster({ name: 'c2' })],
        clusters: [],
        isLoading: false,
      })
      mockUseEvents.mockReturnValue({ events: [], isLoading: false })
      const stat = getStatValue('total')
      expect(stat?.value).toBe(2)
      expect(stat?.sublabel).toBe('items')
      expect(stat?.isClickable).toBe(false)
    })

    it('total onClick is undefined when events is empty', () => {
      mockUseEvents.mockReturnValue({ events: [], isLoading: false })
      const stat = getStatValue('total')
      expect(stat?.onClick).toBeUndefined()
    })

    it('counts normal events', () => {
      mockUseEvents.mockReturnValue({
        events: [{ type: 'Normal' }, { type: 'Warning' }, { type: 'Normal' }],
        isLoading: false,
      })
      expect(getStatValue('normal')?.value).toBe(2)
    })

    it('counts warning events', () => {
      mockUseWarningEvents.mockReturnValue({
        events: [{ type: 'Warning' }, { type: 'Warning' }],
        isLoading: false,
      })
      expect(getStatValue('warning')?.value).toBe(2)
      expect(getStatValue('warnings')?.value).toBe(2) // alias
    })

    it('counts recent events (last hour)', () => {
      const now = new Date()
      const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
      mockUseEvents.mockReturnValue({
        events: [
          { type: 'Normal', lastSeen: thirtyMinAgo },
          { type: 'Warning', lastSeen: twoHoursAgo },
          { type: 'Normal', lastSeen: now.toISOString() },
          { type: 'Normal', lastSeen: null }, // no lastSeen
        ],
        isLoading: false,
      })
      expect(getStatValue('recent')?.value).toBe(2) // 30 min ago and now
    })

    it('recent events: events with no lastSeen are excluded', () => {
      mockUseEvents.mockReturnValue({
        events: [{ type: 'Normal', lastSeen: undefined }],
        isLoading: false,
      })
      expect(getStatValue('recent')?.value).toBe(0)
    })

    it('errors stat mirrors unhealthy clusters count', () => {
      mockUseClusters.mockReturnValue({
        deduplicatedClusters: [makeCluster({ healthy: false }), makeCluster({ name: 'c2', healthy: true })],
        clusters: [],
        isLoading: false,
      })
      expect(getStatValue('errors')?.value).toBe(1)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // Operator stats
  // ════════════════════════════════════════════════════════════════

  describe('operator stats', () => {
    beforeEach(() => {
      mockUseOperators.mockReturnValue({
        operators: [
          { status: 'Succeeded' },
          { status: 'Succeeded' },
          { status: 'Installing' },
          { status: 'Failed' },
        ],
        isLoading: false,
      })
      mockUseOperatorSubscriptions.mockReturnValue({
        subscriptions: [
          { pendingUpgrade: true },
          { pendingUpgrade: false },
          { pendingUpgrade: true },
        ],
        isLoading: false,
      })
    })

    it('counts total operators', () => {
      expect(getStatValue('operators')?.value).toBe(4)
    })

    it('counts installed (Succeeded) operators', () => {
      expect(getStatValue('installed')?.value).toBe(2)
    })

    it('counts installing operators', () => {
      expect(getStatValue('installing')?.value).toBe(1)
    })

    it('counts failing operators', () => {
      expect(getStatValue('failing')?.value).toBe(1)
    })

    it('counts subscriptions with pending upgrades', () => {
      expect(getStatValue('upgrades')?.value).toBe(2)
    })

    it('counts total subscriptions', () => {
      expect(getStatValue('subscriptions')?.value).toBe(3)
    })

    it('crds always returns 0', () => {
      expect(getStatValue('crds')?.value).toBe(0)
    })

    it('installing is not clickable', () => {
      expect(getStatValue('installing')?.isClickable).toBe(false)
    })

    it('upgrades is not clickable', () => {
      expect(getStatValue('upgrades')?.isClickable).toBe(false)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // GPU stats
  // ════════════════════════════════════════════════════════════════

  describe('GPU stats', () => {
    it('sums GPU counts from reachable clusters only', () => {
      mockUseClusters.mockReturnValue({
        deduplicatedClusters: [
          makeCluster({ name: 'reachable-cluster', reachable: true }),
          makeCluster({ name: 'offline-cluster', reachable: false }),
        ],
        clusters: [],
        isLoading: false,
      })
      mockUseGPUNodes.mockReturnValue({
        nodes: [
          { cluster: 'reachable-cluster', gpuCount: 4 },
          { cluster: 'offline-cluster', gpuCount: 8 },  // excluded
          { cluster: 'reachable-cluster', gpuCount: 2 },
        ],
        isLoading: false,
      })
      expect(getStatValue('gpus')?.value).toBe(6) // 4 + 2 (offline excluded)
    })

    it('handles GPU nodes with missing gpuCount', () => {
      mockUseClusters.mockReturnValue({
        deduplicatedClusters: [makeCluster({ name: 'c1', reachable: true })],
        clusters: [],
        isLoading: false,
      })
      mockUseGPUNodes.mockReturnValue({
        nodes: [{ cluster: 'c1', gpuCount: undefined }],
        isLoading: false,
      })
      expect(getStatValue('gpus')?.value).toBe(0)
    })

    it('gpus is clickable when count > 0', () => {
      mockUseClusters.mockReturnValue({
        deduplicatedClusters: [makeCluster({ name: 'c1', reachable: true })],
        clusters: [],
        isLoading: false,
      })
      mockUseGPUNodes.mockReturnValue({
        nodes: [{ cluster: 'c1', gpuCount: 2 }],
        isLoading: false,
      })
      expect(getStatValue('gpus')?.isClickable).toBe(true)
    })

    it('gpus is not clickable when count is 0', () => {
      expect(getStatValue('gpus')?.isClickable).toBe(false)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // Alert stats
  // ════════════════════════════════════════════════════════════════

  describe('alert stats', () => {
    beforeEach(() => {
      mockUseAlerts.mockReturnValue({
        alerts: [],
        stats: { firing: 5, resolved: 12 },
        isLoading: false,
      })
      mockUseAlertRules.mockReturnValue({
        rules: [
          { enabled: true },
          { enabled: true },
          { enabled: false },
        ],
        isLoading: false,
      })
    })

    it('counts firing alerts', () => {
      expect(getStatValue('firing')?.value).toBe(5)
    })

    it('alerts_firing is an alias for firing', () => {
      expect(getStatValue('alerts_firing')?.value).toBe(5)
    })

    it('counts resolved alerts', () => {
      expect(getStatValue('resolved')?.value).toBe(12)
    })

    it('counts enabled rules', () => {
      expect(getStatValue('rules_enabled')?.value).toBe(2)
    })

    it('counts disabled rules', () => {
      expect(getStatValue('rules_disabled')?.value).toBe(1)
    })

    it('firing is clickable when > 0, not clickable when 0', () => {
      expect(getStatValue('firing')?.isClickable).toBe(true)
      mockUseAlerts.mockReturnValue({ alerts: [], stats: { firing: 0, resolved: 0 }, isLoading: false })
      expect(getStatValue('firing')?.isClickable).toBe(false)
    })

    it('resolved is never clickable', () => {
      expect(getStatValue('resolved')?.isClickable).toBe(false)
    })

    it('rules_enabled and rules_disabled are never clickable', () => {
      expect(getStatValue('rules_enabled')?.isClickable).toBe(false)
      expect(getStatValue('rules_disabled')?.isClickable).toBe(false)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // Cost estimation stats
  // ════════════════════════════════════════════════════════════════

  describe('cost estimation stats', () => {
    const COST_PER_CPU = 30
    const COST_PER_GB_MEMORY = 4
    const COST_PER_GB_STORAGE = 0.10
    const COST_PER_GPU = 900

    it('computes total cost from cluster resources and GPU nodes', () => {
      mockUseClusters.mockReturnValue({
        deduplicatedClusters: [makeCluster({ cpuCores: 10, memoryGB: 64, storageGB: 500, reachable: true, name: 'c1' })],
        clusters: [],
        isLoading: false,
      })
      mockUseGPUNodes.mockReturnValue({
        nodes: [{ cluster: 'c1', gpuCount: 2 }],
        isLoading: false,
      })

      const expectedCPU = 10 * COST_PER_CPU          // 300
      const expectedMem = 64 * COST_PER_GB_MEMORY     // 256
      const expectedStor = 500 * COST_PER_GB_STORAGE   // 50
      const expectedGPU = 2 * COST_PER_GPU             // 1800
      const expectedTotal = expectedCPU + expectedMem + expectedStor + expectedGPU // 2406

      const totalCostStat = getStatValue('total_cost')
      expect(totalCostStat?.value).toBe(`$${Math.round(expectedTotal).toLocaleString()}`)
      expect(totalCostStat?.isDemo).toBe(true)
    })

    it('computes individual cost breakdowns', () => {
      mockUseClusters.mockReturnValue({
        deduplicatedClusters: [makeCluster({ cpuCores: 4, memoryGB: 16, storageGB: 100, reachable: true, name: 'c1' })],
        clusters: [],
        isLoading: false,
      })

      expect(getStatValue('cpu_cost')?.value).toBe(`$${Math.round(4 * COST_PER_CPU).toLocaleString()}`)
      expect(getStatValue('memory_cost')?.value).toBe(`$${Math.round(16 * COST_PER_GB_MEMORY).toLocaleString()}`)
      expect(getStatValue('storage_cost')?.value).toBe(`$${Math.round(100 * COST_PER_GB_STORAGE).toLocaleString()}`)
      expect(getStatValue('network_cost')?.value).toBe('$0')
    })

    it('gpu_cost computes from reachable GPU nodes only', () => {
      mockUseClusters.mockReturnValue({
        deduplicatedClusters: [
          makeCluster({ name: 'reachable', reachable: true }),
          makeCluster({ name: 'offline', reachable: false }),
        ],
        clusters: [],
        isLoading: false,
      })
      mockUseGPUNodes.mockReturnValue({
        nodes: [
          { cluster: 'reachable', gpuCount: 3 },
          { cluster: 'offline', gpuCount: 10 },
        ],
        isLoading: false,
      })
      expect(getStatValue('gpu_cost')?.value).toBe(`$${Math.round(3 * COST_PER_GPU).toLocaleString()}`)
    })

    it('all cost stats are flagged as isDemo', () => {
      const costBlocks = ['total_cost', 'cpu_cost', 'memory_cost', 'storage_cost', 'network_cost', 'gpu_cost']
      for (const id of costBlocks) {
        expect(getStatValue(id)?.isDemo).toBe(true)
      }
    })

    it('all cost stats are not clickable', () => {
      const costBlocks = ['total_cost', 'cpu_cost', 'memory_cost', 'storage_cost', 'network_cost', 'gpu_cost']
      for (const id of costBlocks) {
        expect(getStatValue(id)?.isClickable).toBe(false)
      }
    })

    it('returns $0 costs when no clusters exist', () => {
      expect(getStatValue('total_cost')?.value).toBe('$0')
      expect(getStatValue('cpu_cost')?.value).toBe('$0')
      expect(getStatValue('memory_cost')?.value).toBe('$0')
      expect(getStatValue('storage_cost')?.value).toBe('$0')
      expect(getStatValue('gpu_cost')?.value).toBe('$0')
    })
  })

  // ════════════════════════════════════════════════════════════════
  // Compute stats (placeholder values)
  // ════════════════════════════════════════════════════════════════

  describe('compute stats', () => {
    it('cpu_util returns dash (not implemented)', () => {
      expect(getStatValue('cpu_util')?.value).toBe('-')
    })

    it('memory_util returns dash (not implemented)', () => {
      expect(getStatValue('memory_util')?.value).toBe('-')
    })

    it('tpus returns 0', () => {
      expect(getStatValue('tpus')?.value).toBe(0)
    })
  })

  // ════════════════════════════════════════════════════════════════
  // Compliance / Demo data stats
  // ════════════════════════════════════════════════════════════════

  describe('compliance stats (demo data)', () => {
    const complianceStats = [
      { id: 'score', expectedValue: '87%' },
      { id: 'total_checks', expectedValue: 156 },
      { id: 'checks_passing', expectedValue: 136 },
      { id: 'checks_failing', expectedValue: 20 },
      { id: 'gatekeeper_violations', expectedValue: 8 },
      { id: 'kyverno_violations', expectedValue: 5 },
      { id: 'kubescape_score', expectedValue: '82%' },
      { id: 'falco_alerts', expectedValue: 3 },
      { id: 'trivy_vulns', expectedValue: 42 },
      { id: 'critical_vulns', expectedValue: 2 },
      { id: 'high_vulns', expectedValue: 11 },
      { id: 'cis_score', expectedValue: '78%' },
      { id: 'nsa_score', expectedValue: '85%' },
      { id: 'pci_score', expectedValue: '91%' },
    ]

    for (const { id, expectedValue } of complianceStats) {
      it(`${id} returns demo value ${expectedValue}`, () => {
        const stat = getStatValue(id)
        expect(stat?.value).toBe(expectedValue)
        expect(stat?.isDemo).toBe(true)
        expect(stat?.isClickable).toBe(false)
      })
    }
  })

  // ════════════════════════════════════════════════════════════════
  // Data compliance stats (demo data)
  // ════════════════════════════════════════════════════════════════

  describe('data compliance stats (demo data)', () => {
    const dataComplianceStats = [
      { id: 'encryption_score', expectedValue: '92%' },
      { id: 'encrypted_secrets', expectedValue: 184 },
      { id: 'unencrypted_secrets', expectedValue: 12 },
      { id: 'regions_compliant', expectedValue: '4/5' },
      { id: 'rbac_policies', expectedValue: 47 },
      { id: 'excessive_permissions', expectedValue: 8 },
      { id: 'pii_detected', expectedValue: 23 },
      { id: 'pii_protected', expectedValue: 19 },
      { id: 'audit_enabled', expectedValue: '3/4' },
      { id: 'retention_days', expectedValue: 90 },
      { id: 'gdpr_score', expectedValue: '88%' },
      { id: 'hipaa_score', expectedValue: '76%' },
      { id: 'soc2_score', expectedValue: '83%' },
    ]

    for (const { id, expectedValue } of dataComplianceStats) {
      it(`${id} returns demo value ${expectedValue}`, () => {
        const stat = getStatValue(id)
        expect(stat?.value).toBe(expectedValue)
        expect(stat?.isDemo).toBe(true)
        expect(stat?.isClickable).toBe(false)
      })
    }
  })

  // ════════════════════════════════════════════════════════════════
  // Multi-tenancy stats (demo data)
  // ════════════════════════════════════════════════════════════════

  describe('multi-tenancy stats (demo data)', () => {
    const multiTenancyStats = [
      { id: 'tenants', expectedValue: 4 },
      { id: 'isolation_score', expectedValue: '67%' },
      { id: 'control_planes', expectedValue: 3 },
      { id: 'vms', expectedValue: 2 },
      { id: 'udn_networks', expectedValue: 5 },
      { id: 'components', expectedValue: '75%' },
    ]

    for (const { id, expectedValue } of multiTenancyStats) {
      it(`${id} returns demo value ${expectedValue}`, () => {
        const stat = getStatValue(id)
        expect(stat?.value).toBe(expectedValue)
        expect(stat?.isDemo).toBe(true)
        expect(stat?.isClickable).toBe(false)
      })
    }
  })

  // ════════════════════════════════════════════════════════════════
  // Drill-down action wiring
  // ════════════════════════════════════════════════════════════════

  describe('drill-down action wiring', () => {
    beforeEach(() => {
      // Provide data so isClickable is true and onClick is assigned
      mockUseClusters.mockReturnValue({
        deduplicatedClusters: [
          makeCluster({ name: 'c1', healthy: true, reachable: true }),
          makeCluster({ name: 'c2', healthy: false, reachable: true }),
        ],
        clusters: [],
        isLoading: false,
      })
      mockUsePodIssues.mockReturnValue({ issues: [{ status: 'Pending', restarts: 15 }], isLoading: false })
      mockUseDeployments.mockReturnValue({ deployments: [{ name: 'd1' }], isLoading: false })
      mockUseDeploymentIssues.mockReturnValue({ issues: [{ name: 'i1' }], isLoading: false })
      mockUseServices.mockReturnValue({
        services: [
          { type: 'LoadBalancer' },
          { type: 'NodePort' },
          { type: 'ClusterIP' },
        ],
        isLoading: false,
      })
      mockUseEvents.mockReturnValue({ events: [{ type: 'Normal' }], isLoading: false })
      mockUseWarningEvents.mockReturnValue({ events: [{ type: 'Warning' }], isLoading: false })
      mockUseSecurityIssues.mockReturnValue({
        issues: [
          { severity: 'high', issue: 'privileged container' },
          { severity: 'medium', issue: 'running as root' },
          { severity: 'low', issue: 'something low' },
        ],
        isLoading: false,
      })
      mockUseHelmReleases.mockReturnValue({
        releases: [{ status: 'deployed' }, { status: 'failed' }],
        isLoading: false,
      })
      mockUseOperators.mockReturnValue({
        operators: [{ status: 'Succeeded' }, { status: 'Failed' }],
        isLoading: false,
      })
      mockUseGPUNodes.mockReturnValue({
        nodes: [{ cluster: 'c1', gpuCount: 2 }],
        isLoading: false,
      })
      mockUseAlerts.mockReturnValue({
        alerts: [],
        stats: { firing: 3, resolved: 1 },
        isLoading: false,
      })
      mockUsePVCs.mockReturnValue({ pvcs: [{ status: 'Bound', storageClass: 'gp3' }], isLoading: false })
    })

    it('clusters onClick calls drillToAllClusters()', () => {
      const stat = getStatValue('clusters')
      stat?.onClick?.()
      expect(mockDrillToAllClusters).toHaveBeenCalledWith()
    })

    it('healthy onClick calls drillToAllClusters("healthy")', () => {
      const stat = getStatValue('healthy')
      stat?.onClick?.()
      expect(mockDrillToAllClusters).toHaveBeenCalledWith('healthy')
    })

    it('unhealthy onClick calls drillToAllClusters("unhealthy")', () => {
      const stat = getStatValue('unhealthy')
      stat?.onClick?.()
      expect(mockDrillToAllClusters).toHaveBeenCalledWith('unhealthy')
    })

    it('nodes onClick calls drillToAllNodes()', () => {
      const stat = getStatValue('nodes')
      stat?.onClick?.()
      expect(mockDrillToAllNodes).toHaveBeenCalled()
    })

    it('pods onClick calls drillToAllPods()', () => {
      const stat = getStatValue('pods')
      stat?.onClick?.()
      expect(mockDrillToAllPods).toHaveBeenCalledWith()
    })

    it('pod_issues onClick calls drillToAllPods("issues")', () => {
      const stat = getStatValue('pod_issues')
      stat?.onClick?.()
      expect(mockDrillToAllPods).toHaveBeenCalledWith('issues')
    })

    it('pending onClick calls drillToAllPods("pending")', () => {
      const stat = getStatValue('pending')
      stat?.onClick?.()
      expect(mockDrillToAllPods).toHaveBeenCalledWith('pending')
    })

    it('restarts onClick calls drillToAllPods("restarts")', () => {
      const stat = getStatValue('restarts')
      stat?.onClick?.()
      expect(mockDrillToAllPods).toHaveBeenCalledWith('restarts')
    })

    it('deployments onClick calls drillToAllDeployments()', () => {
      const stat = getStatValue('deployments')
      stat?.onClick?.()
      expect(mockDrillToAllDeployments).toHaveBeenCalledWith()
    })

    it('deployment_issues onClick calls drillToAllDeployments("issues")', () => {
      const stat = getStatValue('deployment_issues')
      stat?.onClick?.()
      expect(mockDrillToAllDeployments).toHaveBeenCalledWith('issues')
    })

    it('services onClick calls drillToAllServices()', () => {
      const stat = getStatValue('services')
      stat?.onClick?.()
      expect(mockDrillToAllServices).toHaveBeenCalledWith()
    })

    it('loadbalancers onClick calls drillToAllServices("LoadBalancer")', () => {
      const stat = getStatValue('loadbalancers')
      stat?.onClick?.()
      expect(mockDrillToAllServices).toHaveBeenCalledWith('LoadBalancer')
    })

    it('nodeport onClick calls drillToAllServices("NodePort")', () => {
      const stat = getStatValue('nodeport')
      stat?.onClick?.()
      expect(mockDrillToAllServices).toHaveBeenCalledWith('NodePort')
    })

    it('clusterip onClick calls drillToAllServices("ClusterIP")', () => {
      const stat = getStatValue('clusterip')
      stat?.onClick?.()
      expect(mockDrillToAllServices).toHaveBeenCalledWith('ClusterIP')
    })

    it('total onClick calls drillToAllEvents() when events exist', () => {
      const stat = getStatValue('total')
      stat?.onClick?.()
      expect(mockDrillToAllEvents).toHaveBeenCalledWith()
    })

    it('normal onClick calls drillToAllEvents("Normal")', () => {
      const stat = getStatValue('normal')
      stat?.onClick?.()
      expect(mockDrillToAllEvents).toHaveBeenCalledWith('Normal')
    })

    it('warning onClick calls drillToAllEvents("warning")', () => {
      const stat = getStatValue('warning')
      stat?.onClick?.()
      expect(mockDrillToAllEvents).toHaveBeenCalledWith('warning')
    })

    it('recent onClick calls drillToAllEvents()', () => {
      const now = new Date().toISOString()
      mockUseEvents.mockReturnValue({ events: [{ type: 'Normal', lastSeen: now }], isLoading: false })
      const stat = getStatValue('recent')
      stat?.onClick?.()
      expect(mockDrillToAllEvents).toHaveBeenCalledWith()
    })

    it('errors onClick calls drillToAllClusters("unhealthy")', () => {
      const stat = getStatValue('errors')
      stat?.onClick?.()
      expect(mockDrillToAllClusters).toHaveBeenCalledWith('unhealthy')
    })

    it('high onClick calls drillToAllSecurity("high")', () => {
      const stat = getStatValue('high')
      stat?.onClick?.()
      expect(mockDrillToAllSecurity).toHaveBeenCalledWith('high')
    })

    it('medium onClick calls drillToAllSecurity("medium")', () => {
      const stat = getStatValue('medium')
      stat?.onClick?.()
      expect(mockDrillToAllSecurity).toHaveBeenCalledWith('medium')
    })

    it('low onClick calls drillToAllSecurity("low")', () => {
      const stat = getStatValue('low')
      stat?.onClick?.()
      expect(mockDrillToAllSecurity).toHaveBeenCalledWith('low')
    })

    it('privileged onClick calls drillToAllSecurity("privileged")', () => {
      const stat = getStatValue('privileged')
      stat?.onClick?.()
      expect(mockDrillToAllSecurity).toHaveBeenCalledWith('privileged')
    })

    it('root onClick calls drillToAllSecurity("root")', () => {
      const stat = getStatValue('root')
      stat?.onClick?.()
      expect(mockDrillToAllSecurity).toHaveBeenCalledWith('root')
    })

    it('helm onClick calls drillToAllHelm()', () => {
      const stat = getStatValue('helm')
      stat?.onClick?.()
      expect(mockDrillToAllHelm).toHaveBeenCalledWith()
    })

    it('deployed onClick calls drillToAllHelm("deployed")', () => {
      const stat = getStatValue('deployed')
      stat?.onClick?.()
      expect(mockDrillToAllHelm).toHaveBeenCalledWith('deployed')
    })

    it('failed onClick calls drillToAllHelm("failed")', () => {
      const stat = getStatValue('failed')
      stat?.onClick?.()
      expect(mockDrillToAllHelm).toHaveBeenCalledWith('failed')
    })

    it('operators onClick calls drillToAllOperators()', () => {
      const stat = getStatValue('operators')
      stat?.onClick?.()
      expect(mockDrillToAllOperators).toHaveBeenCalledWith()
    })

    it('installed onClick calls drillToAllOperators("installed")', () => {
      const stat = getStatValue('installed')
      stat?.onClick?.()
      expect(mockDrillToAllOperators).toHaveBeenCalledWith('installed')
    })

    it('failing onClick calls drillToAllOperators("failed")', () => {
      const stat = getStatValue('failing')
      stat?.onClick?.()
      expect(mockDrillToAllOperators).toHaveBeenCalledWith('failed')
    })

    it('gpus onClick calls drillToAllGPU()', () => {
      const stat = getStatValue('gpus')
      stat?.onClick?.()
      expect(mockDrillToAllGPU).toHaveBeenCalled()
    })

    it('firing onClick calls drillToAllAlerts("firing")', () => {
      const stat = getStatValue('firing')
      stat?.onClick?.()
      expect(mockDrillToAllAlerts).toHaveBeenCalledWith('firing')
    })

    it('pvcs onClick calls drillToAllStorage()', () => {
      const stat = getStatValue('pvcs')
      stat?.onClick?.()
      expect(mockDrillToAllStorage).toHaveBeenCalled()
    })

    it('ephemeral onClick calls drillToAllStorage()', () => {
      const stat = getStatValue('ephemeral')
      stat?.onClick?.()
      expect(mockDrillToAllStorage).toHaveBeenCalled()
    })
  })

  // ════════════════════════════════════════════════════════════════
  // isClickable is false when count is 0
  // ════════════════════════════════════════════════════════════════

  describe('isClickable is false when count is 0 (empty data)', () => {
    // All mocks return empty by default from beforeEach
    const zeroClickableStats = [
      'clusters', 'healthy', 'unhealthy', 'nodes', 'pods', 'total_pods',
      'deployments', 'pod_issues', 'deployment_issues', 'issues', 'pending', 'restarts', 'critical',
      'warning', 'services', 'loadbalancers', 'nodeport', 'clusterip',
      'pvcs', 'high', 'medium', 'low', 'privileged', 'root',
      'helm', 'deployed', 'failed',
      'operators', 'installed', 'failing',
      'gpus', 'firing', 'alerts_firing',
      'normal', 'recent', 'errors', 'warnings',
    ]

    for (const id of zeroClickableStats) {
      it(`${id} is not clickable when data is empty`, () => {
        expect(getStatValue(id)?.isClickable).toBe(false)
      })
    }
  })

  // ════════════════════════════════════════════════════════════════
  // Sublabel correctness
  // ════════════════════════════════════════════════════════════════

  describe('sublabel correctness', () => {
    const expectedSublabels: Record<string, string> = {
      clusters: 'total clusters',
      healthy: 'healthy',
      unhealthy: 'unhealthy',
      unreachable: 'offline',
      nodes: 'total nodes',
      cpus: 'total CPUs',
      memory: 'total memory',
      storage: 'total storage',
      gpus: 'total GPUs',
      pods: 'total pods',
      total_pods: 'across all clusters',
      namespaces: 'namespaces',
      deployments: 'total',
      pod_issues: 'pod issues',
      deployment_issues: 'deploy issues',
      issues: 'pod issues',
      pending: 'pending pods',
      restarts: 'high restarts',
      critical: 'critical',
      pvcs: 'total PVCs',
      bound: 'bound',
      storage_classes: 'in use',
      ephemeral: 'GB allocatable',
      services: 'total services',
      loadbalancers: 'external access',
      nodeport: 'node-level access',
      clusterip: 'internal only',
      ingresses: 'ingresses',
      endpoints: 'endpoints',
      high: 'high severity',
      medium: 'medium',
      low: 'low',
      privileged: 'privileged',
      root: 'running as root',
      helm: 'helm releases',
      kustomize: 'kustomize apps',
      deployed: 'synced',
      failed: 'drifted',
      other: 'other',
      normal: 'normal events',
      recent: 'last hour',
      errors: 'errors',
      operators: 'total operators',
      installed: 'installed',
      installing: 'installing',
      failing: 'failing',
      upgrades: 'available',
      subscriptions: 'subscriptions',
      crds: 'CRDs',
      firing: 'firing',
      alerts_firing: 'firing',
      resolved: 'resolved',
      rules_enabled: 'enabled',
      rules_disabled: 'disabled',
      cpu_util: 'CPU utilization',
      memory_util: 'Memory utilization',
      tpus: 'total TPUs',
      total_cost: '/month est.',
      cpu_cost: 'CPU /mo',
      memory_cost: 'memory /mo',
      storage_cost: 'storage /mo',
      network_cost: 'network /mo',
      gpu_cost: 'GPU /mo',
    }

    for (const [id, expectedSublabel] of Object.entries(expectedSublabels)) {
      it(`${id} has sublabel "${expectedSublabel}"`, () => {
        expect(getStatValue(id)?.sublabel).toBe(expectedSublabel)
      })
    }
  })
})

