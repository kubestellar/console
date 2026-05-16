import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KyvernoPolicies } from '../KyvernoPolicies'
import type { KyvernoPolicy } from '../../../hooks/useKyverno'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const mockUseKyverno = vi.fn()
vi.mock('../../../hooks/useKyverno', () => ({
  useKyverno: () => mockUseKyverno(),
}))

const mockStartMission = vi.fn()
vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: mockStartMission }),
}))

const mockSelectedClusters = vi.fn(() => [] as string[])
vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: mockSelectedClusters() }),
}))

const mockDrillToPolicy = vi.fn()
vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToPolicy: mockDrillToPolicy }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children, color }: { children: React.ReactNode; color: string }) => (
    <span data-testid="status-badge" data-color={color}>{children}</span>
  ),
}))

vi.mock('../../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => <div data-testid="refresh-indicator" />,
}))

vi.mock('../kyverno/KyvernoDetailModal', () => ({
  KyvernoDetailModal: ({
    isOpen,
    onClose,
    clusterName,
  }: {
    isOpen: boolean
    onClose: () => void
    clusterName: string
  }) =>
    isOpen ? (
      <div data-testid="kyverno-detail-modal">
        <span>{clusterName}</span>
        <button onClick={onClose}>close</button>
      </div>
    ) : null,
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({
    value,
    onChange,
  }: {
    value: string
    onChange: (v: string) => void
  }) => (
    <input
      data-testid="search-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

vi.mock('../../ui/ProgressRing', () => ({
  ProgressRing: ({ progress }: { progress: number }) => (
    <div data-testid="progress-ring" data-progress={progress} />
  ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePolicy(overrides: Partial<KyvernoPolicy> = {}): KyvernoPolicy {
  return {
    name: 'require-labels',
    namespace: 'default',
    cluster: 'prod',
    kind: 'ClusterPolicy',
    status: 'audit',
    category: 'Best Practices',
    description: 'Require labels on pods',
    violations: 0,
    background: true,
    ...overrides,
  }
}

function makeKyvernoStatus(overrides: Record<string, unknown> = {}) {
  return {
    cluster: 'prod',
    installed: true,
    totalPolicies: 1,
    enforcingCount: 0,
    totalViolations: 0,
    policies: [makePolicy()],
    reports: [] as { namespace: string; fail: number }[],
    hasErrors: false,
    ...overrides,
  }
}

function setupDefaults({
  installed = false,
  isLoading = false,
  isRefreshing = false,
  isDemoData = false,
  hasErrors = false,
  statuses = {} as Record<string, ReturnType<typeof makeKyvernoStatus>>,
  clustersChecked = 0,
  totalClusters = 1,
  consecutiveFailures = 0,
} = {}) {
  mockUseKyverno.mockReturnValue({
    statuses,
    isLoading,
    isRefreshing,
    lastRefresh: null,
    installed,
    hasErrors,
    isDemoData,
    refetch: vi.fn(),
    clustersChecked,
    totalClusters,
    consecutiveFailures,
  })
  mockUseCardLoadingState.mockReturnValue({})
  mockSelectedClusters.mockReturnValue([])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KyvernoPolicies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaults()
  })

  // -------------------------------------------------------------------------
  describe('scanning progress', () => {
    it('shows scanning indicator when loading and Kyverno not yet detected', () => {
      setupDefaults({ isLoading: true, totalClusters: 2, clustersChecked: 1 })
      render(<KyvernoPolicies />)
      expect(screen.getByText('kyvernoPolicies.scanningClusters')).toBeInTheDocument()
    })

    it('shows ProgressRing when totalClusters > 0 while scanning', () => {
      setupDefaults({ isLoading: true, totalClusters: 3, clustersChecked: 1 })
      render(<KyvernoPolicies />)
      expect(screen.getByTestId('progress-ring')).toBeInTheDocument()
    })

    it('does not show scanning indicator when Kyverno is installed', () => {
      setupDefaults({
        isLoading: true,
        installed: true,
        statuses: { prod: makeKyvernoStatus() },
        totalClusters: 1,
      })
      render(<KyvernoPolicies />)
      expect(screen.queryByText('kyvernoPolicies.scanningClusters')).not.toBeInTheDocument()
    })

    it('does not show scanning indicator when isDemoData=true', () => {
      setupDefaults({ isLoading: true, isDemoData: true, totalClusters: 1 })
      render(<KyvernoPolicies />)
      expect(screen.queryByText('kyvernoPolicies.scanningClusters')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('error state', () => {
    it('shows error banner when hasErrors=true and not demo data', () => {
      setupDefaults({ hasErrors: true })
      render(<KyvernoPolicies />)
      expect(screen.getByText('Failed to fetch scanner data')).toBeInTheDocument()
    })

    it('error banner includes a Retry button', () => {
      setupDefaults({ hasErrors: true })
      render(<KyvernoPolicies />)
      expect(screen.getByText('Retry →')).toBeInTheDocument()
    })

    it('does not show error banner when isDemoData=true', () => {
      setupDefaults({ hasErrors: true, isDemoData: true })
      render(<KyvernoPolicies />)
      expect(screen.queryByText('Failed to fetch scanner data')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('install prompt', () => {
    it('shows install prompt when Kyverno is not installed and scan is done', () => {
      setupDefaults({ installed: false, isLoading: false, isRefreshing: false, hasErrors: false })
      render(<KyvernoPolicies />)
      expect(screen.getByText('Kyverno Integration')).toBeInTheDocument()
    })

    it('calls startMission with install config when Install button is clicked', async () => {
      setupDefaults({ installed: false, isLoading: false })
      render(<KyvernoPolicies />)
      await userEvent.click(screen.getByText('Install with an AI Mission →'))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Install Kyverno', type: 'deploy' }),
      )
    })

    it('hides install prompt when Kyverno is installed', () => {
      setupDefaults({ installed: true, statuses: { prod: makeKyvernoStatus() } })
      render(<KyvernoPolicies />)
      expect(screen.queryByText('Kyverno Integration')).not.toBeInTheDocument()
    })

    it('hides install prompt while scan is still loading', () => {
      setupDefaults({ installed: false, isLoading: true })
      render(<KyvernoPolicies />)
      expect(screen.queryByText('Kyverno Integration')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('stats tiles', () => {
    it('renders totalPolicies count', () => {
      const statuses = {
        prod: makeKyvernoStatus({ totalPolicies: 5, enforcingCount: 2, totalViolations: 3 }),
      }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('renders enforcingCount in the Enforcing tile', () => {
      const statuses = {
        prod: makeKyvernoStatus({ totalPolicies: 5, enforcingCount: 2, totalViolations: 3 }),
      }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('renders totalViolations in the Violations tile', () => {
      const statuses = {
        prod: makeKyvernoStatus({ totalPolicies: 5, enforcingCount: 2, totalViolations: 3 }),
      }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('sums stats across multiple installed clusters', () => {
      const statuses = {
        'cluster-a': makeKyvernoStatus({ cluster: 'cluster-a', totalPolicies: 3, enforcingCount: 1, totalViolations: 1 }),
        'cluster-b': makeKyvernoStatus({ cluster: 'cluster-b', totalPolicies: 2, enforcingCount: 1, totalViolations: 2 }),
      }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      // totalPolicies = 3+2 = 5
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('policy list', () => {
    it('renders policy name in the list', () => {
      const policy = makePolicy({ name: 'disallow-privileged', cluster: 'prod' })
      const statuses = { prod: makeKyvernoStatus({ policies: [policy] }) }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      expect(screen.getByText('disallow-privileged')).toBeInTheDocument()
    })

    it('renders policy status badge', () => {
      const policy = makePolicy({ status: 'enforcing' })
      const statuses = { prod: makeKyvernoStatus({ policies: [policy] }) }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      expect(screen.getByText('enforcing')).toBeInTheDocument()
    })

    it('shows violation count when policy has violations', () => {
      const policy = makePolicy({ violations: 7 })
      const statuses = { prod: makeKyvernoStatus({ policies: [policy] }) }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      expect(screen.getByText('7')).toBeInTheDocument()
    })

    it('shows "Sample Policies" header label when isDemoData=true', () => {
      setupDefaults({ isDemoData: true })
      render(<KyvernoPolicies />)
      expect(screen.getByText('Sample Policies')).toBeInTheDocument()
    })

    it('shows filtered policy count label when not demo data', () => {
      const statuses = { prod: makeKyvernoStatus({ policies: [makePolicy()] }) }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      expect(screen.getByText(/1 Policies/)).toBeInTheDocument()
    })

    it('calls drillToPolicy when a policy row is clicked', async () => {
      const policy = makePolicy({ name: 'click-target', cluster: 'prod', namespace: 'default' })
      const statuses = { prod: makeKyvernoStatus({ policies: [policy] }) }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      await userEvent.click(
        screen.getByRole('button', { name: /View Kyverno policy: click-target on prod/ }),
      )
      expect(mockDrillToPolicy).toHaveBeenCalledWith(
        'prod',
        'default',
        'click-target',
        expect.objectContaining({ policyType: 'kyverno' }),
      )
    })

    it('activates policy row via keyboard Enter key', async () => {
      const policy = makePolicy({ name: 'enter-target', cluster: 'prod' })
      const statuses = { prod: makeKyvernoStatus({ policies: [policy] }) }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      const row = screen.getByRole('button', { name: /View Kyverno policy: enter-target on prod/ })
      row.focus()
      await userEvent.keyboard('{Enter}')
      expect(mockDrillToPolicy).toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  describe('search filter', () => {
    it('filters policy list by search query', async () => {
      const policies = [
        makePolicy({ name: 'require-labels', cluster: 'prod' }),
        makePolicy({ name: 'disallow-privileged', cluster: 'prod' }),
      ]
      const statuses = { prod: makeKyvernoStatus({ policies }) }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      await userEvent.type(screen.getByTestId('search-input'), 'disallow')
      expect(screen.queryByText('require-labels')).not.toBeInTheDocument()
      expect(screen.getByText('disallow-privileged')).toBeInTheDocument()
    })

    it('shows all policies when search is cleared', async () => {
      const policies = [
        makePolicy({ name: 'policy-a', cluster: 'prod' }),
        makePolicy({ name: 'policy-b', cluster: 'prod' }),
      ]
      const statuses = { prod: makeKyvernoStatus({ policies }) }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      const input = screen.getByTestId('search-input')
      await userEvent.type(input, 'policy-a')
      expect(screen.queryByText('policy-b')).not.toBeInTheDocument()
      await userEvent.clear(input)
      expect(screen.getByText('policy-b')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('cluster badges', () => {
    it('renders one badge per installed cluster', () => {
      const statuses = {
        'cluster-a': makeKyvernoStatus({ cluster: 'cluster-a' }),
        'cluster-b': makeKyvernoStatus({ cluster: 'cluster-b' }),
      }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      expect(screen.getAllByTestId('status-badge')).toHaveLength(2)
    })

    it('opens detail modal when a cluster badge is clicked', async () => {
      const statuses = { prod: makeKyvernoStatus({ cluster: 'prod' }) }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      await userEvent.click(screen.getByTestId('status-badge'))
      const modal = screen.getByTestId('kyverno-detail-modal')
      expect(modal).toBeInTheDocument()
      // modal renders clusterName — scope to avoid matching the badge text too
      expect(modal.textContent).toContain('prod')
    })

    it('closes detail modal when onClose is invoked', async () => {
      const statuses = { prod: makeKyvernoStatus({ cluster: 'prod' }) }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      await userEvent.click(screen.getByTestId('status-badge'))
      await userEvent.click(screen.getByText('close'))
      expect(screen.queryByTestId('kyverno-detail-modal')).not.toBeInTheDocument()
    })

    it('badge uses yellow color when cluster has violations', () => {
      const statuses = {
        prod: makeKyvernoStatus({ cluster: 'prod', totalViolations: 3 }),
      }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      const badge = screen.getByTestId('status-badge')
      expect(badge).toHaveAttribute('data-color', 'yellow')
    })

    it('badge uses green color when cluster has zero violations', () => {
      const statuses = {
        prod: makeKyvernoStatus({ cluster: 'prod', totalViolations: 0 }),
      }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      const badge = screen.getByTestId('status-badge')
      expect(badge).toHaveAttribute('data-color', 'green')
    })
  })

  // -------------------------------------------------------------------------
  describe('degraded state', () => {
    it('shows "No Policies Configured" when installed but all clusters have zero policies', () => {
      const statuses = {
        prod: makeKyvernoStatus({ cluster: 'prod', installed: true, totalPolicies: 0, policies: [] }),
      }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      expect(screen.getByText('No Policies Configured')).toBeInTheDocument()
    })

    it('calls startMission with sample-policy config when "Deploy sample" is clicked', async () => {
      const statuses = {
        prod: makeKyvernoStatus({ cluster: 'prod', installed: true, totalPolicies: 0, policies: [] }),
      }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      await userEvent.click(screen.getByText('Deploy sample audit policies with AI →'))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Deploy Sample Kyverno Policies' }),
      )
    })

    it('does not show degraded banner when policies exist', () => {
      const statuses = { prod: makeKyvernoStatus({ totalPolicies: 2, policies: [makePolicy(), makePolicy()] }) }
      setupDefaults({ installed: true, statuses })
      render(<KyvernoPolicies />)
      expect(screen.queryByText('No Policies Configured')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('useCardLoadingState integration', () => {
    it('passes isDemoData=true when hook returns isDemoData', () => {
      setupDefaults({ isDemoData: true })
      render(<KyvernoPolicies />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true }),
      )
    })

    it('passes isRefreshing to useCardLoadingState', () => {
      setupDefaults({ installed: true, statuses: { prod: makeKyvernoStatus() }, isRefreshing: true })
      render(<KyvernoPolicies />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isRefreshing: true }),
      )
    })

    it('passes hasAnyData=true when Kyverno is installed', () => {
      setupDefaults({ installed: true, statuses: { prod: makeKyvernoStatus() } })
      render(<KyvernoPolicies />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: true }),
      )
    })

    it('passes hasAnyData=true when isDemoData is true even without installation', () => {
      setupDefaults({ installed: false, isDemoData: true })
      render(<KyvernoPolicies />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: true }),
      )
    })
  })
})
