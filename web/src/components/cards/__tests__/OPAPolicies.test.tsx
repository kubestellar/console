import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { OPAPolicies } from '../OPAPolicies'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const { mockIsDemoMode } = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => true),
}))
vi.mock('../../../lib/demoMode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/demoMode')>()
  return {
    ...actual,
    isDemoMode: () => mockIsDemoMode(),
    isNetlifyDeployment: false,
  }
})

const mockUseDemoMode = vi.fn()
vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

const mockUseCardDemoState = vi.fn()
const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardDemoState: (...args: unknown[]) => mockUseCardDemoState(...args),
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

const mockUseClusters = vi.fn()
vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockStartMission = vi.fn()
vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: mockStartMission }),
}))

vi.mock('../../../hooks/mcp/shared', () => ({
  agentFetch: vi.fn().mockResolvedValue({ json: () => Promise.resolve({ clusters: [] }) }),
}))

vi.mock('../OPAPolicies.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../OPAPolicies.utils')>()
  return {
    ...actual,
    runClusterChecks: vi.fn(),
  }
})

const DEMO_CLUSTER_NAMES = ['kind-hub', 'kind-worker1', 'kind-worker2'] as const

const mockPaginatedClusters = DEMO_CLUSTER_NAMES.map((name) => ({
  name,
  cluster: name,
  healthy: true,
  reachable: true,
}))

const mockUseCardData = vi.fn()
vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (...args: unknown[]) => mockUseCardData(...args),
  commonComparators: {
    string: () => () => 0,
    number: () => () => 0,
    statusOrder: () => () => 0,
    date: () => () => 0,
    boolean: () => () => 0,
  },
}))

vi.mock('../OPAPoliciesModal', () => ({
  OPAPoliciesModal: () => null,
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({
    value,
    onChange,
  }: {
    value: string
    onChange: (v: string) => void
  }) => (
    <input
      data-testid="search-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
  CardControlsRow: () => <div data-testid="card-controls" />,
  CardPaginationFooter: () => null,
}))

vi.mock('../../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => <div data-testid="refresh-indicator" />,
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupDefaults({ shouldUseDemoData = true, isDemoMode = true } = {}) {
  mockIsDemoMode.mockReturnValue(isDemoMode)
  mockUseDemoMode.mockReturnValue({ isDemoMode })
  mockUseCardDemoState.mockReturnValue({ shouldUseDemoData })
  mockUseCardLoadingState.mockReturnValue({})
  mockUseClusters.mockReturnValue({
    deduplicatedClusters: mockPaginatedClusters,
    isLoading: false,
    isFailed: false,
    consecutiveFailures: 0,
  })
  mockUseCardData.mockReturnValue({
    items: mockPaginatedClusters,
    totalItems: mockPaginatedClusters.length,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 5,
    goToPage: vi.fn(),
    needsPagination: false,
    setItemsPerPage: vi.fn(),
    filters: {
      search: '',
      setSearch: vi.fn(),
      localClusterFilter: [],
      toggleClusterFilter: vi.fn(),
      clearClusterFilter: vi.fn(),
      availableClusters: mockPaginatedClusters,
      showClusterFilter: false,
      setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null },
    },
    sorting: {
      sortBy: 'name',
      setSortBy: vi.fn(),
      sortDirection: 'asc' as const,
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: undefined,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OPAPolicies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaults()
    sessionStorage.clear()
  })

  describe('policy list', () => {
    it('renders cluster rows from demo Gatekeeper statuses', async () => {
      render(<OPAPolicies />)
      await waitFor(() => {
        expect(screen.getByText('kind-hub')).toBeInTheDocument()
        expect(screen.getByText('kind-worker1')).toBeInTheDocument()
        expect(screen.getByText('kind-worker2')).toBeInTheDocument()
      })
    })

    it('renders active policy names in the preview list', async () => {
      render(<OPAPolicies />)
      await waitFor(() => {
        expect(screen.getByText('require-labels')).toBeInTheDocument()
        expect(screen.getByText('allowed-repos')).toBeInTheDocument()
        expect(screen.getByText('require-limits')).toBeInTheDocument()
      })
    })

    it('shows policy counts and violation totals in summary tiles', async () => {
      render(<OPAPolicies />)
      await waitFor(() => {
        expect(screen.getByText('Policies Active')).toBeInTheDocument()
        expect(screen.getByText('Violations')).toBeInTheDocument()
      })
      // 3 clusters × 3 policies = 9 active policies
      expect(screen.getByText('9')).toBeInTheDocument()
    })
  })

  describe('pass/fail status per policy', () => {
    it('shows violation counts for policies with failures', async () => {
      render(<OPAPolicies />)
      await waitFor(() => {
        expect(screen.getByText('require-labels')).toBeInTheDocument()
      })
      // require-labels has 1 violation in demo data
      expect(screen.getAllByText('1').length).toBeGreaterThan(0)
    })

    it('renders enforce mode badge for passing enforce policy', async () => {
      render(<OPAPolicies />)
      await waitFor(() => {
        expect(screen.getByText('allowed-repos')).toBeInTheDocument()
      })
      const enforcePolicyRow = screen.getByText('allowed-repos').closest('button')
      expect(enforcePolicyRow?.textContent).toContain('enforce')
    })

    it('renders warn mode badges for warn policies', async () => {
      render(<OPAPolicies />)
      await waitFor(() => {
        const warnBadges = screen.getAllByText('warn')
        expect(warnBadges.length).toBeGreaterThan(0)
      })
    })
  })

  describe('scanning state', () => {
    it('shows scanning indicator when not in demo and clusters are loading', () => {
      setupDefaults({ shouldUseDemoData: false, isDemoMode: false })
      mockIsDemoMode.mockReturnValue(false)
      mockUseClusters.mockReturnValue({
        deduplicatedClusters: [],
        isLoading: true,
        isFailed: false,
        consecutiveFailures: 0,
      })
      render(<OPAPolicies />)
      expect(screen.getByText('Scanning clusters...')).toBeInTheDocument()
      expect(screen.queryByText('kind-hub')).not.toBeInTheDocument()
    })
  })

  describe('useCardLoadingState integration', () => {
    it('passes isDemoData=true when demo mode is active', async () => {
      render(<OPAPolicies />)
      await waitFor(() => {
        expect(mockUseCardLoadingState).toHaveBeenCalledWith(
          expect.objectContaining({ isDemoData: true, isLoading: false, hasAnyData: true }),
        )
      })
    })

    it('passes isRefreshing to useCardLoadingState', async () => {
      render(<OPAPolicies />)
      await waitFor(() => expect(mockUseCardLoadingState).toHaveBeenCalled())
      const lastCall = mockUseCardLoadingState.mock.calls.at(-1)?.[0] as { isRefreshing?: boolean }
      expect(lastCall).toHaveProperty('isRefreshing')
    })
  })

})
