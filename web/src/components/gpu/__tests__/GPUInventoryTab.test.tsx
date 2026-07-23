import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GPUInventoryTab } from '../GPUInventoryTab'
import type { GPUInventoryTabProps } from '../GPUInventoryTab'
import type { GPUNode } from '../../../hooks/mcp/types'
import type { GPUClusterInfo } from '../ReservationFormModal'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => (
    <span data-testid="cluster-badge">{cluster}</span>
  ),
}))

vi.mock('../../cards/GPUTaintFilter', () => ({
  useGPUTaintFilter: () => ({
    distinctTaints: [],
    toleratedKeys: new Set<string>(),
    toggle: vi.fn(),
    clear: vi.fn(),
    isVisible: () => true,
    visibleNodes: [],
    hiddenGPUCount: 0,
  }),
  GPUTaintFilterControl: () => <div data-testid="taint-filter" />,
}))

vi.mock('../../../hooks/useModal', () => ({
  useModal: () => ({ isOpen: false, setIsOpen: vi.fn() }),
}))

function makeNode(name: string, cluster: string, overrides: Partial<GPUNode> = {}): GPUNode {
  return {
    name,
    cluster,
    gpuType: 'NVIDIA A100',
    gpuCount: 4,
    gpuAllocated: 1,
    taints: [],
    ...overrides,
  } as GPUNode
}

function makeCluster(name: string): GPUClusterInfo {
  return { name, totalGPUs: 4, allocatedGPUs: 1, availableGPUs: 3, gpuTypes: ['NVIDIA A100'] }
}

function renderTab(overrides: Partial<GPUInventoryTabProps> = {}) {
  const defaults: GPUInventoryTabProps = {
    gpuClusters: [],
    nodes: [],
    nodesLoading: false,
    effectiveDemoMode: false,
  }
  return render(<GPUInventoryTab {...defaults} {...overrides} />)
}

describe('GPUInventoryTab', () => {
  it('renders the taint filter control', () => {
    renderTab()
    expect(screen.getByTestId('taint-filter')).toBeTruthy()
  })

  it('shows the loading spinner when nodesLoading is true and no clusters', () => {
    renderTab({ nodesLoading: true, gpuClusters: [] })
    expect(screen.getByText('gpuReservations.inventory.loading')).toBeTruthy()
  })

  it('shows the empty state when no clusters and not loading', () => {
    renderTab({ gpuClusters: [], nodesLoading: false })
    expect(screen.getByText('gpuReservations.inventory.noGpuNodes')).toBeTruthy()
  })

  it('does not show the loading state when clusters are present', () => {
    const cluster = makeCluster('k8s-prod')
    const node = makeNode('node-1', 'k8s-prod')
    renderTab({ gpuClusters: [cluster], nodes: [node], nodesLoading: true })
    expect(screen.queryByText('gpuReservations.inventory.loading')).toBeNull()
  })

  it('renders a ClusterBadge for each cluster with visible nodes', () => {
    const cluster = makeCluster('k8s-prod')
    const node = makeNode('node-1', 'k8s-prod')
    renderTab({ gpuClusters: [cluster], nodes: [node] })
    expect(screen.getByTestId('cluster-badge').textContent).toBe('k8s-prod')
  })

  it('renders node names within a cluster', () => {
    const cluster = makeCluster('k8s-prod')
    const node = makeNode('worker-node-1', 'k8s-prod')
    renderTab({ gpuClusters: [cluster], nodes: [node] })
    expect(screen.getByText('worker-node-1')).toBeTruthy()
  })

  it('applies demo mode border when effectiveDemoMode is true', () => {
    const cluster = makeCluster('demo-cluster')
    const node = makeNode('node-1', 'demo-cluster')
    const { container } = renderTab({ gpuClusters: [cluster], nodes: [node], effectiveDemoMode: true })
    expect(container.querySelector('.border-yellow-500\\/50')).not.toBeNull()
  })
})
