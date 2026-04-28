import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { ReactNode } from 'react'
import { ClusterChangelog } from './ClusterChangelog'

const mockUseCachedEvents = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockRefetch = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key.endsWith('minutesAgo')) return `${opts?.count}m ago`
      if (key.endsWith('hoursAgo')) return `${opts?.count}h ago`
      if (key.endsWith('daysAgo')) return `${opts?.count}d ago`
      if (key.endsWith('justNow')) return 'just now'
      if (key.endsWith('noChanges')) return 'No changes'
      if (key.endsWith('retry')) return 'Retry'
      if (key.endsWith('errorLoading')) return 'Error loading'
      if (key.endsWith('fetchFailed')) return `Failed ${opts?.count ?? 0}`
      return key
    },
  }),
}))

vi.mock('../../hooks/useCachedData', () => ({
  useCachedEvents: (...args: unknown[]) => mockUseCachedEvents(...args),
}))

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

vi.mock('../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => <div data-testid="refresh-indicator" />,
}))

function setup(events: Array<Record<string, unknown>>, overrides?: Record<string, unknown>) {
  mockUseCachedEvents.mockReturnValue({
    events,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    refetch: mockRefetch,
    lastRefresh: Date.now(),
    ...overrides,
  })
  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: false,
  })
}

describe('ClusterChangelog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'))
  })

  it('renders skeleton state when showSkeleton is true', () => {
    setup([], { isLoading: true })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true })
    render(<ClusterChangelog />)

    expect(screen.getAllByRole('generic').length).toBeGreaterThan(0)
  })

  it('renders filtered change events and excludes non-change reasons', () => {
    setup([
      {
        reason: 'SuccessfulCreate',
        object: 'deploy/app',
        message: 'created',
        cluster: 'c1',
        lastSeen: '2026-01-01T11:55:00.000Z',
      },
      {
        reason: 'UnrelatedReason',
        object: 'pod/x',
        message: 'ignored',
        cluster: 'c2',
        lastSeen: '2026-01-01T11:50:00.000Z',
      },
    ])
    render(<ClusterChangelog />)

    expect(screen.getByText('SuccessfulCreate')).toBeTruthy()
    expect(screen.queryByText('UnrelatedReason')).toBeNull()
    expect(screen.getByText(/deploy\/app/)).toBeTruthy()
  })

  it('shows error state and retries', async () => {
    setup([], { isFailed: true, consecutiveFailures: 3 })
    render(<ClusterChangelog />)

    expect(screen.getByText('Error loading')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })
})
