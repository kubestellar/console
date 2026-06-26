import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GitHubCIMonitor } from '../GitHubCIMonitor'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockUseCache = vi.fn()
vi.mock('../../../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: vi.fn() }),
}))

vi.mock('../../pipelines/PipelineFilterContext', () => ({
  usePipelineFilter: () => null,
}))

vi.mock('../WorkloadMonitorAlerts', () => ({
  WorkloadMonitorAlerts: () => <div data-testid="workload-monitor-alerts" />,
}))

vi.mock('../../../../lib/cards/CardComponents', () => ({
  CardSearchInput: () => <input data-testid="card-search" />,
  CardAIActions: () => null,
}))

vi.mock('../../../../lib/cards/cardHooks', () => ({
  useCardData: (data: unknown[]) => ({
    items: data,
    totalItems: data.length,
    currentPage: 1,
    totalPages: 1,
    goToPage: vi.fn(),
    needsPagination: false,
    itemsPerPage: 8,
    setItemsPerPage: vi.fn(),
    filters: { search: '', setSearch: vi.fn() },
    sorting: {
      sortBy: 'status',
      setSortBy: vi.fn(),
      sortDirection: 'asc' as const,
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: undefined,
  }),
  commonComparators: {
    string: () => () => 0,
    number: () => () => 0,
    statusOrder: () => () => 0,
    date: () => () => 0,
    boolean: () => () => 0,
  },
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = '2026-05-22T12:00:00Z'
const FIVE_MIN_AGO = '2026-05-22T11:55:00Z'

function makeWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    name: 'CI / Build & Test',
    repo: 'kubestellar/console',
    status: 'completed',
    conclusion: 'success',
    branch: 'main',
    event: 'push',
    runNumber: 100,
    createdAt: FIVE_MIN_AGO,
    updatedAt: FIVE_MIN_AGO,
    url: 'https://github.com/kubestellar/console/actions/runs/100',
    ...overrides,
  }
}

function setupCache({
  workflows = [] as ReturnType<typeof makeWorkflow>[],
  isLoading = false,
  isRefreshing = false,
  isDemo = false,
  isFailed = false,
  consecutiveFailures = 0,
} = {}) {
  mockUseCache.mockReturnValue({
    data: { workflows, isDemo },
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    refetch: vi.fn(),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitHubCIMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    mockUseCardLoadingState.mockReturnValue({})
    setupCache()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('loading state', () => {
    it('shows skeleton when loading with no workflows yet', () => {
      setupCache({ isLoading: true, workflows: [] })
      const { container } = render(<GitHubCIMonitor />)
      const skeletons = container.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBeGreaterThan(0)
      expect(screen.queryByText('GitHub CI')).not.toBeInTheDocument()
    })
  })

  describe('run list and status badges', () => {
    it('renders workflow names and repo branches', () => {
      setupCache({
        workflows: [
          makeWorkflow({ id: '1', name: 'CI / Build & Test', conclusion: 'success' }),
          makeWorkflow({
            id: '2',
            name: 'CI / Lint',
            conclusion: 'failure',
            branch: 'feat/ci-tests',
            status: 'completed',
          }),
        ],
      })
      render(<GitHubCIMonitor />)
      expect(screen.getByText('CI / Build & Test')).toBeInTheDocument()
      expect(screen.getByText('CI / Lint')).toBeInTheDocument()
      expect(screen.getByText(/console · main/)).toBeInTheDocument()
      expect(screen.getByText(/console · feat\/ci-tests/)).toBeInTheDocument()
    })

    it('shows success, failure, and in_progress status labels', () => {
      setupCache({
        workflows: [
          makeWorkflow({ id: '1', conclusion: 'success', status: 'completed' }),
          makeWorkflow({
            id: '2',
            name: 'CI / Lint',
            conclusion: 'failure',
            status: 'completed',
          }),
          makeWorkflow({
            id: '3',
            name: 'Release / Publish',
            conclusion: null,
            status: 'in_progress',
          }),
        ],
      })
      render(<GitHubCIMonitor />)
      expect(screen.getByText('success')).toBeInTheDocument()
      expect(screen.getByText('failure')).toBeInTheDocument()
      expect(screen.getByText('in_progress')).toBeInTheDocument()
    })

    it('displays formatTimeAgo for each run updatedAt', () => {
      setupCache({ workflows: [makeWorkflow({ updatedAt: FIVE_MIN_AGO })] })
      render(<GitHubCIMonitor />)
      expect(screen.getByText('5m ago')).toBeInTheDocument()
    })
  })

  describe('demo data path', () => {
    it('shows demo token banner when isDemo is true', () => {
      setupCache({
        isDemo: true,
        workflows: [makeWorkflow()],
      })
      render(<GitHubCIMonitor />)
      expect(screen.getByText(/No GitHub token configured/)).toBeInTheDocument()
      expect(screen.getByText('Add Token')).toBeInTheDocument()
    })

    it('reports isDemoData to useCardLoadingState after load completes', () => {
      setupCache({ isDemo: true, workflows: [makeWorkflow()] })
      render(<GitHubCIMonitor />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true, hasAnyData: true }),
      )
    })

    it('does not report demo during initial loading', () => {
      setupCache({ isLoading: true, isDemo: true, workflows: [] })
      render(<GitHubCIMonitor />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: false }),
      )
    })
  })

  describe('error state', () => {
    it('shows error message when fetch failed', () => {
      setupCache({
        isFailed: true,
        consecutiveFailures: 1,
        workflows: [makeWorkflow()],
      })
      render(<GitHubCIMonitor />)
      expect(screen.getByText('Failed to fetch workflows')).toBeInTheDocument()
    })
  })
})
