import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ComplianceDrift from './ComplianceDrift'

const mockUseKyverno = vi.hoisted(() => vi.fn())
const mockUseTrivy = vi.hoisted(() => vi.fn())
const mockUseKubescape = vi.hoisted(() => vi.fn())
const mockUseCardLoadingState = vi.hoisted(() => vi.fn())

vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }) }))
vi.mock('../../hooks/useKyverno', () => ({ useKyverno: () => mockUseKyverno() }))
vi.mock('../../hooks/useTrivy', () => ({ useTrivy: () => mockUseTrivy() }))
vi.mock('../../hooks/useKubescape', () => ({ useKubescape: () => mockUseKubescape() }))
vi.mock('../../hooks/useGlobalFilters', () => ({ useGlobalFilters: () => ({ selectedClusters: [], isAllClustersSelected: true }) }))
vi.mock('./CardDataContext', () => ({ useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args) }))
vi.mock('./kyverno/KyvernoDetailModal', () => ({ KyvernoDetailModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="kyverno-modal" /> : null }))
vi.mock('./trivy/TrivyDetailModal', () => ({ TrivyDetailModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="trivy-modal" /> : null }))
vi.mock('./kubescape/KubescapeDetailModal', () => ({ KubescapeDetailModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="kubescape-modal" /> : null }))
vi.mock('../ui/RefreshIndicator', () => ({ RefreshIndicator: () => null }))
vi.mock('../ui/Button', () => ({ Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button> }))
vi.mock('../ui/StatusBadge', () => ({ StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }))

function setup(overrides: { kyverno?: Record<string, unknown>; trivy?: Record<string, unknown>; kubescape?: Record<string, unknown> } = {}) {
  const baseHook = { isLoading: false, isRefreshing: false, isDemoData: false, refetch: vi.fn(), clustersChecked: 0, totalClusters: 0, lastRefresh: null }
  mockUseKyverno.mockReturnValue({ ...baseHook, statuses: {}, ...overrides.kyverno })
  mockUseTrivy.mockReturnValue({ ...baseHook, statuses: {}, ...overrides.trivy })
  mockUseKubescape.mockReturnValue({ ...baseHook, statuses: {}, ...overrides.kubescape })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
}

describe('ComplianceDrift', () => {
  beforeEach(() => { vi.clearAllMocks(); setup() })
  it('renders loading skeleton/loading state', () => { setup({ kyverno: { isLoading: true } }); render(<ComplianceDrift config={{}} />); expect(screen.getByText('complianceDrift.scanning')).toBeInTheDocument() })
  it('renders empty state when all clusters are within baseline', () => { render(<ComplianceDrift config={{}} />); expect(screen.getByText('complianceDrift.allWithinBaseline')).toBeInTheDocument() })
  it('renders error state', () => { const err = { a: { error: 'x' } }; setup({ kyverno: { statuses: err }, trivy: { statuses: err }, kubescape: { statuses: err } }); render(<ComplianceDrift config={{}} />); expect(screen.getByText('complianceDrift.failedToLoad')).toBeInTheDocument() })
  it('renders happy-path drift data', () => { setup({ kyverno: { statuses: { a: { installed: true, policies: [{ violations: 0 }] }, b: { installed: true, policies: [{ violations: 20 }] }, c: { installed: true, policies: [{ violations: 1 }] } } } }); render(<ComplianceDrift config={{}} />); expect(screen.getByText('b')).toBeInTheDocument(); expect(screen.getByText('Kyverno')).toBeInTheDocument() })
  it('matches snapshot', () => { setup({ kubescape: { statuses: { a: { installed: true, overallScore: 95, totalControls: 10 }, b: { installed: true, overallScore: 40, totalControls: 10 }, c: { installed: true, overallScore: 90, totalControls: 10 } } } }); const { container } = render(<ComplianceDrift config={{}} />); expect(container).toMatchSnapshot() })
})
