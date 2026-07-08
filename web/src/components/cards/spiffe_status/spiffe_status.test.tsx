import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { SpiffeStatus } from './index'

const mockUseCachedSpiffe = vi.fn()
const mockUseReportCardDataState = vi.fn()

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../../hooks/useCachedSpiffe', () => ({
  useCachedSpiffe: () => mockUseCachedSpiffe(),
}))

vi.mock('../CardDataContext', () => ({
  useReportCardDataState: (opts: Record<string, unknown>) => mockUseReportCardDataState(opts),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ height }: { height?: number }) => <div data-testid="skeleton" style={{ height }} />,
  SkeletonList: () => <div data-testid="skeleton-list" />,
  SkeletonStats: () => <div data-testid="skeleton-stats" />,
  SkeletonCardWithRefresh: () => <div data-testid="skeleton-card-with-refresh" />,
}))

function setup(overrides?: Record<string, unknown>) {
  mockUseCachedSpiffe.mockReturnValue({
    data: {
      health: 'healthy',
      identities: [],
      bundles: [],
      entries: [],
      federatedDomains: [],
      lastCheckTime: new Date().toISOString(),
      stats: {
        x509SvidCount: 0,
        jwtSvidCount: 0,
        registrationEntryCount: 0,
        agentCount: 0,
        serverVersion: '0.0.0',
      },
      summary: {
        trustDomain: 'test.example',
        totalSvids: 0,
        totalFederatedDomains: 0,
        totalEntries: 0,
      },
    },
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
    showSkeleton: false,
    showEmptyState: false,
    error: false,
    ...overrides,
  })
  mockUseReportCardDataState.mockReturnValue(undefined)
}

describe('SpiffeStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders skeleton when loading', () => {
    setup({ isLoading: true, showSkeleton: true })
    render(<SpiffeStatus />)

    expect(screen.getByTestId('skeleton-stats')).toBeTruthy()
  })

  it('renders without error when data is loaded', () => {
    setup()
    render(<SpiffeStatus />)

    expect(screen.queryByTestId('skeleton')).toBeFalsy()
  })
})
