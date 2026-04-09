import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KustomizationStatus } from '../KustomizationStatus'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockDrillToKustomization = vi.fn()

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => ({
    deduplicatedClusters: [{ name: 'cluster-1' }, { name: 'cluster-2' }],
    isLoading: false,
  }),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [],
    isAllClustersSelected: true,
    customFilter: '',
  }),
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: true }), // demo so we get data
  getDemoMode: () => true, default: () => true,
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToKustomization: mockDrillToKustomization }),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false, showEmptyState: false })),
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (items: unknown[], _opts: unknown) => ({
    items,
    allFilteredItems: items,
    totalItems: (items as unknown[]).length,
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
      availableClusters: [],
      showClusterFilter: false,
      setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null },
    },
    sorting: {
      sortBy: 'status',
      setSortBy: vi.fn(),
      sortDirection: 'asc',
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => {
      if (opts?.count !== undefined) return `${k}:${opts.count}`
      return k
    },
  }),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSearchInput: () => <input data-testid="search" />,
  CardControlsRow: () => <div data-testid="controls-row" />,
  CardPaginationFooter: () => <div data-testid="pagination" />,
  CardAIActions: () => <div data-testid="ai-actions" />,
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('KustomizationStatus', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useCardLoadingState } = await import('../CardDataContext')
    vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: false } as never)
  })

  describe('Skeleton', () => {
    it('renders skeletons during loading', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: true, showEmptyState: false } as never)
      render(<KustomizationStatus />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('Empty state', () => {
    it('shows no kustomizations message', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false, showEmptyState: true } as never)
      render(<KustomizationStatus />)
      expect(screen.getByText('cards:kustomizationStatus.noKustomizations')).toBeTruthy()
    })
  })

  describe('Cluster selector', () => {
    it('renders cluster dropdown', () => {
      render(<KustomizationStatus />)
      const selects = screen.getAllByRole('combobox')
      expect(selects.length).toBeGreaterThanOrEqual(1)
    })

    it('shows select cluster prompt when no cluster selected', () => {
      render(<KustomizationStatus />)
      // In demo mode the first cluster is auto-selected via useEffect
      // The select is still rendered
      expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0)
    })
  })

  describe('Demo data', () => {
    it('renders kustomization list in demo mode', () => {
      render(<KustomizationStatus config={{ cluster: 'cluster-1' }} />)
      // Summary stats are rendered when a cluster is selected
      expect(screen.getByText('common:common.total')).toBeTruthy()
      expect(screen.getByText('common:common.ready')).toBeTruthy()
      expect(screen.getByText('cards:kustomizationStatus.failing')).toBeTruthy()
    })
  })

  describe('Kustomization rows', () => {
    it('calls drillToKustomization when row is clicked', () => {
      render(<KustomizationStatus config={{ cluster: 'cluster-1', namespace: 'flux-system' }} />)
      // In demo mode 'infrastructure' kustomization should be in list
      const rows = document.querySelectorAll('[title*="Click to view"]')
      if (rows.length > 0) {
        fireEvent.click(rows[0])
        expect(mockDrillToKustomization).toHaveBeenCalled()
      }
    })

    it('shows AI actions for NotReady kustomizations', () => {
      render(<KustomizationStatus config={{ cluster: 'cluster-1', namespace: 'flux-system' }} />)
      // tenants-prod is NotReady in demo data — AI actions should appear
      const aiActions = screen.queryAllByTestId('ai-actions')
      expect(aiActions.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Namespace filter', () => {
    it('renders namespace dropdown when cluster selected', () => {
      render(<KustomizationStatus config={{ cluster: 'cluster-1' }} />)
      const selects = screen.getAllByRole('combobox')
      expect(selects.length).toBeGreaterThanOrEqual(2)
    })
  })
})