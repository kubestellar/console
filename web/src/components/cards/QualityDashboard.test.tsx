import React from 'react'
/**
 * Unit tests for QualityDashboard card component.
 * Covers: loading state, empty/error state with retry, happy-path metrics,
 * and snapshot.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QualityDashboard from './QualityDashboard'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key.split('.').pop() ?? key,
  }),
}))

const mockUseCachedQuality = vi.fn()
vi.mock('../../hooks/useCachedData', () => ({
  useCachedQuality: () => mockUseCachedQuality(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
}))

vi.mock('../ui/Button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: () => void
  }) => <button onClick={onClick}>{children}</button>,
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const defaultStats = {
  totalChecks: 42,
  passedChecks: 38,
  failedChecks: 4,
  pendingChecks: 0,
  score: 90,
  sweepRunning: false,
  lastSweepAt: new Date().toISOString(),
}

const defaultReturn = {
  data: defaultStats,
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  isFailed: false,
  consecutiveFailures: 0,
  error: null,
  refetch: vi.fn(),
}

function setup(overrides = {}) {
  mockUseCachedQuality.mockReturnValue({ ...defaultReturn, ...overrides })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QualityDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  // 1. Loading state
  it('renders loading spinner when showSkeleton is true', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })
    render(<QualityDashboard />)
    expect(screen.getByText(/checking/i)).toBeInTheDocument()
  })

  // 2. Error state
  it('renders error state when showEmptyState is true', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })
    render(<QualityDashboard />)
    expect(screen.getByText(/Failed to fetch quality data/i)).toBeInTheDocument()
  })

  it('renders retry button in error state', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })
    render(<QualityDashboard />)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('calls refetch when retry is clicked', async () => {
    const refetch = vi.fn()
    setup({ refetch })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })
    const user = userEvent.setup()
    render(<QualityDashboard />)
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(refetch).toHaveBeenCalled()
  })

  // 3. Happy path
  it('renders score value', () => {
    render(<QualityDashboard />)
    expect(screen.getByText(/90/)).toBeInTheDocument()
  })

  it('renders total checks count', () => {
    render(<QualityDashboard />)
    expect(screen.getByText(/42/)).toBeInTheDocument()
  })

  it('renders passed checks count', () => {
    render(<QualityDashboard />)
    expect(screen.getByText(/38/)).toBeInTheDocument()
  })

  it('renders failed checks count', () => {
    render(<QualityDashboard />)
    expect(screen.getByText(/4/)).toBeInTheDocument()
  })

  // 4. Snapshot
  it('matches snapshot', () => {
    const { asFragment } = render(<QualityDashboard />)
    expect(asFragment()).toMatchSnapshot()
  })
})
