import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ComplianceScoreCard } from '../ComplianceScoreCard'
import type { KubescapeClusterStatus } from '../../../../hooks/useKubescape'
import type { KyvernoClusterStatus } from '../../../../hooks/useKyverno'

type TranslationOptions = {
  checked?: number
  total?: number
  reporting?: number
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: TranslationOptions) => {
      if (opts?.checked != null && opts?.total != null) {
        return `checking-${opts.checked}-${opts.total}`
      }
      if (opts?.reporting != null && opts?.total != null) {
        return `partial-${opts.reporting}-${opts.total}`
      }
      return key
    },
  }),
}))

const mockUseKubescape = vi.fn()
vi.mock('../../../../hooks/useKubescape', () => ({
  useKubescape: () => mockUseKubescape(),
}))

const mockUseKyverno = vi.fn()
vi.mock('../../../../hooks/useKyverno', () => ({
  useKyverno: () => mockUseKyverno(),
}))

const mockStartMission = vi.fn()
vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: mockStartMission }),
}))

const mockSelectedClusters = vi.fn(() => [] as string[])
vi.mock('../../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: mockSelectedClusters() }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

vi.mock('../../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

vi.mock('../ComplianceScoreBreakdownModal', () => ({
  ComplianceScoreBreakdownModal: ({ isOpen, score }: { isOpen: boolean; score: number }) =>
    isOpen ? <div data-testid="breakdown-modal">score:{score}</div> : null,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKubescapeStatus(overrides: Partial<KubescapeClusterStatus> = {}): KubescapeClusterStatus {
  return {
    cluster: 'prod',
    installed: true,
    loading: false,
    overallScore: 80,
    frameworks: [],
    totalControls: 10,
    passedControls: 8,
    failedControls: 2,
    controls: [],
    ...overrides,
  }
}

function makeKyvernoStatus(overrides: Partial<KyvernoClusterStatus> = {}): KyvernoClusterStatus {
  return {
    cluster: 'prod',
    installed: true,
    loading: false,
    policies: [],
    reports: [],
    totalPolicies: 1,
    totalViolations: 0,
    enforcingCount: 0,
    auditCount: 0,
    ...overrides,
  }
}

function setupHooks({
  kubescape = {},
  kyverno = {},
  selectedClusters = [],
}: {
  kubescape?: Record<string, unknown>
  kyverno?: Record<string, unknown>
  selectedClusters?: string[]
} = {}) {
  mockUseKubescape.mockReturnValue({
    statuses: {},
    aggregated: { overallScore: 0, frameworks: [], totalControls: 0, passedControls: 0, failedControls: 0 },
    isLoading: false,
    isRefreshing: false,
    lastRefresh: null,
    isDemoData: false,
    installed: false,
    hasErrors: false,
    clustersChecked: 0,
    totalClusters: 0,
    unavailableReason: undefined,
    refetch: vi.fn(),
    ...kubescape,
  })
  mockUseKyverno.mockReturnValue({
    statuses: {},
    isLoading: false,
    isRefreshing: false,
    lastRefresh: null,
    isDemoData: false,
    installed: false,
    hasErrors: false,
    clustersChecked: 0,
    totalClusters: 0,
    unavailableReason: undefined,
    refetch: vi.fn(),
    ...kyverno,
  })
  mockUseCardLoadingState.mockReturnValue({})
  mockSelectedClusters.mockReturnValue(selectedClusters)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComplianceScoreCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupHooks()
  })

  describe('loading state', () => {
    it('shows checking clusters progress while not all clusters have reported', () => {
      setupHooks({
        kubescape: { isLoading: true, totalClusters: 2, clustersChecked: 1 },
        kyverno: { isLoading: true, totalClusters: 2, clustersChecked: 1 },
      })
      render(<ComplianceScoreCard config={{}} />)
      expect(screen.getByText('checking-1-2')).toBeInTheDocument()
    })
  })

  describe('no tools installed / empty state', () => {
    it('shows install prompt when neither tool is installed', () => {
      render(<ComplianceScoreCard config={{}} />)
      expect(screen.getByText('cards:complianceScore.noToolsDetected')).toBeInTheDocument()
      expect(screen.getByText(/cards:complianceScore.installWithMission/)).toBeInTheDocument()
    })

    it('starts a deploy mission when the install link is clicked', async () => {
      render(<ComplianceScoreCard config={{}} />)
      await userEvent.click(screen.getByText(/cards:complianceScore.installWithMission/))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'deploy', title: 'Install Compliance Tools' }),
      )
    })
  })

  describe('representative mock data', () => {
    it('renders the aggregated score and per-tool breakdown bars', () => {
      const statuses = { prod: makeKubescapeStatus({ overallScore: 90 }) }
      setupHooks({
        kubescape: { installed: true, statuses, aggregated: { overallScore: 90, frameworks: [], totalControls: 10, passedControls: 9, failedControls: 1 } },
      })
      render(<ComplianceScoreCard config={{}} />)
      expect(screen.getByText('Kubescape')).toBeInTheDocument()
    })

    it('renders cluster badges for installed clusters when not using demo data', () => {
      const statuses = { prod: makeKubescapeStatus() }
      setupHooks({ kubescape: { installed: true, statuses } })
      render(<ComplianceScoreCard config={{}} />)
      expect(screen.getByTestId('status-badge')).toHaveTextContent('prod')
    })

    it('opens the breakdown modal when the score gauge is clicked', async () => {
      const statuses = { prod: makeKubescapeStatus() }
      setupHooks({ kubescape: { installed: true, statuses } })
      render(<ComplianceScoreCard config={{}} />)
      await userEvent.click(screen.getByRole('button', { name: 'cards:complianceScore.viewBreakdownAria' }))
      expect(screen.getByTestId('breakdown-modal')).toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('shows the unavailable placeholder when both tools are unavailable', () => {
      setupHooks({
        kubescape: { unavailableReason: 'no-agent' },
        kyverno: { unavailableReason: 'no-agent' },
      })
      render(<ComplianceScoreCard config={{}} />)
      expect(screen.getByText('Compliance scoring not available')).toBeInTheDocument()
    })
  })

  describe('useCardLoadingState integration', () => {
    it('marks isFailed when both tools report errors', () => {
      setupHooks({ kubescape: { hasErrors: true }, kyverno: { hasErrors: true } })
      render(<ComplianceScoreCard config={{}} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isFailed: true }),
      )
    })

    it('passes isDemoData=true when either tool returns demo data', () => {
      setupHooks({ kubescape: { isDemoData: true } })
      render(<ComplianceScoreCard config={{}} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true }),
      )
    })
  })
})
