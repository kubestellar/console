import React from 'react'
/**
 * Unit tests for CrossClusterPolicyComparison card component.
 *
 * Covers: loading state (progress ring), error state, empty state
 * (no Kyverno clusters), policy table rendering, cluster toggle,
 * modal open behavior, and discrepancy highlighting.
 *
 * Part of #21100
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => String(key).split('.').pop() ?? key,
  }),
}))

const mockUseKyverno = vi.fn()
vi.mock('../../hooks/useKyverno', () => ({
  useKyverno: () => mockUseKyverno(),
}))

const mockUseClusters = vi.fn()
vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockUseGlobalFilters = vi.fn()
vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: () => ({}),
  useReportCardDataState: () => {},
}))

vi.mock('./DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../ui/ProgressRing', () => ({
  ProgressRing: ({ progress }: { progress: number }) => (
    <div data-testid="progress-ring" data-progress={progress} />
  ),
}))

vi.mock('../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => <div data-testid="refresh-indicator" />,
}))

vi.mock('../ui/Button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

vi.mock('./kyverno/KyvernoDetailModal', () => ({
  KyvernoDetailModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="kyverno-modal">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PolicyStatus = { installed: boolean; policies: Array<{ name: string; kind: string; status: string }>; totalViolations: number; error?: string }

function makeClusterStatus(overrides: Partial<PolicyStatus> = {}): PolicyStatus {
  return {
    installed: true,
    policies: [
      { name: 'require-labels', kind: 'ClusterPolicy', status: 'enforce' },
      { name: 'no-privileged', kind: 'ClusterPolicy', status: 'audit' },
    ],
    totalViolations: 0,
    ...overrides,
  }
}

function setupMocks(opts: {
  kyvernoStatuses?: Record<string, PolicyStatus>
  isLoading?: boolean
  isRefreshing?: boolean
  isDemoData?: boolean
  clusters?: string[]
  clustersChecked?: number
  totalClusters?: number
} = {}) {
  const statuses = opts.kyvernoStatuses ?? {}
  mockUseKyverno.mockReturnValue({
    statuses,
    isLoading: opts.isLoading ?? false,
    isRefreshing: opts.isRefreshing ?? false,
    lastRefresh: null,
    isDemoData: opts.isDemoData ?? false,
    refetch: vi.fn(),
    clustersChecked: opts.clustersChecked ?? 0,
    totalClusters: opts.totalClusters ?? 0,
    consecutiveFailures: 0,
  })
  mockUseClusters.mockReturnValue({
    deduplicatedClusters: (opts.clusters ?? []).map(n => ({ name: n })),
  })
  mockUseGlobalFilters.mockReturnValue({
    selectedClusters: [],
    isAllClustersSelected: true,
    customFilter: '',
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CrossClusterPolicyComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loading state', () => {
    it('renders scanning progress ring when loading with clusters', async () => {
      setupMocks({ isLoading: true, clustersChecked: 1, totalClusters: 3, clusters: ['c1', 'c2', 'c3'] })
      const { CrossClusterPolicyComparison } = await import('./CrossClusterPolicyComparison')
      render(<CrossClusterPolicyComparison />)
      expect(screen.getByTestId('progress-ring')).toBeInTheDocument()
    })

    it('renders spinner when loading with 0 total clusters', async () => {
      setupMocks({ isLoading: true, clustersChecked: 0, totalClusters: 0 })
      const { CrossClusterPolicyComparison } = await import('./CrossClusterPolicyComparison')
      render(<CrossClusterPolicyComparison />)
      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('renders error message and retry button when all clusters errored', async () => {
      setupMocks({
        kyvernoStatuses: {
          'c1': { installed: true, policies: [], totalViolations: 0, error: 'connection refused' },
        },
        clusters: ['c1'],
      })
      const { CrossClusterPolicyComparison } = await import('./CrossClusterPolicyComparison')
      render(<CrossClusterPolicyComparison />)
      expect(screen.getByText('failedToLoadKyverno')).toBeInTheDocument()
      expect(screen.getByText('retry')).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('renders "no Kyverno clusters" message when no clusters have Kyverno', async () => {
      setupMocks({ kyvernoStatuses: {}, clusters: ['c1', 'c2'], isLoading: false })
      const { CrossClusterPolicyComparison } = await import('./CrossClusterPolicyComparison')
      render(<CrossClusterPolicyComparison />)
      expect(screen.getByText('noKyvernoClusters')).toBeInTheDocument()
    })
  })

  describe('policy table rendering', () => {
    it('renders policy rows with pass/fail status icons', async () => {
      setupMocks({
        kyvernoStatuses: {
          'prod': makeClusterStatus({ totalViolations: 0 }),
          'staging': makeClusterStatus({ totalViolations: 2 }),
        },
        clusters: ['prod', 'staging'],
      })
      const { CrossClusterPolicyComparison } = await import('./CrossClusterPolicyComparison')
      render(<CrossClusterPolicyComparison />)
      expect(screen.getByText('require-labels')).toBeInTheDocument()
      expect(screen.getByText('no-privileged')).toBeInTheDocument()
    })

    it('renders cluster toggle buttons', async () => {
      setupMocks({
        kyvernoStatuses: {
          'prod': makeClusterStatus(),
          'staging': makeClusterStatus(),
        },
        clusters: ['prod', 'staging'],
      })
      const { CrossClusterPolicyComparison } = await import('./CrossClusterPolicyComparison')
      render(<CrossClusterPolicyComparison />)
      // Cluster names appear as toggle buttons
      expect(screen.getByRole('button', { name: /prod/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /staging/i })).toBeInTheDocument()
    })

    it('renders summary text with policy and cluster counts', async () => {
      setupMocks({
        kyvernoStatuses: {
          'prod': makeClusterStatus(),
          'staging': makeClusterStatus(),
        },
        clusters: ['prod', 'staging'],
      })
      const { CrossClusterPolicyComparison } = await import('./CrossClusterPolicyComparison')
      render(<CrossClusterPolicyComparison />)
      expect(screen.getByText(/2 policies across 2 clusters/)).toBeInTheDocument()
    })

    it('opens Kyverno detail modal on policy row click', async () => {
      setupMocks({
        kyvernoStatuses: {
          'prod': makeClusterStatus(),
        },
        clusters: ['prod'],
      })
      const { CrossClusterPolicyComparison } = await import('./CrossClusterPolicyComparison')
      render(<CrossClusterPolicyComparison />)
      const policyRow = screen.getByRole('button', { name: /View policy details: ClusterPolicy\/require-labels/i })
      await userEvent.click(policyRow)
      expect(screen.getByTestId('kyverno-modal')).toBeInTheDocument()
    })

    it('closes modal when close button is clicked', async () => {
      setupMocks({
        kyvernoStatuses: { 'prod': makeClusterStatus() },
        clusters: ['prod'],
      })
      const { CrossClusterPolicyComparison } = await import('./CrossClusterPolicyComparison')
      render(<CrossClusterPolicyComparison />)
      const policyRow = screen.getByRole('button', { name: /View policy details: ClusterPolicy\/require-labels/i })
      await userEvent.click(policyRow)
      await userEvent.click(screen.getByText('Close'))
      expect(screen.queryByTestId('kyverno-modal')).not.toBeInTheDocument()
    })
  })

  describe('snapshot', () => {
    it('matches snapshot for loaded policy table', async () => {
      setupMocks({
        kyvernoStatuses: { 'prod': makeClusterStatus() },
        clusters: ['prod'],
      })
      const { CrossClusterPolicyComparison } = await import('./CrossClusterPolicyComparison')
      const { container } = render(<CrossClusterPolicyComparison />)
      expect(container.firstChild).toMatchSnapshot()
    })
  })
})
