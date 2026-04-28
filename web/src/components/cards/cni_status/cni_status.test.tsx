import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { CniStatus } from './index'

const mockUseCachedCni = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../../hooks/useCachedCni', () => ({
  useCachedCni: () => mockUseCachedCni(),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonList: () => <div data-testid="skeleton-list" />,
  SkeletonStats: () => <div data-testid="skeleton-stats" />,
}))

const DEFAULT_DATA = {
  health: 'not-installed' as const,
  nodes: [],
  stats: {
    totalNodes: 0,
    readyNodes: 0,
    notReadyNodes: 0,
    unknownNodes: 0,
    networkPolicyCount: 0,
    servicesWithNetworkPolicy: 0,
  },
  summary: {
    totalNodes: 0,
    readyNodes: 0,
    notReadyNodes: 0,
    unknownNodes: 0,
    networkPolicyCount: 0,
    servicesWithNetworkPolicy: 0,
  },
  lastCheckTime: new Date().toISOString(),
}

function setup(overrides?: Record<string, unknown>) {
  mockUseCachedCni.mockReturnValue({
    data: DEFAULT_DATA,
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    showSkeleton: false,
    showEmptyState: false,
    error: false,
    refetch: vi.fn(),
    ...overrides,
  })
}

describe('CniStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading skeleton when showSkeleton is true', () => {
    setup({ showSkeleton: true })
    render(<CniStatus />)

    expect(screen.getByTestId('skeleton')).toBeTruthy()
  })

  it('renders without skeleton when data is present', () => {
    setup()
    render(<CniStatus />)

    expect(screen.queryByTestId('skeleton')).toBeFalsy()
  })
})
