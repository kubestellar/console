import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { CniStatus } from './index'
import { CNI_DEMO_DATA } from '../../../lib/demo/cni'

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

function setup(overrides?: Record<string, unknown>) {
  mockUseCachedCni.mockReturnValue({
    data: CNI_DEMO_DATA,
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
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

  it('renders loading skeleton when isLoading is true', () => {
    setup({
      isLoading: true,
      showSkeleton: true,
      data: {
        health: 'healthy',
        nodes: [],
        stats: {
          activePlugin: 'unknown',
          pluginVersion: 'unknown',
          podNetworkCidr: '',
          serviceNetworkCidr: '',
          nodeCount: 0,
          nodesCniReady: 0,
          networkPolicyCount: 0,
          servicesWithNetworkPolicy: 0,
          totalServices: 0,
          podsWithIp: 0,
          totalPods: 0,
        },
        summary: {
          activePlugin: 'unknown',
          pluginVersion: 'unknown',
          podNetworkCidr: '',
          nodesCniReady: 0,
          nodeCount: 0,
          networkPolicyCount: 0,
          servicesWithNetworkPolicy: 0,
        },
        lastCheckTime: new Date().toISOString(),
      },
    })
    render(<CniStatus />)

    expect(screen.getByTestId('skeleton')).toBeTruthy()
  })

  it('renders with empty state when no CNI plugin found', () => {
    setup({
      data: {
        health: 'not-installed',
        nodes: [],
        stats: {
          activePlugin: 'unknown',
          pluginVersion: 'unknown',
          podNetworkCidr: '',
          serviceNetworkCidr: '',
          nodeCount: 0,
          nodesCniReady: 0,
          networkPolicyCount: 0,
          servicesWithNetworkPolicy: 0,
          totalServices: 0,
          podsWithIp: 0,
          totalPods: 0,
        },
        summary: {
          activePlugin: 'unknown',
          pluginVersion: 'unknown',
          podNetworkCidr: '',
          nodesCniReady: 0,
          nodeCount: 0,
          networkPolicyCount: 0,
          servicesWithNetworkPolicy: 0,
        },
        lastCheckTime: new Date().toISOString(),
      },
    })
    render(<CniStatus />)

    // Component should render without error
    expect(screen.queryByTestId('skeleton')).toBeFalsy()
  })
})
