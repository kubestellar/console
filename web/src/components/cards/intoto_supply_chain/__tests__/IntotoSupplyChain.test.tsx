import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// Existing pattern mocks from StrimziStatus.test.tsx
vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
  markErrorReported: vi.fn(), emitError: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('../../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    filterByCluster: vi.fn((items) => items),
    filterByStatus: vi.fn((items) => items),
    customFilter: '',
    selectedClusters: [],
    isAllClustersSelected: true,
  }),
}))

vi.mock('../../../../hooks/mcp/clusters', () => ({
  useClusters: () => ({
    deduplicatedClusters: [],
    isLoading: false,
  }),
}))

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({
    startMission: vi.fn(),
  }),
}))


vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

// Mock useIntoto
vi.mock('../../../../hooks/useIntoto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../hooks/useIntoto')>()
  return {
    ...actual,
    useIntoto: vi.fn(),
  }
})

import { IntotoSupplyChain } from '../IntotoSupplyChain'
import { useIntoto, computeIntotoStats, type IntotoLayout } from '../../../../hooks/useIntoto'

const mockLayouts: IntotoLayout[] = [
  {
    name: 'web-app-layout',
    cluster: 'cluster-1',
    steps: [{ name: 'build' }, { name: 'test' }],
    verifiedSteps: 1,
    failedSteps: 1,
  },
  {
    name: 'api-layout',
    cluster: 'cluster-2',
    steps: [{ name: 'compile' }],
    verifiedSteps: 1,
    failedSteps: 0,
  }
]

