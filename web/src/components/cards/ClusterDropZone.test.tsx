import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClusterDropZone } from './ClusterDropZone'

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../hooks/useWorkloads', () => ({
  useClusterCapabilities: vi.fn(),
}))

vi.mock('@dnd-kit/core', () => ({
  useDroppable: vi.fn(() => ({ isOver: false, setNodeRef: vi.fn() })),
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

import { useCardLoadingState } from './CardDataContext'
import { useClusterCapabilities } from '../../hooks/useWorkloads'

const mockLoadingState = vi.mocked(useCardLoadingState)
const mockClusterCaps = vi.mocked(useClusterCapabilities)

const baseLoadingState = {
  showSkeleton: false,
  showEmptyState: false,
  hasData: true,
  isRefreshing: false,
  loadingTimedOut: false,
}

const baseDraggedWorkload = {
  name: 'my-app',
  namespace: 'default',
  type: 'Deployment',
  sourceCluster: 'prod',
  currentClusters: [],
}

describe('ClusterDropZone', () => {
  beforeEach(() => {
    mockLoadingState.mockReturnValue(baseLoadingState)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusterCaps.mockReturnValue({ data: [], isLoading: false, isRefreshing: false } as any)
  })

  it('renders nothing when not dragging', () => {
    const { container } = render(<ClusterDropZone isDragging={false} draggedWorkload={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when dragging but no workload', () => {
    const { container } = render(<ClusterDropZone isDragging={true} draggedWorkload={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders loading spinner while fetching clusters', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusterCaps.mockReturnValue({ data: undefined, isLoading: true, isRefreshing: false } as any)
    const { container } = render(<ClusterDropZone isDragging={true} draggedWorkload={baseDraggedWorkload} />)
    expect(container.firstChild).toBeTruthy()
    // Loading spinner present
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('renders empty state when all clusters already deployed', () => {
    const clusters = [{ cluster: 'prod', nodeCount: 5, cpuCapacity: '40 cores', memCapacity: '160Gi', available: true }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusterCaps.mockReturnValue({ data: clusters, isLoading: false, isRefreshing: false } as any)
    render(<ClusterDropZone
      isDragging={true}
      draggedWorkload={{ ...baseDraggedWorkload, currentClusters: ['prod'] }}
    />)
    expect(screen.getByText('Already deployed to all available clusters')).toBeInTheDocument()
  })

  it('renders happy-path with available clusters', () => {
    const clusters = [
      { cluster: 'staging', nodeCount: 3, cpuCapacity: '24 cores', memCapacity: '96Gi', available: true },
      { cluster: 'dev', nodeCount: 2, cpuCapacity: '16 cores', memCapacity: '64Gi', available: true },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusterCaps.mockReturnValue({ data: clusters, isLoading: false, isRefreshing: false } as any)
    render(<ClusterDropZone isDragging={true} draggedWorkload={baseDraggedWorkload} />)
    expect(screen.getByText('staging')).toBeInTheDocument()
    expect(screen.getByText('dev')).toBeInTheDocument()
  })

  it('renders without crashing', () => {
    const clusters = [{ cluster: 'staging', nodeCount: 3, cpuCapacity: '24 cores', memCapacity: '96Gi', available: true }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusterCaps.mockReturnValue({ data: clusters, isLoading: false, isRefreshing: false } as any)
    const { container } = render(<ClusterDropZone isDragging={true} draggedWorkload={baseDraggedWorkload} />)
    expect(container.firstChild).toBeTruthy()
  })
})
