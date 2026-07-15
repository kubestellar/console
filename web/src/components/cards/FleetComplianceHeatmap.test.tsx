import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import FleetComplianceHeatmap from './FleetComplianceHeatmap'

const mockUseKyverno = vi.hoisted(() => vi.fn())
const mockUseTrivy = vi.hoisted(() => vi.fn())
const mockUseKubescape = vi.hoisted(() => vi.fn())
const mockUseClusters = vi.hoisted(() => vi.fn())
const mockUseCardLoadingState = vi.hoisted(() => vi.fn())
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }) }))
vi.mock('../../hooks/useKyverno', () => ({ useKyverno: () => mockUseKyverno() }))
vi.mock('../../hooks/useTrivy', () => ({ useTrivy: () => mockUseTrivy() }))
vi.mock('../../hooks/useKubescape', () => ({ useKubescape: () => mockUseKubescape() }))
vi.mock('../../hooks/useGlobalFilters', () => ({ useGlobalFilters: () => ({ selectedClusters: [], isAllClustersSelected: true }) }))
vi.mock('../../hooks/useMCP', () => ({ useClusters: () => mockUseClusters() }))
vi.mock('../../hooks/useDemoMode', () => ({ useDemoMode: () => ({ isDemoMode: false }) }))
vi.mock('../../hooks/useMissions', () => ({ useMissions: () => ({ startMission: vi.fn() }) }))
vi.mock('./CardDataContext', () => ({ useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args) }))
vi.mock('./kyverno/KyvernoDetailModal', () => ({ KyvernoDetailModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="kyverno-modal" /> : null }))
vi.mock('./trivy/TrivyDetailModal', () => ({ TrivyDetailModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="trivy-modal" /> : null }))
vi.mock('./kubescape/KubescapeDetailModal', () => ({ KubescapeDetailModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="kubescape-modal" /> : null }))
vi.mock('../ui/RefreshIndicator', () => ({ RefreshIndicator: () => null }))
vi.mock('../ui/Button', () => ({ Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button> }))

function setup(overrides: { kyverno?: Record<string, unknown>; trivy?: Record<string, unknown>; kubescape?: Record<string, unknown>; clusters?: Record<string, unknown> } = {}) {
  const baseHook = { statuses: {}, isLoading: false, isRefreshing: false, isDemoData: false, installed: false, refetch: vi.fn(), clustersChecked: 0, totalClusters: 0, lastRefresh: null }
  mockUseKyverno.mockReturnValue({ ...baseHook, ...overrides.kyverno })
  mockUseTrivy.mockReturnValue({ ...baseHook, ...overrides.trivy })
  mockUseKubescape.mockReturnValue({ ...baseHook, ...overrides.kubescape })
  mockUseClusters.mockReturnValue({ deduplicatedClusters: [], consecutiveFailures: 0, ...overrides.clusters })
  mockUseCardLoadingState.mockReturnValue({})
}

describe('FleetComplianceHeatmap', () => {
  beforeEach(() => { vi.clearAllMocks(); setup() })
  it('renders loading skeleton/loading state', () => { setup({ kyverno: { isLoading: true } }); render(<FleetComplianceHeatmap config={{}} />); expect(screen.getByText('fleetCompliance.scanningClusters')).toBeInTheDocument() })
  it('renders empty state', () => { render(<FleetComplianceHeatmap config={{}} />); expect(screen.getByText('fleetCompliance.noClusters')).toBeInTheDocument() })
  it('renders error state', () => { const err = { a: { error: 'x' } }; setup({ kyverno: { statuses: err }, trivy: { statuses: err }, kubescape: { statuses: err } }); render(<FleetComplianceHeatmap config={{}} />); expect(screen.getByText('Failed to load compliance data')).toBeInTheDocument() })
  it('renders happy-path data', () => { setup({ clusters: { deduplicatedClusters: [{ name: 'prod' }] }, kyverno: { installed: true, statuses: { prod: { installed: true, totalPolicies: 2, totalViolations: 1, policies: [{ name: 'p' }] } } }, trivy: { installed: true, statuses: { prod: { installed: true, totalReports: 1, vulnerabilities: { critical: 0, high: 1, medium: 0, low: 0 } } } }, kubescape: { installed: true, statuses: { prod: { installed: true, overallScore: 85, totalControls: 10, passedControls: 9 } } } }); render(<FleetComplianceHeatmap config={{}} />); expect(screen.getByText('prod')).toBeInTheDocument(); expect(screen.getByText('1 violations')).toBeInTheDocument(); expect(screen.getByText('85%')).toBeInTheDocument() })
  it('matches snapshot', () => { setup({ clusters: { deduplicatedClusters: [{ name: 'prod' }] }, kyverno: { installed: true, statuses: { prod: { installed: true, totalPolicies: 1, totalViolations: 0, policies: [] } } } }); const { container } = render(<FleetComplianceHeatmap config={{}} />); expect(container).toMatchSnapshot() })
})
