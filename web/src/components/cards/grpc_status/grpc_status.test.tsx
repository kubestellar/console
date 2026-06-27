import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { GrpcStatus } from './index'

const mockUseCachedGrpc = vi.fn()
const mockUseReportCardDataState = vi.fn()

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../../hooks/useCachedGrpc', () => ({
  useCachedGrpc: () => mockUseCachedGrpc(),
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
  mockUseCachedGrpc.mockReturnValue({
    data: {
      health: 'healthy',
      services: [],
      stats: {
        totalServices: 0,
        totalRequests: 0,
        avgLatencyMs: 0,
        errorRate: 0,
      },
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

describe('GrpcStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders skeleton when loading', () => {
    setup({ isLoading: true })
    mockUseReportCardDataState.mockReturnValue({ showSkeleton: true, showEmptyState: false })
    render(<GrpcStatus />)

    expect(screen.getByTestId('skeleton-stats')).toBeTruthy()
  })

  it('renders without error when data is loaded', () => {
    setup()
    render(<GrpcStatus />)

    expect(screen.queryByTestId('skeleton')).toBeFalsy()
  })
})
