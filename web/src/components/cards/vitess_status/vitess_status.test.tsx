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
    keyspaces: [],
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    refetch: vi.fn(),
    ...overrides,
  })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false })
}

describe('VitessStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders skeleton when loading', () => {
    setup({ isLoading: true })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true })
    render(<VitessStatus />)

    expect(screen.getByTestId('skeleton')).toBeTruthy()
  })

  it('renders empty state when no keyspaces', () => {
    setup({ keyspaces: [] })
    render(<VitessStatus />)

    expect(screen.getByTestId('empty')).toBeTruthy()
  })
})
