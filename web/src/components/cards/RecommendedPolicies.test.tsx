import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecommendedPolicies } from './RecommendedPolicies'

const mockUseKyverno = vi.hoisted(() => vi.fn())
const mockUseKubescape = vi.hoisted(() => vi.fn())
const mockUseTrivy = vi.hoisted(() => vi.fn())
const mockUseClusters = vi.hoisted(() => vi.fn())
const mockUseCardLoadingState = vi.hoisted(() => vi.fn())

vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }) }))
vi.mock('../../hooks/useKyverno', () => ({ useKyverno: () => mockUseKyverno() }))
vi.mock('../../hooks/useKubescape', () => ({ useKubescape: () => mockUseKubescape() }))
vi.mock('../../hooks/useTrivy', () => ({ useTrivy: () => mockUseTrivy() }))
vi.mock('../../hooks/useMCP', () => ({ useClusters: () => mockUseClusters() }))
vi.mock('../../hooks/useMissions', () => ({ useMissions: () => ({ startMission: vi.fn() }) }))
vi.mock('../../hooks/useGlobalFilters', () => ({ useGlobalFilters: () => ({ selectedClusters: [], isAllClustersSelected: true }) }))
vi.mock('../../hooks/useDemoMode', () => ({ useDemoMode: () => ({ isDemoMode: false }) }))
vi.mock('./CardDataContext', () => ({ useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args) }))
vi.mock('./DynamicCardErrorBoundary', () => ({ DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../ui/StatusBadge', () => ({ StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }))

function setup(overrides: { kyverno?: Record<string, unknown>; kubescape?: Record<string, unknown>; trivy?: Record<string, unknown>; clusters?: Record<string, unknown> } = {}) {
  mockUseKyverno.mockReturnValue({ statuses: {}, isLoading: false, isRefreshing: false, installed: false, isDemoData: false, clustersChecked: 0, totalClusters: 0, ...overrides.kyverno })
  mockUseKubescape.mockReturnValue({ isLoading: false, isRefreshing: false, installed: false, isDemoData: false, clustersChecked: 0, totalClusters: 0, ...overrides.kubescape })
  mockUseTrivy.mockReturnValue({ isLoading: false, isRefreshing: false, installed: false, isDemoData: false, clustersChecked: 0, totalClusters: 0, ...overrides.trivy })
  mockUseClusters.mockReturnValue({ deduplicatedClusters: [], isFailed: false, consecutiveFailures: 0, ...overrides.clusters })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
}

describe('RecommendedPolicies', () => {
  beforeEach(() => { vi.clearAllMocks(); setup() })
  it('renders loading skeleton/loading state', () => {
    setup({ kyverno: { isLoading: true, totalClusters: 2, clustersChecked: 0 }, kubescape: { isLoading: true, totalClusters: 2, clustersChecked: 0 }, trivy: { isLoading: true, totalClusters: 2, clustersChecked: 0 } })
    render(<RecommendedPolicies config={{}} />)
    expect(screen.getByText('Scanning clusters...')).toBeInTheDocument()
  })
  it('renders empty state when no tools are installed', () => {
    render(<RecommendedPolicies config={{}} />)
    expect(screen.getByText('No Compliance Tools Detected')).toBeInTheDocument()
  })
  it('renders error state through card loading state', () => {
    setup({ clusters: { isFailed: true, consecutiveFailures: 3 } })
    render(<RecommendedPolicies config={{}} />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(expect.objectContaining({ isFailed: true, consecutiveFailures: 3 }))
  })
  it('renders happy-path data', () => {
    setup({ clusters: { deduplicatedClusters: [{ name: 'prod' }] }, kyverno: { installed: true, statuses: { prod: { installed: true, policies: [{ name: 'require-labels' }] } } } })
    render(<RecommendedPolicies config={{}} />)
    expect(screen.getByText('Fleet Coverage')).toBeInTheDocument()
    expect(screen.getByText('Security Hardening')).toBeInTheDocument()
  })
  it('matches snapshot', () => {
    setup({ clusters: { deduplicatedClusters: [{ name: 'prod' }] }, kyverno: { installed: true, statuses: { prod: { installed: true, policies: [] } } } })
    const { container } = render(<RecommendedPolicies config={{}} />)
    expect(container).toMatchSnapshot()
  })
})
