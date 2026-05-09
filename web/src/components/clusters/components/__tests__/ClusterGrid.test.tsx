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

function renderGrid(clusterOverrides: Partial<ClusterInfo> = {}, layoutMode: 'grid' | 'list' | 'compact' | 'wide' = 'grid') {
  const onSelectCluster = vi.fn()
  const onRenameCluster = vi.fn()
  const onRefreshCluster = vi.fn()
  const onRemoveCluster = vi.fn()

  const renderResult = render(
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
      layoutMode={layoutMode}
    />,
  )

  return {
    ...renderResult,
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

  it('disables refresh but keeps detected local cluster controls enabled when the cluster is unreachable', async () => {
    const { onSelectCluster, onRefreshCluster } = renderGrid({
      healthy: false,
      reachable: false,
      errorType: 'network',
      errorMessage: 'dial tcp timeout',
    })

    const refreshButton = screen.getByRole('button', { name: 'cluster.controlsDisabledOffline' })
    const startButton = screen.getByRole('button', { name: 'cluster.startCluster' })
    const restartButton = screen.getByRole('button', { name: 'cluster.restartCluster' })

    expect(refreshButton).toBeDisabled()
    expect(startButton).not.toBeDisabled()
    expect(restartButton).not.toBeDisabled()
    expect(screen.getAllByText('cluster.controlsDisabledOffline').length).toBeGreaterThan(0)

    const disabledWrapper = refreshButton.closest('span')
    expect(disabledWrapper).toBeTruthy()
    fireEvent.click(disabledWrapper as HTMLElement)
    fireEvent.click(startButton)
    await waitFor(() => {
      expect(clusterLifecycle).toHaveBeenCalledWith('kind', 'dev', 'start')
    })
    fireEvent.click(restartButton)
    await waitFor(() => {
      expect(clusterLifecycle).toHaveBeenCalledWith('kind', 'dev', 'restart')
    })

    expect(onSelectCluster).not.toHaveBeenCalled()
    expect(onRefreshCluster).not.toHaveBeenCalled()
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

  it('keeps long cluster names truncatable across card layouts', () => {
    const longContext = 'kind-dev-with-an-extremely-long-context-name-that-should-truncate-cleanly-without-breaking-card-layout'

    const grid = renderGrid({ context: longContext })
    let name = screen.getByText(longContext)
    expect(name.className).toContain('truncate')
    expect(name.className).toContain('flex-1')
    expect(name.className).toContain('min-w-0')

    grid.rerender(
      <ClusterGrid
        clusters={[{ ...baseCluster, context: longContext }]}
        gpuByCluster={{}}
        isConnected={true}
        permissionsLoading={false}
        isClusterAdmin={() => true}
        onSelectCluster={vi.fn()}
        onRenameCluster={vi.fn()}
        onRefreshCluster={vi.fn()}
        onRemoveCluster={vi.fn()}
        layoutMode="list"
      />,
    )
    name = screen.getByText(longContext)
    expect(name.className).toContain('truncate')
    expect(name.className).toContain('flex-1')
    expect(name.className).toContain('min-w-0')
    expect(name.parentElement?.className).toContain('flex-1')
    expect(name.parentElement?.className).toContain('min-w-0')
    expect(name.parentElement?.className).not.toContain('shrink-0')
    expect(name.parentElement?.className).not.toContain('w-48')

    grid.rerender(
      <ClusterGrid
        clusters={[{ ...baseCluster, context: longContext }]}
        gpuByCluster={{}}
        isConnected={true}
        permissionsLoading={false}
        isClusterAdmin={() => true}
        onSelectCluster={vi.fn()}
        onRenameCluster={vi.fn()}
        onRefreshCluster={vi.fn()}
        onRemoveCluster={vi.fn()}
        layoutMode="compact"
      />,
    )
    name = screen.getByText(longContext)
    expect(name.className).toContain('truncate')
    expect(name.className).toContain('flex-1')
    expect(name.className).toContain('min-w-0')
  })
})
