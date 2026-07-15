import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KyvernoPolicies } from './KyvernoPolicies'

const mockUseKyverno = vi.hoisted(() => vi.fn())
const mockUseCardLoadingState = vi.hoisted(() => vi.fn())
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }) }))
vi.mock('../../hooks/useKyverno', () => ({ useKyverno: () => mockUseKyverno() }))
vi.mock('../../hooks/useMissions', () => ({ useMissions: () => ({ startMission: vi.fn() }) }))
vi.mock('../../hooks/useGlobalFilters', () => ({ useGlobalFilters: () => ({ selectedClusters: [] }) }))
vi.mock('../../hooks/useDrillDown', () => ({ useDrillDownActions: () => ({ drillToPolicy: vi.fn() }) }))
vi.mock('./CardDataContext', () => ({ useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args) }))
vi.mock('./kyverno/KyvernoDetailModal', () => ({ KyvernoDetailModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="kyverno-modal" /> : null }))
vi.mock('../ui/RefreshIndicator', () => ({ RefreshIndicator: () => null }))
vi.mock('./DynamicCardErrorBoundary', () => ({ DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../../lib/cards/CardComponents', () => ({ CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <input data-testid="search-input" value={value} onChange={e => onChange(e.target.value)} /> }))
vi.mock('../ui/StatusBadge', () => ({ StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }))

function setup(overrides: Record<string, unknown> = {}) {
  mockUseKyverno.mockReturnValue({ statuses: {}, isLoading: false, isRefreshing: false, lastRefresh: null, installed: false, hasErrors: false, isDemoData: false, refetch: vi.fn(), clustersChecked: 0, totalClusters: 0, ...overrides })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
}

describe('KyvernoPolicies', () => {
  beforeEach(() => { vi.clearAllMocks(); setup() })
  it('renders loading skeleton/loading state', () => { setup({ isLoading: true, totalClusters: 2, clustersChecked: 1 }); render(<KyvernoPolicies config={{}} />); expect(screen.getByText('kyvernoPolicies.scanningClusters')).toBeInTheDocument() })
  it('renders empty state when Kyverno is not installed', () => { render(<KyvernoPolicies config={{}} />); expect(screen.getByText('Kyverno Integration')).toBeInTheDocument() })
  it('renders error state', () => { setup({ hasErrors: true }); render(<KyvernoPolicies config={{}} />); expect(screen.getByText('Failed to fetch scanner data')).toBeInTheDocument() })
  it('renders happy-path policy data', () => { setup({ installed: true, statuses: { prod: { cluster: 'prod', installed: true, totalPolicies: 1, enforcingCount: 1, totalViolations: 2, policies: [{ name: 'require-labels', category: 'Best Practices', description: 'labels', status: 'audit', kind: 'ClusterPolicy', cluster: 'prod', namespace: '', violations: 2, background: true }] } } }); render(<KyvernoPolicies config={{}} />); expect(screen.getByText('require-labels')).toBeInTheDocument(); expect(screen.getByText('prod: 1p/2v')).toBeInTheDocument() })
  it('matches snapshot', () => { setup({ installed: true, statuses: { prod: { cluster: 'prod', installed: true, totalPolicies: 1, enforcingCount: 1, totalViolations: 0, policies: [{ name: 'disallow-privileged', category: 'Pod Security', description: 'secure', status: 'enforcing', kind: 'ClusterPolicy', cluster: 'prod', namespace: '', violations: 0, background: true }] } } }); const { container } = render(<KyvernoPolicies config={{}} />); expect(container).toMatchSnapshot() })
})
