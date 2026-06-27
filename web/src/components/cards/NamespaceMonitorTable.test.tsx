import React from 'react'
/**
 * NamespaceMonitorTable — Vitest RTL (Issue #15726, Part of #4189).
 *
 * This file tests kube-system namespace filtering, expand/collapse,
 * namespace truncation, change-animation cleanup side effects,
 * resource action callbacks, loading state, and empty state.
 *
 * Run from web/:
 *   npx vitest run src/components/cards/NamespaceMonitorTable.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NamespaceMonitorTable } from './NamespaceMonitorTable'
import type { NamespaceData, ChangeType, ResourceType } from './NamespaceMonitor.types'
import type { ClusterInfo } from '../../hooks/useMCP'

// ---------------------------------------------------------------------------
// Constants — imported values used by the component under test
// ---------------------------------------------------------------------------
import { MAX_NAMESPACES_RENDERED_PER_CLUSTER } from './NamespaceMonitor.utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'prod-cluster',
    context: 'prod-cluster',
    healthy: true,
    nodeCount: 3,
    ...overrides,
  }
}

function makeNamespaceData(overrides: Partial<NamespaceData> = {}): NamespaceData {
  return {
    pods: [],
    deployments: [],
    services: [],
    configmaps: [],
    secrets: [],
    pvcs: [],
    jobs: [],
    hasIssues: false,
    ...overrides,
  }
}

/** Build default props for NamespaceMonitorTable. */
function buildProps(overrides: Partial<Parameters<typeof NamespaceMonitorTable>[0]> = {}) {
  return {
    filteredClusters: [makeCluster()],
    selectedCluster: 'prod-cluster',
    expandedClusters: new Set<string>(['prod-cluster']),
    expandedNamespaces: new Set<string>(),
    activeResourceTypes: new Set<ResourceType>(['pods', 'deployments', 'services', 'configmaps', 'secrets', 'pvcs', 'jobs']),
    getNamespaceData: vi.fn(() => new Map<string, NamespaceData>()),
    getResourceChange: vi.fn<Parameters<typeof NamespaceMonitorTable>[0]['getResourceChange']>(() => null),
    clearChangeAfterTimeout: vi.fn(),
    onToggleCluster: vi.fn(),
    onToggleNamespace: vi.fn(),
    onDrillToNamespace: vi.fn(),
    onDrillToResource: vi.fn(),
    onOpenResource: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NamespaceMonitorTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---- Scenario 1: kube-system filtering (active) ----

  describe('kube-system namespace filtering', () => {
    it('does NOT render kube-system or kube-public namespaces (system-namespace filtering)', () => {
      const namespaceData = new Map<string, NamespaceData>([
        ['default', makeNamespaceData()],
        ['kube-system', makeNamespaceData()],
        ['kube-public', makeNamespaceData()],
        ['kube-node-lease', makeNamespaceData()],
        ['my-app', makeNamespaceData()],
      ])

      const props = buildProps({
        getNamespaceData: vi.fn(() => namespaceData),
      })

      render(<NamespaceMonitorTable {...props} />)

      // User namespaces are visible
      expect(screen.getByText('default')).toBeInTheDocument()
      expect(screen.getByText('my-app')).toBeInTheDocument()

      // kube-* system namespaces are filtered out
      expect(screen.queryByText('kube-system')).not.toBeInTheDocument()
      expect(screen.queryByText('kube-public')).not.toBeInTheDocument()
      expect(screen.queryByText('kube-node-lease')).not.toBeInTheDocument()
    })

    it('also filters openshift and openshift-* namespaces', () => {
      const namespaceData = new Map<string, NamespaceData>([
        ['default', makeNamespaceData()],
        ['openshift', makeNamespaceData()],
        ['openshift-monitoring', makeNamespaceData()],
        ['openshift-apiserver', makeNamespaceData()],
      ])

      const props = buildProps({
        getNamespaceData: vi.fn(() => namespaceData),
      })

      render(<NamespaceMonitorTable {...props} />)

      expect(screen.getByText('default')).toBeInTheDocument()
      expect(screen.queryByText('openshift')).not.toBeInTheDocument()
      expect(screen.queryByText('openshift-monitoring')).not.toBeInTheDocument()
      expect(screen.queryByText('openshift-apiserver')).not.toBeInTheDocument()
    })
  })

  // ---- Scenario 2: Namespace truncation ----

  describe('namespace truncation', () => {
    it('shows truncation message when more namespaces than MAX_NAMESPACES_RENDERED_PER_CLUSTER', () => {
      const totalNamespaces = MAX_NAMESPACES_RENDERED_PER_CLUSTER + 5
      const namespaceData = new Map<string, NamespaceData>()
      for (let i = 0; i < totalNamespaces; i++) {
        namespaceData.set(`ns-${String(i).padStart(3, '0')}`, makeNamespaceData())
      }

      const props = buildProps({
        getNamespaceData: vi.fn(() => namespaceData),
      })

      render(<NamespaceMonitorTable {...props} />)

      // Truncation message: "+5 more namespaces not shown — use the search box to narrow down."
      expect(screen.getByText(/\+5 more namespace/)).toBeInTheDocument()
      expect(screen.getByText(/search box to narrow down/)).toBeInTheDocument()
    })

    it('does NOT show truncation message when namespaces are within the limit', () => {
      const namespaceData = new Map<string, NamespaceData>([
        ['default', makeNamespaceData()],
        ['my-app', makeNamespaceData()],
      ])

      const props = buildProps({
        getNamespaceData: vi.fn(() => namespaceData),
      })

      render(<NamespaceMonitorTable {...props} />)

      expect(screen.queryByText(/more namespace.*not shown/)).not.toBeInTheDocument()
    })
  })

  // ---- Scenario 3: Expand / collapse ----

  describe('expand and collapse', () => {
    it('shows namespaces when cluster is in expandedClusters set', () => {
      const namespaceData = new Map<string, NamespaceData>([
        ['default', makeNamespaceData()],
      ])

      const props = buildProps({
        expandedClusters: new Set(['prod-cluster']),
        getNamespaceData: vi.fn(() => namespaceData),
      })

      render(<NamespaceMonitorTable {...props} />)

      expect(screen.getByText('default')).toBeInTheDocument()
    })

    it('does NOT show namespaces when cluster is NOT in expandedClusters', () => {
      const namespaceData = new Map<string, NamespaceData>([
        ['default', makeNamespaceData()],
      ])

      const props = buildProps({
        expandedClusters: new Set<string>(), // collapsed
        getNamespaceData: vi.fn(() => namespaceData),
      })

      render(<NamespaceMonitorTable {...props} />)

      expect(screen.queryByText('default')).not.toBeInTheDocument()
    })

    it('calls onToggleCluster when cluster row is clicked', () => {
      const props = buildProps({
        expandedClusters: new Set<string>(),
      })

      render(<NamespaceMonitorTable {...props} />)

      fireEvent.click(screen.getByText('prod-cluster'))
      expect(props.onToggleCluster).toHaveBeenCalledWith('prod-cluster')
    })

    it('calls onToggleNamespace when namespace row is clicked', () => {
      const namespaceData = new Map<string, NamespaceData>([
        ['my-app', makeNamespaceData()],
      ])

      const props = buildProps({
        getNamespaceData: vi.fn(() => namespaceData),
      })

      render(<NamespaceMonitorTable {...props} />)

      // The namespace text is inside a span that has its own click handler (drilldown),
      // but the parent div row handles onToggleNamespace.
      const namespaceText = screen.getByText('my-app')
      const namespaceRow = namespaceText.parentElement
      expect(namespaceRow).toBeTruthy()
      fireEvent.click(namespaceRow!)

      expect(props.onToggleNamespace).toHaveBeenCalledWith('prod-cluster:my-app')
    })

    it('shows resource items when namespace is expanded', () => {
      const namespaceData = new Map<string, NamespaceData>([
        ['my-app', makeNamespaceData({
          pods: [{ name: 'my-pod', namespace: 'my-app', status: 'Running', restarts: 0 }],
        })],
      ])

      const props = buildProps({
        expandedNamespaces: new Set(['prod-cluster:my-app']),
        getNamespaceData: vi.fn(() => namespaceData),
      })

      render(<NamespaceMonitorTable {...props} />)

      expect(screen.getByText('my-pod')).toBeInTheDocument()
      expect(screen.getByText('Running')).toBeInTheDocument()
    })

    it('does NOT show resource items when namespace is collapsed', () => {
      const namespaceData = new Map<string, NamespaceData>([
        ['my-app', makeNamespaceData({
          pods: [{ name: 'my-pod', namespace: 'my-app', status: 'Running', restarts: 0 }],
        })],
      ])

      const props = buildProps({
        expandedNamespaces: new Set<string>(), // collapsed
        getNamespaceData: vi.fn(() => namespaceData),
      })

      render(<NamespaceMonitorTable {...props} />)

      // Namespace name visible, but pod details hidden
      expect(screen.getByText('my-app')).toBeInTheDocument()
      expect(screen.queryByText('my-pod')).not.toBeInTheDocument()
    })
  })

  // ---- Scenario 4: Change animation side effect ----

  describe('change animation', () => {
    it('applies highlight CSS class when a resource has a change', () => {
      const namespaceData = new Map<string, NamespaceData>([
        ['my-app', makeNamespaceData({
          pods: [{ name: 'changed-pod', namespace: 'my-app', status: 'Running', restarts: 0 }],
        })],
      ])

      const props = buildProps({
        expandedNamespaces: new Set(['prod-cluster:my-app']),
        getNamespaceData: vi.fn(() => namespaceData),
        getResourceChange: vi.fn(() => 'added' as ChangeType),
      })

      render(<NamespaceMonitorTable {...props} />)

      const podEl = screen.getByText('changed-pod').closest('[class*="animate-pulse"]')
      expect(podEl).toBeTruthy()
      // Verify the added animation classes are applied
      expect(podEl!.className).toContain('bg-green-500/20')
    })

    it('calls clearChangeAfterTimeout via useEffect when a change is detected', () => {
      const namespaceData = new Map<string, NamespaceData>([
        ['my-app', makeNamespaceData({
          pods: [{ name: 'changed-pod', namespace: 'my-app', status: 'Running', restarts: 0 }],
        })],
      ])

      const clearChangeAfterTimeout = vi.fn()
      const props = buildProps({
        expandedNamespaces: new Set(['prod-cluster:my-app']),
        getNamespaceData: vi.fn(() => namespaceData),
        getResourceChange: vi.fn(() => 'modified' as ChangeType),
        clearChangeAfterTimeout,
      })

      render(<NamespaceMonitorTable {...props} />)

      expect(clearChangeAfterTimeout).toHaveBeenCalledWith(
        'prod-cluster:my-app:pods:changed-pod',
      )
    })

    it('does NOT call clearChangeAfterTimeout when no change is detected', () => {
      const namespaceData = new Map<string, NamespaceData>([
        ['my-app', makeNamespaceData({
          pods: [{ name: 'stable-pod', namespace: 'my-app', status: 'Running', restarts: 0 }],
        })],
      ])

      const clearChangeAfterTimeout = vi.fn()
      const props = buildProps({
        expandedNamespaces: new Set(['prod-cluster:my-app']),
        getNamespaceData: vi.fn(() => namespaceData),
        getResourceChange: vi.fn(() => null as ChangeType),
        clearChangeAfterTimeout,
      })

      render(<NamespaceMonitorTable {...props} />)

      expect(clearChangeAfterTimeout).not.toHaveBeenCalled()
    })
  })

  // ---- Scenario 5: Resource action callbacks ----

  describe('resource action callbacks', () => {
    it('calls onDrillToResource when a resource item name is clicked', () => {
      const namespaceData = new Map<string, NamespaceData>([
        ['my-app', makeNamespaceData({
          pods: [{ name: 'click-me-pod', namespace: 'my-app', status: 'Running', restarts: 0 }],
        })],
      ])

      const props = buildProps({
        expandedNamespaces: new Set(['prod-cluster:my-app']),
        getNamespaceData: vi.fn(() => namespaceData),
      })

      render(<NamespaceMonitorTable {...props} />)

      fireEvent.click(screen.getByText('click-me-pod'))
      expect(props.onDrillToResource).toHaveBeenCalledWith({
        type: 'pods',
        name: 'click-me-pod',
        namespace: 'my-app',
        cluster: 'prod-cluster',
      })
    })

    it('calls onOpenResource when the eye action button is clicked on a resource', () => {
      const namespaceData = new Map<string, NamespaceData>([
        ['my-app', makeNamespaceData({
          deployments: [{
            name: 'my-deploy', namespace: 'my-app',
            replicas: 3, readyReplicas: 3,
          }],
        })],
      ])

      const props = buildProps({
        expandedNamespaces: new Set(['prod-cluster:my-app']),
        getNamespaceData: vi.fn(() => namespaceData),
      })

      render(<NamespaceMonitorTable {...props} />)

      // Get the specific resource row div
      const deployItem = screen.getByText('my-deploy')
      const row = deployItem.closest('div')
      expect(row).toBeTruthy()
      const eyeButton = row!.querySelector('button')
      expect(eyeButton).toBeTruthy()
      fireEvent.click(eyeButton!)

      expect(props.onOpenResource).toHaveBeenCalledWith({
        type: 'deployments',
        name: 'my-deploy',
        namespace: 'my-app',
        cluster: 'prod-cluster',
      })
    })

    it('calls onDrillToNamespace when namespace name text is clicked', () => {
      const namespaceData = new Map<string, NamespaceData>([
        ['my-app', makeNamespaceData()],
      ])

      const props = buildProps({
        getNamespaceData: vi.fn(() => namespaceData),
      })

      render(<NamespaceMonitorTable {...props} />)

      // The namespace name span has its own click handler with stopPropagation
      fireEvent.click(screen.getByText('my-app'))
      expect(props.onDrillToNamespace).toHaveBeenCalledWith('prod-cluster', 'my-app')
    })
  })

  // ---- Scenario 6: Loading state ----

  describe('loading state', () => {
    it('shows Loading... when cluster is expanded but selectedCluster does not match', () => {
      const props = buildProps({
        selectedCluster: 'other-cluster', // Does not match the expanded cluster name
        expandedClusters: new Set(['prod-cluster']),
      })

      render(<NamespaceMonitorTable {...props} />)

      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('does NOT show Loading when selectedCluster matches expanded cluster', () => {
      const namespaceData = new Map<string, NamespaceData>([
        ['default', makeNamespaceData()],
      ])

      const props = buildProps({
        selectedCluster: 'prod-cluster',
        expandedClusters: new Set(['prod-cluster']),
        getNamespaceData: vi.fn(() => namespaceData),
      })

      render(<NamespaceMonitorTable {...props} />)

      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })
  })

  // ---- Scenario 7: Empty state ----

  describe('empty state', () => {
    it('renders friendly empty state when no clusters match the filter', () => {
      const props = buildProps({
        filteredClusters: [],
      })

      render(<NamespaceMonitorTable {...props} />)

      expect(screen.getByText('No clusters match the current filter')).toBeInTheDocument()
    })

    it('renders "No namespaces found" when cluster is expanded with no user namespaces', () => {
      const namespaceData = new Map<string, NamespaceData>()

      const props = buildProps({
        getNamespaceData: vi.fn(() => namespaceData),
      })

      render(<NamespaceMonitorTable {...props} />)

      expect(screen.getByText('No namespaces found')).toBeInTheDocument()
    })

    it('renders "No namespaces found" when only kube-system namespaces exist (all filtered out)', () => {
      const namespaceData = new Map<string, NamespaceData>([
        ['kube-system', makeNamespaceData()],
        ['kube-public', makeNamespaceData()],
      ])

      const props = buildProps({
        getNamespaceData: vi.fn(() => namespaceData),
      })

      render(<NamespaceMonitorTable {...props} />)

      // All namespaces are system namespaces → filtered out → shows empty
      expect(screen.getByText('No namespaces found')).toBeInTheDocument()
    })
  })

  // ---- Scenario 8: Multiple resource types rendered ----

  describe('resource type rendering', () => {
    it('renders resource section headers for each active resource type with items', () => {
      const namespaceData = new Map<string, NamespaceData>([
        ['my-app', makeNamespaceData({
          pods: [{ name: 'pod-1', namespace: 'my-app', status: 'Running', restarts: 0 }],
          deployments: [{ name: 'deploy-1', namespace: 'my-app', replicas: 2, readyReplicas: 2 }],
          services: [{ name: 'svc-1', namespace: 'my-app', type: 'ClusterIP' }],
        })],
      ])

      const props = buildProps({
        expandedNamespaces: new Set(['prod-cluster:my-app']),
        getNamespaceData: vi.fn(() => namespaceData),
      })

      render(<NamespaceMonitorTable {...props} />)

      expect(screen.getByText('pods')).toBeInTheDocument()
      expect(screen.getByText('deployments')).toBeInTheDocument()
      expect(screen.getByText('services')).toBeInTheDocument()
      // Items rendered
      expect(screen.getByText('pod-1')).toBeInTheDocument()
      expect(screen.getByText('deploy-1')).toBeInTheDocument()
      expect(screen.getByText('svc-1')).toBeInTheDocument()
    })

    it('shows unhealthy pod with yellow status styling', () => {
      const namespaceData = new Map<string, NamespaceData>([
        ['my-app', makeNamespaceData({
          pods: [{ name: 'crashloop-pod', namespace: 'my-app', status: 'CrashLoopBackOff', restarts: 5 }],
        })],
      ])

      const props = buildProps({
        expandedNamespaces: new Set(['prod-cluster:my-app']),
        getNamespaceData: vi.fn(() => namespaceData),
      })

      render(<NamespaceMonitorTable {...props} />)

      const podName = screen.getByText('crashloop-pod')
      expect(podName.className).toContain('text-yellow-400')
      expect(screen.getByText('CrashLoopBackOff')).toBeInTheDocument()
    })

    it('shows node count for cluster rows', () => {
      const props = buildProps({
        filteredClusters: [makeCluster({ nodeCount: 7 })],
        expandedClusters: new Set<string>(),
      })

      render(<NamespaceMonitorTable {...props} />)

      expect(screen.getByText('7 nodes')).toBeInTheDocument()
    })
  })
})
