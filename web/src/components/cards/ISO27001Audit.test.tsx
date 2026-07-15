import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ISO27001Audit } from './ISO27001Audit'

const mockUseCachedISO27001Audit = vi.hoisted(() => vi.fn())
const mockUseCardLoadingState = vi.hoisted(() => vi.fn())
const mockUseCardData = vi.hoisted(() => vi.fn())

vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key, i18n: { language: 'en', changeLanguage: vi.fn() } }) }))
vi.mock('../../hooks/useCachedData', () => ({ useCachedISO27001Audit: () => mockUseCachedISO27001Audit() }))
vi.mock('./CardDataContext', () => ({ useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args), useCardDemoState: () => ({ shouldUseDemoData: false }) }))
vi.mock('../../lib/cards/cardHooks', () => ({ useCardData: (...args: unknown[]) => mockUseCardData(...args) }))
vi.mock('../../lib/cards/CardComponents', () => ({ CardClusterFilter: () => null, CardSearchInput: () => null, CardSkeleton: () => <div data-testid="card-skeleton" /> }))
vi.mock('../ui/CardControls', () => ({ CardControls: () => null }))
vi.mock('../ui/Pagination', () => ({ Pagination: () => null }))
vi.mock('../ui/RefreshIndicator', () => ({ RefreshIndicator: () => null }))
vi.mock('../shared/TechnicalAcronym', () => ({ wrapAbbreviations: (text: string) => text }))

const finding = { checkId: 'rbac-1', category: 'RBAC & Access Control', label: 'No wildcard permissions', status: 'fail', cluster: 'prod', severity: 'critical', details: 'wildcard verbs detected' }
function setup(overrides: Record<string, unknown> = {}, loadingState: Record<string, unknown> = {}) {
  const findings = (overrides.findings as unknown[]) ?? []
  mockUseCachedISO27001Audit.mockReturnValue({ findings, isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, lastRefresh: null, ...overrides })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, ...loadingState })
  mockUseCardData.mockImplementation((items: unknown[]) => ({ items, totalItems: items.length, currentPage: 1, totalPages: 1, itemsPerPage: 10, goToPage: vi.fn(), needsPagination: false, setItemsPerPage: vi.fn(), filters: { search: '', setSearch: vi.fn(), localClusterFilter: [], toggleClusterFilter: vi.fn(), clearClusterFilter: vi.fn(), availableClusters: [], showClusterFilter: false, setShowClusterFilter: vi.fn(), clusterFilterRef: { current: null } }, sorting: { sortBy: 'severity', setSortBy: vi.fn(), sortDirection: 'desc', setSortDirection: vi.fn() }, containerRef: { current: null }, containerStyle: {} }))
}

describe('ISO27001Audit', () => {
  beforeEach(() => { vi.clearAllMocks(); setup() })
  it('renders loading skeleton/loading state', () => { setup({ isLoading: true }, { showSkeleton: true }); render(<ISO27001Audit config={{}} />); expect(screen.getByTestId('card-skeleton')).toBeInTheDocument() })
  it('renders empty state', () => { render(<ISO27001Audit config={{}} />); expect(screen.getByText('No audit data')).toBeInTheDocument() })
  it('renders error state', () => { setup({ isFailed: true }); render(<ISO27001Audit config={{}} />); expect(screen.getByText('Failed to load audit data')).toBeInTheDocument() })
  it('renders happy-path data', () => { setup({ findings: [finding] }); render(<ISO27001Audit config={{}} />); expect(screen.getByText('No wildcard permissions')).toBeInTheDocument(); expect(screen.getByText('prod')).toBeInTheDocument() })
  it('matches snapshot', () => { setup({ findings: [finding] }); const { container } = render(<ISO27001Audit config={{}} />); expect(container).toMatchSnapshot() })
})
