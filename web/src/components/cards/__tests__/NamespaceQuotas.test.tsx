import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NamespaceQuotas } from '../NamespaceQuotas'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string, fallback?: string) => fallback ?? k, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

const mockUseCardLoadingState = vi.fn()
const mockUseCardDemoState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
  useCardDemoState: (...args: unknown[]) => mockUseCardDemoState(...args),
}))

const mockUseClusters = vi.fn()
vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
  useResourceQuotas: vi.fn(() => ({ resourceQuotas: [], isLoading: false, refetch: vi.fn() })),
  useLimitRanges: vi.fn(() => ({ limitRanges: [], isLoading: false })),
  createOrUpdateResourceQuota: vi.fn().mockResolvedValue(undefined),
  deleteResourceQuota: vi.fn().mockResolvedValue(undefined),
}))

const mockUseCachedNamespaces = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedNamespaces: (...args: unknown[]) => mockUseCachedNamespaces(...args),
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardData: (items: unknown[], _opts: unknown) => ({
    items,
    allFilteredItems: items,
    totalItems: (items as unknown[]).length,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 10,
    goToPage: vi.fn(),
    needsPagination: false,
    setItemsPerPage: vi.fn(),
    filters: {
      search: '', setSearch: vi.fn(),
      localClusterFilter: [], toggleClusterFilter: vi.fn(), clearClusterFilter: vi.fn(),
      availableClusters: [], showClusterFilter: false, setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null },
    },
    sorting: { sortBy: 'name', setSortBy: vi.fn(), sortDirection: 'asc', setSortDirection: vi.fn() },
    containerRef: { current: null }, containerStyle: {},
  }),
}))

vi.mock('../../../lib/modals', () => ({
  useModalState: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardControlsRow: () => <div data-testid="controls-row" />,
  CardPaginationFooter: () => <div data-testid="pagination" />,
}))

vi.mock('../NamespaceQuotasList', () => ({
  NamespaceQuotasList: ({ paginatedQuotas, onCreateQuota }: {
    paginatedQuotas: unknown[]; onCreateQuota: () => void
  }) => (
    <div data-testid="quotas-list">
      <span data-testid="quota-count">{paginatedQuotas.length}</span>
      <button data-testid="create-quota-btn" onClick={onCreateQuota}>Add Quota</button>
    </div>
  ),
}))

vi.mock('../NamespaceQuotasModal', () => ({
  QuotaModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? <div data-testid="quota-modal"><button onClick={onClose}>Close</button></div> : null,
}))

vi.mock('../NamespaceQuotasDeleteModal', () => ({
  NamespaceQuotasDeleteModal: ({ deleteConfirm, onClose, onDelete, isLoading }: {
    deleteConfirm: { name: string; namespace: string; cluster: string } | null;
    onClose: () => void;
    onDelete: (t: { name: string; namespace: string; cluster: string }) => void;
    isLoading: boolean;
  }) => deleteConfirm ? (
    <div data-testid="delete-modal">
      <p>{deleteConfirm.name}</p>
      <button onClick={onClose}>Cancel</button>
      <button disabled={isLoading} onClick={() => onDelete(deleteConfirm)}>Delete</button>
    </div>
  ) : null,
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) =>
    <span data-testid="status-badge">{children}</span>,
}))

vi.mock('../../ui/CardEmptyState', () => ({
  CardEmptyState: ({ children }: { children: React.ReactNode }) =>
    <div data-testid="card-empty-state">{children}</div>,
}))

vi.mock('../ui/Button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    <button onClick={onClick}>{children}</button>,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultCluster(overrides = {}) {
  return { name: 'prod', reachable: true, ...overrides }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NamespaceQuotas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
    mockUseCardDemoState.mockReturnValue({ showDemoBadge: false })
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [defaultCluster()],
      isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0,
    })
    mockUseCachedNamespaces.mockReturnValue({
      namespaces: ['default', 'kube-system'],
      isDemoFallback: false,
      isRefreshing: false,
    })
  })

  describe('Skeleton state', () => {
    it('renders skeleton when loading', () => {
      mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })
      render(<NamespaceQuotas />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('Error / empty state', () => {
    it('renders error empty state when clusters fail to load', () => {
      mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: true })
      render(<NamespaceQuotas />)
      expect(screen.getByTestId('card-empty-state')).toBeTruthy()
    })
  })

  describe('Normal render', () => {
    it('renders without crashing', () => {
      const { container } = render(<NamespaceQuotas />)
      expect(container).toBeTruthy()
    })

    it('calls useCardLoadingState', () => {
      render(<NamespaceQuotas />)
      expect(mockUseCardLoadingState).toHaveBeenCalled()
    })

    it('renders quotas list component', () => {
      render(<NamespaceQuotas />)
      expect(screen.getByTestId('quotas-list')).toBeTruthy()
    })

    it('renders cluster dropdown with "All Clusters" option', () => {
      render(<NamespaceQuotas />)
      expect(screen.getByText(/All Clusters/)).toBeTruthy()
    })

    it('renders namespaces option in namespace selector', () => {
      render(<NamespaceQuotas />)
      expect(screen.getByText('namespaceQuotas.allNamespaces')).toBeTruthy()
    })
  })

  describe('Status badge', () => {
    it('renders quotas count status badge', () => {
      render(<NamespaceQuotas />)
      const badge = screen.getByTestId('status-badge')
      expect(badge.textContent).toContain('quotas')
    })
  })

  describe('Config prop', () => {
    it('accepts cluster config without crashing', () => {
      const { container } = render(<NamespaceQuotas config={{ cluster: 'prod', namespace: 'default' }} />)
      expect(container).toBeTruthy()
    })
  })
})
