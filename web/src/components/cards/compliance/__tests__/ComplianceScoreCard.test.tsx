import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ComplianceScoreCard } from '../ComplianceScoreCard'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: { checked?: number; total?: number; reporting?: number }) => {
      if (opts?.checked != null && opts?.total != null) return `checking-${opts.checked}-${opts.total}`
      if (opts?.reporting != null && opts?.total != null) return `partial-${opts.reporting}-${opts.total}`
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

const mockSelectedClusters = vi.fn(() => [] as string[])
vi.mock('../../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: mockSelectedClusters() }),
}))

const mockStartMission = vi.fn()
vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: mockStartMission }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children, color }: { children: ReactNode; color: string }) => (
    <span data-testid="status-badge" data-color={color}>{children}</span>
  ),
}))

vi.mock('../ComplianceScoreBreakdownModal', () => ({
  ComplianceScoreBreakdownModal: ({
    isOpen,
    score,
  }: {
    isOpen: boolean
    score: number
  }) =>
    isOpen ? <div data-testid="breakdown-modal">{score}</div> : null,
}))

vi.mock('../../../../lib/complianceScore', () => ({
  buildComplianceScoreSummary: vi.fn(() => ({
    score: 75,
    breakdown: [{ name: 'Kubescape', value: 75 }],
    usingFallback: false,
  })),
}))

vi.mock('../../../../lib/constants/compliance', () => ({
  CARD_DESCRIPTIONS: {
    compliance_score: { description: 'Aggregated compliance score' },
  },
  getScoreContext: vi.fn((score: number) => ({
    label: score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'Poor',
    color: score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400',
    description: 'Security posture overview',
  })),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKubescapeReturn(overrides: Record<string, unknown> = {}) {
  return {
    statuses: {},
    aggregated: { overallScore: 75, frameworks: [], totalControls: 10, passedControls: 7, failedControls: 3 },
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    installed: false,
    hasErrors: false,
    clustersChecked: 0,
    totalClusters: 0,
    unavailableReason: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

function makeKyvernoReturn(overrides: Record<string, unknown> = {}) {
  return {
    statuses: {},
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    installed: false,
    hasErrors: false,
    clustersChecked: 0,
    totalClusters: 0,
    unavailableReason: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

function setup(ksOverrides: Record<string, unknown> = {}, kyOverrides: Record<string, unknown> = {}) {
  mockUseKubescape.mockReturnValue(makeKubescapeReturn(ksOverrides))
  mockUseKyverno.mockReturnValue(makeKyvernoReturn(kyOverrides))
  mockUseCardLoadingState.mockReturnValue({})
  mockSelectedClusters.mockReturnValue([])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComplianceScoreCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  describe('unavailable state', () => {
    it('shows unavailable message when both tools have unavailable reason', () => {
      setup(
        { unavailableReason: 'no agent' },
        { unavailableReason: 'no agent' },
      )
      render(<ComplianceScoreCard config={{}} />)
      expect(screen.getByText('Compliance scoring not available')).toBeInTheDocument()
      expect(screen.getByText('Requires kc-agent (local agent mode)')).toBeInTheDocument()
    })
  })

  describe('no tools installed', () => {
    it('shows install prompt when neither tool is installed and not in demo mode', () => {
      setup({ installed: false, totalClusters: 1, clustersChecked: 1 }, { installed: false, totalClusters: 1, clustersChecked: 1 })
      render(<ComplianceScoreCard config={{}} />)
      expect(screen.getByText('cards:complianceScore.noToolsDetected')).toBeInTheDocument()
      expect(screen.getByText(/cards:complianceScore.installWithMission/)).toBeInTheDocument()
    })

    it('starts install mission when install button is clicked', async () => {
      setup({ installed: false, totalClusters: 1, clustersChecked: 1 }, { installed: false, totalClusters: 1, clustersChecked: 1 })
      render(<ComplianceScoreCard config={{}} />)
      await userEvent.click(screen.getByText(/cards:complianceScore.installWithMission/))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'deploy' }),
      )
    })
  })

  describe('score display', () => {
    it('renders the score percentage in the gauge', () => {
      setup({ installed: true, totalClusters: 1, clustersChecked: 1 }, { installed: false })
      render(<ComplianceScoreCard config={{}} />)
      expect(screen.getByText('75%')).toBeInTheDocument()
    })

    it('renders card description info text', () => {
      setup({ installed: true, totalClusters: 1, clustersChecked: 1 }, { installed: false })
      render(<ComplianceScoreCard config={{}} />)
      expect(screen.getByText('Aggregated compliance score')).toBeInTheDocument()
    })

    it('renders score context label', () => {
      setup({ installed: true, totalClusters: 1, clustersChecked: 1 }, { installed: false })
      render(<ComplianceScoreCard config={{}} />)
      expect(screen.getByText('Fair')).toBeInTheDocument()
    })

    it('opens breakdown modal when gauge is clicked', async () => {
      setup({ installed: true, totalClusters: 1, clustersChecked: 1 }, { installed: false })
      render(<ComplianceScoreCard config={{}} />)
      const gauge = screen.getByRole('button', { name: 'cards:complianceScore.viewBreakdownAria' })
      await userEvent.click(gauge)
      expect(screen.getByTestId('breakdown-modal')).toBeInTheDocument()
    })
  })

  describe('cluster badges', () => {
    it('renders cluster badges for installed kubescape clusters', () => {
      const statuses = {
        prod: { cluster: 'prod', installed: true, loading: false, overallScore: 80, frameworks: [], totalControls: 10, passedControls: 8, failedControls: 2, controls: [] },
      }
      setup({ installed: true, statuses, totalClusters: 1, clustersChecked: 1 }, { installed: false, statuses: {} })
      render(<ComplianceScoreCard config={{}} />)
      expect(screen.getByText('prod')).toBeInTheDocument()
    })
  })

  describe('useCardLoadingState integration', () => {
    it('passes isDemoData=true when any tool returns demo data', () => {
      setup({ isDemoData: true })
      render(<ComplianceScoreCard config={{}} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true }),
      )
    })

    it('passes isFailed=true when both tools have errors', () => {
      setup({ hasErrors: true }, { hasErrors: true })
      render(<ComplianceScoreCard config={{}} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isFailed: true }),
      )
    })
  })

  describe('checking progress indicator', () => {
    it('shows progress indicator while clusters are being checked', () => {
      setup({ totalClusters: 3, clustersChecked: 1, installed: true }, { totalClusters: 3, clustersChecked: 1 })
      render(<ComplianceScoreCard config={{}} />)
      expect(screen.getByText('checking-1-3')).toBeInTheDocument()
    })
  })
})
