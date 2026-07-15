import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SecurityIssues } from './SecurityIssues'

const mockUseCachedSecurityIssues = vi.hoisted(() => vi.fn())
const mockUseCardLoadingState = vi.hoisted(() => vi.fn())
const mockUseCardData = vi.hoisted(() => vi.fn())

vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown> | string) => typeof opts === 'string' ? opts : key, i18n: { language: 'en', changeLanguage: vi.fn() } }) }))
vi.mock('../../hooks/useCachedData', () => ({ useCachedSecurityIssues: () => mockUseCachedSecurityIssues() }))
vi.mock('../../hooks/useDrillDown', () => ({ useDrillDownActions: () => ({ drillToPod: vi.fn() }) }))
vi.mock('./CardDataContext', () => ({ useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args), useCardDemoState: () => ({ shouldUseDemoData: false }) }))
vi.mock('../../lib/cards/cardHooks', () => ({ useCardData: (...args: unknown[]) => mockUseCardData(...args) }))
vi.mock('./DynamicCardErrorBoundary', () => ({ DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../ui/LimitedAccessWarning', () => ({ LimitedAccessWarning: () => null }))
vi.mock('../../lib/cards/CardComponents', () => ({ CardClusterFilter: () => null, CardSearchInput: () => null, CardAIActions: () => null }))
vi.mock('../ui/CardControls', () => ({ CardControls: () => null }))
vi.mock('../ui/Pagination', () => ({ Pagination: () => null }))
vi.mock('../ui/ClusterBadge', () => ({ ClusterBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }))
vi.mock('../ui/StatusBadge', () => ({ StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }))

const issue = { name: 'api-pod', namespace: 'prod-ns', cluster: 'prod', issue: 'Privileged container', severity: 'high', details: 'privileged mode' }
function setup(overrides: Record<string, unknown> = {}, loadingState: Record<string, unknown> = {}) {
  const issues = (overrides.issues as unknown[]) ?? []
  mockUseCachedSecurityIssues.mockReturnValue({ issues, isLoading: false, isRefreshing: false, isDemoFallback: false, error: null, isFailed: false, consecutiveFailures: 0, lastRefresh: null, ...overrides })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, ...loadingState })
  mockUseCardData.mockImplementation((items: unknown[]) => ({ items, totalItems: items.length, currentPage: 1, totalPages: 1, itemsPerPage: 5, goToPage: vi.fn(), needsPagination: false, setItemsPerPage: vi.fn(), filters: { search: '', setSearch: vi.fn(), localClusterFilter: [], toggleClusterFilter: vi.fn(), clearClusterFilter: vi.fn(), availableClusters: [], showClusterFilter: false, setShowClusterFilter: vi.fn(), clusterFilterRef: { current: null } }, sorting: { sortBy: 'severity', setSortBy: vi.fn(), sortDirection: 'desc', setSortDirection: vi.fn() }, containerRef: { current: null }, containerStyle: {} }))
}

describe('SecurityIssues', () => {
  beforeEach(() => { vi.clearAllMocks(); setup() })
  it('renders loading skeleton/loading state', () => { setup({ isLoading: true }, { showSkeleton: true }); const { container } = render(<SecurityIssues config={{}} />); expect(container.querySelector('.animate-pulse')).toBeInTheDocument() })
  it('renders empty state', () => { setup({}, { showEmptyState: true }); render(<SecurityIssues config={{}} />); expect(screen.getByText('securityIssues.noSecurityIssues')).toBeInTheDocument() })
  it('renders error state', () => { setup({ isFailed: true, error: 'api down' }); render(<SecurityIssues config={{}} />); expect(screen.getByText('api down')).toBeInTheDocument() })
  it('renders happy-path data', () => { setup({ issues: [issue] }); render(<SecurityIssues config={{}} />); expect(screen.getByText('api-pod')).toBeInTheDocument(); expect(screen.getByText('Privileged container')).toBeInTheDocument() })
  it('matches snapshot', () => { setup({ issues: [issue] }); const { container } = render(<SecurityIssues config={{}} />); expect(container).toMatchSnapshot() })
})
