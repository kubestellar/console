import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OPAPolicies } from './OPAPolicies'

const mockUseClusters = vi.hoisted(() => vi.fn())
const mockUseCardLoadingState = vi.hoisted(() => vi.fn())
const mockSafeGetJSON = vi.hoisted(() => vi.fn())
const mockRunClusterChecks = vi.hoisted(() => vi.fn())
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }) }))
vi.mock('../../hooks/useMCP', () => ({ useClusters: () => mockUseClusters() }))
vi.mock('../../hooks/useMissions', () => ({ useMissions: () => ({ startMission: vi.fn() }) }))
vi.mock('./CardDataContext', () => ({ useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args), useCardDemoState: () => ({ shouldUseDemoData: false }) }))
vi.mock('../../hooks/mcp/shared', () => ({ agentFetch: vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ clusters: [] }) })) }))
vi.mock('../../hooks/useDemoMode', () => ({ useDemoMode: () => ({ isDemoMode: false }) }))
vi.mock('../../lib/demoMode', () => ({ isDemoMode: () => false }))
vi.mock('../../lib/utils/localStorage', () => ({ safeGetItem: vi.fn(() => '1'), safeGetJSON: () => mockSafeGetJSON(), safeSetItem: vi.fn(), safeSetJSON: vi.fn() }))
vi.mock('./OPAPoliciesModal', () => ({ OPAPoliciesModal: () => null }))
vi.mock('./OPAPoliciesTable', () => ({ OPAPoliciesTable: ({ statuses }: { statuses: Record<string, unknown> }) => <div data-testid="opa-table">{Object.keys(statuses).length} clusters</div> }))
vi.mock('../../lib/modals', () => ({ useModalState: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }) }))
vi.mock('./OPAPolicies.utils', () => ({ createSortComparators: vi.fn(() => ({})), generateDemoStatuses: vi.fn(() => ({})), runClusterChecks: (...args: unknown[]) => mockRunClusterChecks(...args) }))
vi.mock('./DynamicCardErrorBoundary', () => ({ DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../../lib/cards/cardHooks', () => ({ useCardData: (items: Array<{ name: string }>) => ({ items, totalItems: items.length, currentPage: 1, totalPages: 1, itemsPerPage: 5, goToPage: vi.fn(), needsPagination: false, setItemsPerPage: vi.fn(), filters: { search: '', setSearch: vi.fn(), localClusterFilter: [], toggleClusterFilter: vi.fn(), clearClusterFilter: vi.fn(), availableClusters: items, showClusterFilter: false, setShowClusterFilter: vi.fn(), clusterFilterRef: { current: null } }, sorting: { sortBy: 'name', setSortBy: vi.fn(), sortDirection: 'asc', setSortDirection: vi.fn() }, containerRef: { current: null }, containerStyle: {} }) }))

function setup(overrides: Record<string, unknown> = {}) {
  mockUseClusters.mockReturnValue({ deduplicatedClusters: [], isLoading: false, isFailed: false, consecutiveFailures: 0, ...overrides })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
  mockSafeGetJSON.mockReturnValue(null)
  mockRunClusterChecks.mockResolvedValue(undefined)
}

describe('OPAPolicies', () => {
  beforeEach(() => { vi.clearAllMocks(); setup(); sessionStorage.clear() })
  it('renders loading skeleton/loading state', () => { setup({ isLoading: true }); render(<OPAPolicies config={{}} />); expect(screen.getByText('Scanning clusters...')).toBeInTheDocument() })
  it('renders empty state when no clusters have OPA status', () => { render(<OPAPolicies config={{}} />); expect(screen.getByTestId('opa-table')).toHaveTextContent('0 clusters') })
  it('renders error state through card loading state', () => { setup({ isFailed: true, consecutiveFailures: 3 }); render(<OPAPolicies config={{}} />); expect(mockUseCardLoadingState).toHaveBeenCalledWith(expect.objectContaining({ isFailed: true, consecutiveFailures: 3 })) })
  it('renders happy-path cached policy data', () => { setup({ deduplicatedClusters: [{ name: 'prod', healthy: true, reachable: true }] }); mockSafeGetJSON.mockReturnValue({ prod: { cluster: 'prod', installed: true, loading: false, policyCount: 2, violationCount: 0, policies: [] } }); render(<OPAPolicies config={{}} />); expect(screen.getByTestId('opa-table')).toHaveTextContent('1 clusters') })
  it('matches snapshot', () => { setup({ deduplicatedClusters: [{ name: 'prod', healthy: true, reachable: true }] }); mockSafeGetJSON.mockReturnValue({ prod: { cluster: 'prod', installed: true, loading: false, policyCount: 1, violationCount: 0, policies: [] } }); const { container } = render(<OPAPolicies config={{}} />); expect(container).toMatchSnapshot() })
})
