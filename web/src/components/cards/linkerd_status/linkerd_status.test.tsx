import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { LinkerdStatus } from './index'

const mockUseCachedLinkerd = vi.fn()
const mockUseReportCardDataState = vi.fn()

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../../hooks/useCachedLinkerd', () => ({
  useCachedLinkerd: () => mockUseCachedLinkerd(),
}))

vi.mock('../CardDataContext', () => ({
  useReportCardDataState: (opts: Record<string, unknown>) => mockUseReportCardDataState(opts),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ height }: { height?: number }) => <div data-testid="skeleton" style={{ height }} />,
  SkeletonList: () => <div data-testid="skeleton-list" />,
  SkeletonStats: () => <div data-testid="skeleton-stats" />,
}))

function setup(overrides?: Record<string, unknown>) {
  mockUseCachedLinkerd.mockReturnValue({
    data: {
      health: 'healthy',
      meshedPods: 0,
      totalPods: 0,
      successRate: 0,
      rps: 0,
    },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
    ...overrides,
  })
  mockUseReportCardDataState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
}

describe('LinkerdStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders skeleton when loading', () => {
    setup({ isLoading: true })
    mockUseReportCardDataState.mockReturnValue({ showSkeleton: true, showEmptyState: false })
    render(<LinkerdStatus />)

    expect(screen.getByTestId('skeleton-stats')).toBeTruthy()
  })

  it('renders without error when data is loaded', () => {
    setup()
    render(<LinkerdStatus />)

    expect(screen.queryByTestId('skeleton')).toBeFalsy()
  })
})
