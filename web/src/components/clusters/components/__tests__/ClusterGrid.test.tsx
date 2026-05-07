import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ClusterInfo } from '../../../../hooks/useMCP'
import { ClusterGrid } from '../ClusterGrid'

let mockLocalClusters: Array<{ name: string; tool: string; status: string }> = []
const clusterLifecycle = vi.fn().mockResolvedValue(undefined)

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: class {},
  PointerSensor: class {},
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: {},
  rectSortingStrategy: {},
  arrayMove: (items: unknown[]) => items,
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}))

vi.mock('../../../ui/FlashingValue', () => ({
  FlashingValue: ({ value }: { value: string | number }) => <span>{value}</span>,
}))

vi.mock('../../../charts/StatusIndicator', () => ({
  StatusIndicator: () => <span data-testid="status-indicator" />,
}))

vi.mock('../../../ui/CloudProviderIcon', () => ({
  CloudProviderIcon: ({ provider }: { provider: string }) => <span>{provider}</span>,
  detectCloudProvider: () => 'kind',
  getProviderLabel: (provider: string) => provider,
  getProviderColor: () => 'var(--ks-purple)',
  getConsoleUrl: () => null,
}))

vi.mock('../../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

vi.mock('../../../../hooks/useLocalClusterTools', () => ({
  useLocalClusterTools: () => ({
    clusterLifecycle,
    clusters: mockLocalClusters,
  }),
}))

const baseCluster: ClusterInfo = {
  name: 'kind-dev',
  context: 'kind-dev',
  distribution: 'kind',
  healthy: true,
  reachable: true,
  refreshing: false,
  nodeCount: 3,
  podCount: 9,
  cpuCores: 6,
  authMethod: 'exec',
  source: 'kubeconfig',
}

function renderGrid(clusterOverrides: Partial<ClusterInfo> = {}) {
  const onSelectCluster = vi.fn()
  const onRenameCluster = vi.fn()
  const onRefreshCluster = vi.fn()
  const onRemoveCluster = vi.fn()

  render(
    <ClusterGrid
      clusters={[{ ...baseCluster, ...clusterOverrides }]}
      gpuByCluster={{}}
      isConnected={true}
      permissionsLoading={false}
      isClusterAdmin={() => true}
      onSelectCluster={onSelectCluster}
      onRenameCluster={onRenameCluster}
      onRefreshCluster={onRefreshCluster}
      onRemoveCluster={onRemoveCluster}
    />,
  )

  return {
    onSelectCluster,
    onRenameCluster,
    onRefreshCluster,
    onRemoveCluster,
  }
}

describe('ClusterGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocalClusters = [{ name: 'dev', tool: 'kind', status: 'running' }]
  })

  it('disables refresh and local cluster controls when the cluster is unreachable', () => {
    const { onSelectCluster, onRefreshCluster } = renderGrid({
      healthy: false,
      reachable: false,
      errorType: 'network',
      errorMessage: 'dial tcp timeout',
    })

    const disabledControls = screen.getAllByRole('button', { name: 'cluster.controlsDisabledOffline' })
    expect(disabledControls).toHaveLength(3)
    disabledControls.forEach((control) => expect(control).toBeDisabled())
    expect(screen.getAllByText('cluster.controlsDisabledOffline').length).toBeGreaterThan(0)

    const disabledWrapper = disabledControls[0].closest('span')
    expect(disabledWrapper).toBeTruthy()
    fireEvent.click(disabledWrapper as HTMLElement)

    expect(onSelectCluster).not.toHaveBeenCalled()
    expect(onRefreshCluster).not.toHaveBeenCalled()
    expect(clusterLifecycle).not.toHaveBeenCalled()
  })

  it('keeps controls interactive for reachable local clusters', async () => {
    const { onSelectCluster, onRefreshCluster } = renderGrid()

    const refreshButton = screen.getByRole('button', { name: 'common.refreshClusterData' })
    const stopButton = screen.getByRole('button', { name: 'cluster.stopCluster' })

    expect(refreshButton).not.toBeDisabled()
    expect(stopButton).not.toBeDisabled()

    fireEvent.click(refreshButton)
    fireEvent.click(stopButton)

    expect(onRefreshCluster).toHaveBeenCalledWith('kind-dev')
    expect(onSelectCluster).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(clusterLifecycle).toHaveBeenCalledWith('kind', 'dev', 'stop')
    })
  })
})
