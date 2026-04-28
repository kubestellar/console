import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import type { ReactNode, ButtonHTMLAttributes } from 'react'
import { ClusterComparison } from './ClusterComparison'

const mockUseClusters = vi.fn()
const mockUseCachedGPUNodes = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockDrillToCluster = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../../hooks/useCachedData', () => ({
  useCachedGPUNodes: () => mockUseCachedGPUNodes(),
}))

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToCluster: mockDrillToCluster }),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [],
    isAllClustersSelected: true,
    customFilter: '',
  }),
}))

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => <div data-testid="refresh-indicator" />,
}))

vi.mock('./DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('../ui/Button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}))

describe('ClusterComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [],
      isLoading: false,
      isFailed: false,
      consecutiveFailures: 0,
    })
    mockUseCachedGPUNodes.mockReturnValue({
      nodes: [],
      isDemoFallback: false,
      isRefreshing: false,
      lastRefresh: Date.now(),
    })
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: true,
    })
  })

  it('renders empty-state message when no clusters available', () => {
    render(<ClusterComparison />)
    expect(screen.getByText('noClustersSelected')).toBeTruthy()
  })

  it('drills down when clicking a cluster header button', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-a', healthy: true, nodeCount: 3, podCount: 10, cpuCores: 8 },
        { name: 'cluster-b', healthy: false, nodeCount: 2, podCount: 6, cpuCores: 4 },
      ],
      isLoading: false,
      isFailed: false,
      consecutiveFailures: 0,
    })
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
    })

    render(<ClusterComparison />)
    const clusterAButtons = screen.getAllByRole('button', { name: /cluster-a/i })
    await userEvent.click(clusterAButtons[clusterAButtons.length - 1])
    expect(mockDrillToCluster).toHaveBeenCalledWith(
      'cluster-a',
      expect.objectContaining({ nodeCount: 3, podCount: 10, cpuCores: 8 }),
    )
  })
})