describe('IntotoSupplyChain', () => {
  it('renders loading skeleton', () => {
    vi.mocked(useIntoto).mockReturnValue({
      statuses: {},
      isLoading: true,
      isRefreshing: false,
      lastRefresh: null,
      installed: false,
      hasErrors: false,
      isDemoData: false,
      isFailed: false,
      consecutiveFailures: 0,
      refetch: vi.fn(),
      clustersChecked: 0,
      totalClusters: 0,
    })
    
    render(<IntotoSupplyChain />)
    // Loading skeleton should have animate-pulse
    expect(document.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('renders demo mode with badge', () => {
    vi.mocked(useIntoto).mockReturnValue({
      statuses: {
        'demo-cluster': {
          cluster: 'demo-cluster',
          installed: true,
          loading: false,
          layouts: [],
          totalLayouts: 0,
          totalSteps: 0,
          verifiedSteps: 0,
          failedSteps: 0,
          missingSteps: 0
        }
      },
      isLoading: false,
      isRefreshing: false,
      lastRefresh: new Date(),
      installed: true,
      isDemoData: true,
      hasErrors: false,
      isFailed: false,
      consecutiveFailures: 0,
      refetch: vi.fn(),
      clustersChecked: 1,
      totalClusters: 1,
    })

    render(<IntotoSupplyChain />)
    expect(screen.getByText('Demo')).toBeTruthy()
  })

  it('renders live mode data', () => {
    vi.mocked(useIntoto).mockReturnValue({
      statuses: {
        'prod-cluster': {
          cluster: 'prod-cluster',
          installed: true,
          loading: false,
          layouts: [mockLayouts[0] as IntotoLayout],
          totalLayouts: 1,
          totalSteps: 2,
          verifiedSteps: 1,
          failedSteps: 1,
          missingSteps: 0
        }
      },
      isLoading: false,
      isRefreshing: false,
      lastRefresh: new Date(),
      installed: true,
      isDemoData: false,
      hasErrors: false,
      isFailed: false,
      consecutiveFailures: 0,
      refetch: vi.fn(),
      clustersChecked: 1,
      totalClusters: 1,
    })

    render(<IntotoSupplyChain />)
    expect(screen.queryByText('Demo')).toBeNull()
    expect(screen.getByText('web-app-layout')).toBeTruthy()
  })

  it('renders empty state', () => {
    vi.mocked(useIntoto).mockReturnValue({
      statuses: {
        'cluster-1': {
          cluster: 'cluster-1',
          installed: true,
          loading: false,
          layouts: [],
          totalLayouts: 0,
          totalSteps: 0,
          verifiedSteps: 0,
          failedSteps: 0,
          missingSteps: 0
        }
      },
      isLoading: false,
      isRefreshing: false,
      lastRefresh: new Date(),
      installed: true,
      isDemoData: false,
      hasErrors: false,
      isFailed: false,
      consecutiveFailures: 0,
      refetch: vi.fn(),
      clustersChecked: 1,
      totalClusters: 1,
    })

    render(<IntotoSupplyChain />)
    expect(screen.getByText('intoto_supply_chain.noLayoutsTitle')).toBeTruthy()
  })

  it('renders error state', () => {
    vi.mocked(useIntoto).mockReturnValue({
      statuses: {
        'cluster-1': {
          cluster: 'cluster-1',
          installed: true,
          loading: false,
          error: 'intoto_supply_chain.fetchErrorLayouts',
          layouts: [],
          totalLayouts: 0,
          totalSteps: 0,
          verifiedSteps: 0,
          failedSteps: 0,
          missingSteps: 0
        }
      },
      isLoading: false,
      isRefreshing: false,
      lastRefresh: new Date(),
      installed: true,
      isDemoData: false,
      hasErrors: true,
      isFailed: false,
      consecutiveFailures: 0,
      refetch: vi.fn(),
      clustersChecked: 1,
      totalClusters: 1,
    })

    render(<IntotoSupplyChain />)
    expect(screen.getByText('intoto_supply_chain.fetchError')).toBeInTheDocument()
    expect(screen.getByText('intoto_supply_chain.fetchErrorLayouts')).toBeInTheDocument()
  })

  it('propagates isDemoData flag to UI', () => {
    vi.mocked(useIntoto).mockReturnValue({
      statuses: {},
      isLoading: false,
      isRefreshing: false,
      lastRefresh: new Date(),
      installed: false,
      isDemoData: true,
      hasErrors: false,
      isFailed: false,
      consecutiveFailures: 0,
      refetch: vi.fn(),
      clustersChecked: 1,
      totalClusters: 1,
    })

    const { rerender } = render(<IntotoSupplyChain />)
    expect(screen.getByText('Demo')).toBeTruthy()

    vi.mocked(useIntoto).mockReturnValue({
      statuses: {},
      isLoading: false,
      isRefreshing: false,
      lastRefresh: new Date(),
      installed: false,
      isDemoData: false,
      hasErrors: false,
      isFailed: false,
      consecutiveFailures: 0,
      refetch: vi.fn(),
      clustersChecked: 1,
      totalClusters: 1,
    })
    rerender(<IntotoSupplyChain />)
    expect(screen.queryByText('Demo')).toBeNull()
  })


  describe('computeIntotoStats', () => {
    it('aggregates counts correctly from multiple layouts', () => {
      const stats = computeIntotoStats(mockLayouts)
      expect(stats.totalLayouts).toBe(2)
      expect(stats.totalSteps).toBe(3)
      expect(stats.verifiedSteps).toBe(2)
      expect(stats.failedSteps).toBe(1)
      expect(stats.missingSteps).toBe(0)
    })

    it('handles multiple links per step without double counting (via verifiedSteps layout logic)', () => {
      // The double counting prevention happens in useIntoto.ts before calling computeIntotoStats.
      // This test verifies that we correctly sum the derived verified/failed steps across layouts.
      const multiLinkLayout = {
        name: 'multi-link',
        cluster: 'c1',
        steps: [{ name: 'step-1' }], // 1 step total
        verifiedSteps: 1, // Correctly set to 1 even if there were 10 links
        failedSteps: 0,
      }
      
      const stats = computeIntotoStats([multiLinkLayout] as IntotoLayout[])
      expect(stats.totalSteps).toBe(1)
      expect(stats.verifiedSteps).toBe(1)
      expect(stats.missingSteps).toBe(0)
    })

    it('accurately calculates missing steps', () => {
      const missingLayout = {
        name: 'missing-steps',
        cluster: 'c1',
        steps: [{ name: 's1' }, { name: 's2' }, { name: 's3' }], // 3 steps
        verifiedSteps: 1,
        failedSteps: 1,
        // missing should be 1
      }
      
      const stats = computeIntotoStats([missingLayout] as IntotoLayout[])
      expect(stats.missingSteps).toBe(1)
    })
  })
})
