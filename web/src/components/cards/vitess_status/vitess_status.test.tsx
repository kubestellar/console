import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { VitessStatus } from './index'

const mockUseCachedVitess = vi.fn()
const mockUseCardLoadingState = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../../hooks/useCachedVitess', () => ({
  useCachedVitess: (...args: unknown[]) => mockUseCachedVitess(...args),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
}))

vi.mock('../../ui/Skeleton', () => ({
  SkeletonCardWithRefresh: () => <div data-testid="skeleton" />,
}))

vi.mock('../../ui/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty">{title}</div>,
}))

function setup(overrides?: Record<string, unknown>) {
  mockUseCachedVitess.mockReturnValue({
    data: {
      health: 'healthy',
      summary: {
        totalKeyspaces: 0,
        totalShards: 0,
        totalTablets: 0,
        servingTablets: 0,
        primaryTablets: 0,
        maxReplicationLagSeconds: 0,
      },
      keyspaces: [],
      tablets: [],
      vitessVersion: 'v0.0.0',
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

describe('VitessStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders skeleton when loading', () => {
    setup({ isLoading: true })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })
    render(<VitessStatus />)

    expect(screen.getByTestId('skeleton')).toBeTruthy()
  })

  it('renders empty state when no keyspaces', () => {
    setup({
      data: {
        health: 'not-installed',
        summary: {
          totalKeyspaces: 0,
          totalShards: 0,
          totalTablets: 0,
          servingTablets: 0,
          primaryTablets: 0,
          maxReplicationLagSeconds: 0,
        },
        keyspaces: [],
        tablets: [],
        vitessVersion: 'v0.0.0',
      },
    })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })
    render(<VitessStatus />)

    expect(screen.getByTestId('empty')).toBeTruthy()
  })
})
