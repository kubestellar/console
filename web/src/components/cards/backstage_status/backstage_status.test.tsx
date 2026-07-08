import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { BackstageStatus } from './index'

const mockUseCachedBackstage = vi.fn()
const mockUseCardLoadingState = vi.fn()

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../../hooks/useCachedBackstage', () => ({
  useCachedBackstage: () => mockUseCachedBackstage(),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ height }: { height?: number }) => <div data-testid="skeleton" style={{ height }} />,
  SkeletonList: () => <div data-testid="skeleton-list" />,
  SkeletonStats: () => <div data-testid="skeleton-stats" />,
  SkeletonCardWithRefresh: () => <div data-testid="skeleton-card-with-refresh" />,
}))

function setup(overrides?: Record<string, unknown>) {
  mockUseCachedBackstage.mockReturnValue({
    data: {
      health: 'healthy',
      summary: {
        totalEntities: 5,
        enabledPlugins: 2,
        pluginErrors: 0,
        scaffolderTemplates: 1,
      },
      replicas: 1,
      desiredReplicas: 1,
      version: '1.0.0',
      plugins: [],
      templates: [],
      catalog: {},
      lastCatalogSync: new Date().toISOString(),
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
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
}

describe('BackstageStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders skeleton when loading', () => {
    setup({ isLoading: true })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })
    render(<BackstageStatus />)

    expect(screen.getByTestId('skeleton-stats')).toBeTruthy()
  })

  it('renders without error when data is loaded', () => {
    setup()
    render(<BackstageStatus />)

    expect(screen.queryByTestId('skeleton')).toBeFalsy()
  })
})
