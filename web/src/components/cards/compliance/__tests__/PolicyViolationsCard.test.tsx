import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PolicyViolationsCard } from '../PolicyViolationsCard'
import type { KyvernoClusterStatus } from '../../../../hooks/useKyverno'

type TranslationOptions = {
  policy?: string
  checked?: number
  total?: number
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: TranslationOptions) => {
      if (opts?.policy != null) return `view-${opts.policy}`
      if (opts?.checked != null && opts?.total != null) {
        return `checking-${opts.checked}-${opts.total}`
      }
      return key
    },
  }),
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

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children, color }: { children: ReactNode; color: string }) => (
    <span data-testid="status-badge" data-color={color}>{children}</span>
  ),
}))

vi.mock('../../kyverno/KyvernoDetailModal', () => ({
  KyvernoDetailModal: () => null,
}))

vi.mock('../PolicyViolationDetailModal', () => ({
  PolicyViolationDetailModal: ({
    isOpen,
    violation,
  }: {
    isOpen: boolean
    violation: { policy: string; count: number } | null
  }) =>
    isOpen && violation ? (
      <div data-testid="violation-detail-modal">{violation.policy}:{violation.count}</div>
    ) : null,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function setupKyverno(
  overrides: Record<string, unknown> = {},
  selectedClusters: string[] = [],
) {
  mockUseKyverno.mockReturnValue({
    statuses: {},
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    installed: false,
    hasErrors: false,
    clustersChecked: 0,
    totalClusters: 0,
    unavailableReason: undefined,
    refetch: vi.fn(),
    ...overrides,
  })
  mockUseCardLoadingState.mockReturnValue({})
  mockSelectedClusters.mockReturnValue(selectedClusters)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PolicyViolationsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupKyverno()
  })

  describe('violation rows', () => {
    it('renders violation rows from Kyverno reports', () => {
      const statuses = {
        prod: makeKyvernoStatus({
          cluster: 'prod',
          reports: [{ name: 'r1', namespace: 'payments', cluster: 'prod', pass: 0, fail: 4, warn: 0, error: 0, skip: 0 }],
        }),
      }
      setupKyverno({ installed: true, statuses })
      render(<PolicyViolationsCard config={{}} />)
      expect(screen.getByText('payments')).toBeInTheDocument()
      expect(screen.getByText('Kyverno')).toBeInTheDocument()
      expect(screen.getByText('4')).toBeInTheDocument()
    })

    it('aggregates violations from totalViolations when reports are empty', () => {
      const statuses = {
        prod: makeKyvernoStatus({ cluster: 'prod', totalViolations: 9, reports: [] }),
      }
      setupKyverno({ installed: true, statuses })
      render(<PolicyViolationsCard config={{}} />)
      expect(screen.getByText('all-policies')).toBeInTheDocument()
      expect(screen.getByText('9')).toBeInTheDocument()
    })

    it('opens violation detail modal when a row is clicked', async () => {
      const statuses = {
        prod: makeKyvernoStatus({
          cluster: 'prod',
          reports: [{ name: 'r1', namespace: 'default', cluster: 'prod', pass: 0, fail: 2, warn: 0, error: 0, skip: 0 }],
        }),
      }
      setupKyverno({ installed: true, statuses })
      render(<PolicyViolationsCard config={{}} />)
      await userEvent.click(screen.getByRole('button', { name: 'view-default' }))
      expect(screen.getByTestId('violation-detail-modal')).toHaveTextContent('default:2')
    })
  })

  describe('cluster filter', () => {
    it('excludes violations from clusters not in selectedClusters filter', () => {
      const statuses = {
        prod: makeKyvernoStatus({
          cluster: 'prod',
          reports: [{ name: 'r1', namespace: 'prod-ns', cluster: 'prod', pass: 0, fail: 3, warn: 0, error: 0, skip: 0 }],
        }),
        staging: makeKyvernoStatus({
          cluster: 'staging',
          reports: [{ name: 'r2', namespace: 'staging-ns', cluster: 'staging', pass: 0, fail: 5, warn: 0, error: 0, skip: 0 }],
        }),
      }
      setupKyverno({ installed: true, statuses }, ['prod'])
      render(<PolicyViolationsCard config={{}} />)
      expect(screen.getByText('prod-ns')).toBeInTheDocument()
      expect(screen.queryByText('staging-ns')).not.toBeInTheDocument()
    })

    it('shows violations from all installed clusters when filter is empty', () => {
      const statuses = {
        prod: makeKyvernoStatus({
          cluster: 'prod',
          reports: [{ name: 'r1', namespace: 'prod-ns', cluster: 'prod', pass: 0, fail: 1, warn: 0, error: 0, skip: 0 }],
        }),
        staging: makeKyvernoStatus({
          cluster: 'staging',
          reports: [{ name: 'r2', namespace: 'staging-ns', cluster: 'staging', pass: 0, fail: 2, warn: 0, error: 0, skip: 0 }],
        }),
      }
      setupKyverno({ installed: true, statuses })
      render(<PolicyViolationsCard config={{}} />)
      expect(screen.getByText('prod-ns')).toBeInTheDocument()
      expect(screen.getByText('staging-ns')).toBeInTheDocument()
    })
  })

  describe('empty and loading states', () => {
    it('shows scanning state while loading without demo data', () => {
      setupKyverno({ isLoading: true, totalClusters: 2, clustersChecked: 1 })
      render(<PolicyViolationsCard config={{}} />)
      expect(screen.getByText('cards:policyViolations.scanning')).toBeInTheDocument()
      expect(screen.getByText('checking-1-2')).toBeInTheDocument()
    })

    it('shows clean state when no violations are found', () => {
      setupKyverno({ installed: true, statuses: { prod: makeKyvernoStatus({ totalViolations: 0 }) } })
      render(<PolicyViolationsCard config={{}} />)
      expect(screen.getByText('cards:policyViolations.noViolationsDetected')).toBeInTheDocument()
      expect(screen.getByText('cards:policyViolations.allResourcesComply')).toBeInTheDocument()
    })

    it('shows error banner with retry when fetch fails', () => {
      setupKyverno({ hasErrors: true })
      render(<PolicyViolationsCard config={{}} />)
      expect(screen.getByText('cards:policyViolations.failedToFetch')).toBeInTheDocument()
      expect(screen.getByText(/cards:policyViolations.retry/)).toBeInTheDocument()
    })
  })

  describe('useCardLoadingState integration', () => {
    it('passes isDemoData=true when hook returns demo data', () => {
      setupKyverno({ isDemoData: true })
      render(<PolicyViolationsCard config={{}} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true, hasAnyData: true }),
      )
    })

    it('passes isRefreshing to useCardLoadingState', () => {
      const statuses = {
        prod: makeKyvernoStatus({
          reports: [{ name: 'r1', namespace: 'ns', cluster: 'prod', pass: 0, fail: 1, warn: 0, error: 0, skip: 0 }],
        }),
      }
      setupKyverno({ installed: true, statuses, isRefreshing: true })
      render(<PolicyViolationsCard config={{}} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isRefreshing: true }),
      )
    })
  })
})
