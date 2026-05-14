import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { ChangeTimeline } from './ChangeTimeline'

const mockUseCachedTimeline = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockUseDrillDownActions = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../../hooks/useCachedTimeline', () => ({
  useCachedTimeline: (...args: unknown[]) => mockUseCachedTimeline(...args),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => mockUseDrillDownActions(),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../../charts/LazyEChart', () => ({
  LazyEChart: () => <div data-testid="chart" />,
}))

function setup(overrides?: Record<string, unknown>) {
  mockUseCachedTimeline.mockReturnValue({
    data: [],
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
    ...overrides,
  })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
  mockUseDrillDownActions.mockReturnValue({ openDrillDown: vi.fn() })
}

describe('ChangeTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders skeleton when loading', () => {
    mockUseCachedTimeline.mockReturnValue({
      data: [],
      isLoading: true,
      isRefreshing: false,
      isDemoData: false,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
    })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })
    mockUseDrillDownActions.mockReturnValue({ openDrillDown: vi.fn() })
    
    render(<ChangeTimeline />)

    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })
})
