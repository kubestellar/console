import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DeploymentRiskScore } from '../DeploymentRiskScore'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts ? `${k}:${JSON.stringify(opts)}` : k,
  }),
}))

const mockUseArgoCDApplications = vi.fn()
vi.mock('../../../hooks/useArgoCD', () => ({
  useArgoCDApplications: () => mockUseArgoCDApplications(),
}))

const mockUseKyverno = vi.fn()
vi.mock('../../../hooks/useKyverno', () => ({
  useKyverno: () => mockUseKyverno(),
}))

const mockUseCachedAllPods = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedAllPods: () => mockUseCachedAllPods(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSkeleton: ({ type, rows }: { type?: string; rows?: number }) => (
    <div data-testid="card-skeleton" data-type={type} data-rows={rows} />
  ),
  CardEmptyState: ({ title, message }: { title?: string; message?: string }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      {message && <span>{message}</span>}
    </div>
  ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeArgoApp(overrides: Record<string, unknown> = {}) {
  return {
    name: 'app-1',
    namespace: 'default',
    cluster: 'prod',
    syncStatus: 'Synced',
    healthStatus: 'Healthy',
    ...overrides,
  }
}

function makePod(overrides: Record<string, unknown> = {}) {
  return {
    name: 'pod-1',
    namespace: 'default',
    cluster: 'prod',
    restarts: 0,
    ...overrides,
  }
}

function makeKyvernoStatus(overrides: Record<string, unknown> = {}) {
  return {
    cluster: 'prod',
    installed: true,
    totalPolicies: 0,
    enforcingCount: 0,
    totalViolations: 0,
    policies: [],
    reports: [],
    hasErrors: false,
    ...overrides,
  }
}

function setupDefaults({
  applications = [] as ReturnType<typeof makeArgoApp>[],
  pods = [] as ReturnType<typeof makePod>[],
  kyvernoStatuses = {} as Record<string, unknown>,
  isLoading = false,
  isDemoData = false,
  showSkeleton = false,
  showEmptyState = false,
} = {}) {
  mockUseArgoCDApplications.mockReturnValue({
    applications,
    isLoading,
    isRefreshing: false,
    isDemoData,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
  })
  mockUseKyverno.mockReturnValue({
    statuses: kyvernoStatuses,
    isLoading,
    isRefreshing: false,
    isDemoData: false,
    consecutiveFailures: 0,
    lastRefresh: null,
  })
  mockUseCachedAllPods.mockReturnValue({
    pods,
    isLoading,
    isRefreshing: false,
    isDemoFallback: isDemoData,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
  })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton, showEmptyState })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeploymentRiskScore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaults()
  })

  // -------------------------------------------------------------------------
  describe('loading state', () => {
    it('renders skeleton when showSkeleton=true', () => {
      setupDefaults({ showSkeleton: true })
      render(<DeploymentRiskScore />)
      expect(screen.getByTestId('card-skeleton')).toBeInTheDocument()
    })

    it('does not render risk rows while skeleton is showing', () => {
      setupDefaults({
        showSkeleton: true,
        applications: [makeArgoApp({ namespace: 'prod-ns', syncStatus: 'OutOfSync' })],
      })
      render(<DeploymentRiskScore />)
      expect(screen.queryByText('prod-ns')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('empty state', () => {
    it('renders empty state component when showEmptyState=true', () => {
      setupDefaults({ showEmptyState: true })
      render(<DeploymentRiskScore />)
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
      expect(screen.getByText('deploymentRiskScore.emptyTitle')).toBeInTheDocument()
    })

    it('does not render risk rows in empty state', () => {
      setupDefaults({ showEmptyState: true })
      render(<DeploymentRiskScore />)
      expect(screen.queryByText('deploymentRiskScore.legend')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('risk rows', () => {
    it('renders namespace and cluster for an OutOfSync app', () => {
      setupDefaults({
        applications: [makeArgoApp({ namespace: 'prod-ns', cluster: 'eks-prod', syncStatus: 'OutOfSync' })],
      })
      render(<DeploymentRiskScore />)
      expect(screen.getByText('prod-ns')).toBeInTheDocument()
      expect(screen.getByText('eks-prod')).toBeInTheDocument()
    })

    it('renders the computed risk score as a number', () => {
      // OutOfSync: argoSub=50, no kyverno, no restarts
      // score = round(50 * 0.35 + 0 + 0) = round(17.5) = 18
      setupDefaults({
        applications: [makeArgoApp({ syncStatus: 'OutOfSync' })],
      })
      render(<DeploymentRiskScore />)
      expect(screen.getByText('18')).toBeInTheDocument()
    })

    it('renders breakdown text including argo/violations/restarts counts', () => {
      setupDefaults({
        applications: [makeArgoApp({ syncStatus: 'OutOfSync' })],
      })
      render(<DeploymentRiskScore />)
      // t() mock returns "key:opts" — check the key prefix
      expect(screen.getByText(/deploymentRiskScore\.breakdown/)).toBeInTheDocument()
    })

    it('renders the legend with low/medium/high labels', () => {
      setupDefaults({ applications: [makeArgoApp({ syncStatus: 'OutOfSync' })] })
      render(<DeploymentRiskScore />)
      expect(screen.getByText('deploymentRiskScore.low')).toBeInTheDocument()
      expect(screen.getByText('deploymentRiskScore.medium')).toBeInTheDocument()
      expect(screen.getByText('deploymentRiskScore.high')).toBeInTheDocument()
    })

    it('sorts rows by score descending — highest risk first', () => {
      // high-ns: OutOfSync + Degraded → argoSub = max(50+40, 100) = 90
      // low-ns: Synced + Healthy → argoSub = 0
      setupDefaults({
        applications: [
          makeArgoApp({ name: 'a', namespace: 'low-ns', cluster: 'c', syncStatus: 'Synced', healthStatus: 'Healthy' }),
          makeArgoApp({ name: 'b', namespace: 'high-ns', cluster: 'c', syncStatus: 'OutOfSync', healthStatus: 'Degraded' }),
        ],
      })
      render(<DeploymentRiskScore />)
      const namespaces = screen.getAllByText(/\w+-ns/)
      expect(namespaces[0].textContent).toBe('high-ns')
    })

    it('groups two apps in the same namespace/cluster into one row', () => {
      setupDefaults({
        applications: [
          makeArgoApp({ name: 'a1', namespace: 'shared-ns', cluster: 'c', syncStatus: 'Synced' }),
          makeArgoApp({ name: 'a2', namespace: 'shared-ns', cluster: 'c', syncStatus: 'Synced' }),
        ],
      })
      render(<DeploymentRiskScore />)
      // Only one row for 'shared-ns' since they share the same cluster/namespace
      expect(screen.getAllByText('shared-ns')).toHaveLength(1)
    })
  })

  // -------------------------------------------------------------------------
  describe('multi-source scoring', () => {
    it('combines argo OutOfSync and pod restarts into a higher score', () => {
      // argoSub=50, restartSub=min((20/20)*100,100)=100
      // score = round(50*0.35 + 0 + 100*0.40) = round(17.5+40) = 58
      setupDefaults({
        applications: [makeArgoApp({ namespace: 'mixed', cluster: 'c', syncStatus: 'OutOfSync' })],
        pods: [makePod({ namespace: 'mixed', cluster: 'c', restarts: 20 })],
      })
      render(<DeploymentRiskScore />)
      expect(screen.getByText('58')).toBeInTheDocument()
    })

    it('accounts for kyverno violations in the score', () => {
      // 5 violations → kyvernoSub = min(50, 100) = 50
      // score = round(0 + 50*0.25 + 0) = 13
      const kyvernoStatuses = {
        'c': makeKyvernoStatus({
          cluster: 'c',
          reports: [{ namespace: 'kv-ns', fail: 5 }],
        }),
      }
      setupDefaults({ kyvernoStatuses })
      render(<DeploymentRiskScore />)
      expect(screen.getByText('13')).toBeInTheDocument()
    })

    it('aggregates restarts from multiple pods in the same namespace', () => {
      // 5+5 = 10 restarts → restartSub = min((10/20)*100,100) = 50
      // score = round(0 + 0 + 50*0.40) = 20
      setupDefaults({
        pods: [
          makePod({ name: 'p1', namespace: 'agg-ns', cluster: 'c', restarts: 5 }),
          makePod({ name: 'p2', namespace: 'agg-ns', cluster: 'c', restarts: 5 }),
        ],
      })
      render(<DeploymentRiskScore />)
      expect(screen.getByText('20')).toBeInTheDocument()
    })

    it('ignores pods with zero restarts', () => {
      setupDefaults({ pods: [makePod({ restarts: 0 })] })
      render(<DeploymentRiskScore />)
      // Zero-restart pod produces no bucket → no row rendered
      expect(screen.queryByText('default')).not.toBeInTheDocument()
    })

    it('clamps argoSub at 100 for OutOfSync+Degraded combination', () => {
      // OutOfSync(50) + Degraded(40) = 90 → argoSub=90 (below cap)
      // score = round(90*0.35) = round(31.499...) = 31  (IEEE-754 float)
      setupDefaults({
        applications: [makeArgoApp({ syncStatus: 'OutOfSync', healthStatus: 'Degraded' })],
      })
      render(<DeploymentRiskScore />)
      expect(screen.getByText('31')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('row truncation', () => {
    it('shows "more" text when rows exceed MAX_ROWS (12)', () => {
      // 13 distinct namespaces → 12 visible + 1 hidden
      const applications = Array.from({ length: 13 }, (_, i) =>
        makeArgoApp({ name: `app-${i}`, namespace: `ns-${i}`, cluster: 'c', syncStatus: 'OutOfSync' }),
      )
      setupDefaults({ applications })
      render(<DeploymentRiskScore />)
      expect(screen.getByText(/deploymentRiskScore\.more/)).toBeInTheDocument()
    })

    it('does not show "more" text when rows are within MAX_ROWS', () => {
      setupDefaults({ applications: [makeArgoApp({ syncStatus: 'OutOfSync' })] })
      render(<DeploymentRiskScore />)
      expect(screen.queryByText(/deploymentRiskScore\.more/)).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('useCardLoadingState integration', () => {
    it('passes isDemoData=true when any source has demo data', () => {
      mockUseArgoCDApplications.mockReturnValue({
        applications: [],
        isLoading: false,
        isRefreshing: false,
        isDemoData: true,
        isFailed: false,
        consecutiveFailures: 0,
        lastRefresh: null,
      })
      render(<DeploymentRiskScore />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true }),
      )
    })

    it('passes hasAnyData=false when no sources produce rows', () => {
      setupDefaults()
      render(<DeploymentRiskScore />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: false }),
      )
    })

    it('passes hasAnyData=true when at least one row is present', () => {
      setupDefaults({ applications: [makeArgoApp({ syncStatus: 'OutOfSync' })] })
      render(<DeploymentRiskScore />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: true }),
      )
    })

    it('passes isFailed=true when argo source is failed', () => {
      mockUseArgoCDApplications.mockReturnValue({
        applications: [],
        isLoading: false,
        isRefreshing: false,
        isDemoData: false,
        isFailed: true,
        consecutiveFailures: 3,
        lastRefresh: null,
      })
      render(<DeploymentRiskScore />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isFailed: true }),
      )
    })

    it('passes isRefreshing=true when any source is refreshing', () => {
      mockUseArgoCDApplications.mockReturnValue({
        applications: [],
        isLoading: false,
        isRefreshing: true,
        isDemoData: false,
        isFailed: false,
        consecutiveFailures: 0,
        lastRefresh: null,
      })
      render(<DeploymentRiskScore />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isRefreshing: true }),
      )
    })
  })
})
