import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConsoleKubeconfigAuditCard } from '../ConsoleKubeconfigAuditCard'
import type { ClusterInfo } from '../../../../hooks/mcp/types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const mockStartMission = vi.fn()
const mockUseMissions = vi.fn()
vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => mockUseMissions(),
}))

const mockUseClusters = vi.fn()
vi.mock('../../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [],
    isAllClustersSelected: true,
    customFilter: '',
  }),
}))

const mockDrillToCluster = vi.fn()
vi.mock('../../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToCluster: mockDrillToCluster,
  }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
}))

vi.mock('../shared', () => ({
  useApiKeyCheck: () => ({
    showKeyPrompt: false,
    checkKeyAndRun: (fn: () => void) => fn(),
    goToSettings: vi.fn(),
    dismissPrompt: vi.fn(),
  }),
  ApiKeyPromptModal: () => null,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'prod',
    healthy: true,
    reachable: true,
    nodeCount: 3,
    podCount: 10,
    ...overrides,
  } as ClusterInfo
}

function setupDefaults({
  clusters = [makeCluster()] as ClusterInfo[],
  isLoading = false,
  isRefreshing = false,
  isFailed = false,
  consecutiveFailures = 0,
  isDemoMode = false,
  missions = [] as { title: string; status: string }[],
} = {}) {
  mockUseMissions.mockReturnValue({
    startMission: mockStartMission,
    missions,
  })
  mockUseClusters.mockReturnValue({
    deduplicatedClusters: clusters,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
  })
  mockIsDemoMode.mockReturnValue(isDemoMode)
  mockUseCardLoadingState.mockReturnValue({})
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConsoleKubeconfigAuditCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaults()
  })

  describe('audit result display', () => {
    it('renders total context count and offline count in summary tiles', () => {
      setupDefaults({
        clusters: [
          makeCluster({ name: 'healthy-a' }),
          makeCluster({ name: 'offline-b', reachable: false, errorMessage: 'Connection refused' }),
        ],
      })
      render(<ConsoleKubeconfigAuditCard />)

      expect(screen.getByTitle('2 total cluster contexts in kubeconfig')).toHaveTextContent('2')
      expect(screen.getByText('Total Contexts')).toBeInTheDocument()
      expect(screen.getByTitle('1 offline cluster - Click to view first')).toHaveTextContent('1')
      expect(screen.getByText('Offline')).toBeInTheDocument()
    })

    it('lists unreachable clusters in the preview with error messages', () => {
      setupDefaults({
        clusters: [
          makeCluster({
            name: 'stale-context',
            reachable: false,
            errorMessage: 'dial tcp: connection refused',
          }),
        ],
      })
      render(<ConsoleKubeconfigAuditCard />)

      expect(screen.getByText('stale-context')).toBeInTheDocument()
      expect(screen.getByText('dial tcp: connection refused')).toBeInTheDocument()
    })

    it('shows reachable banner when all clusters are online', () => {
      setupDefaults({
        clusters: [makeCluster({ name: 'online-only' })],
      })
      render(<ConsoleKubeconfigAuditCard />)

      expect(screen.getByText('All clusters reachable')).toBeInTheDocument()
      expect(screen.getByText('0')).toBeInTheDocument()
    })

    it('drills to cluster when an offline preview row is clicked', async () => {
      setupDefaults({
        clusters: [
          makeCluster({ name: 'offline-cluster', reachable: false, errorType: 'network' }),
        ],
      })
      render(<ConsoleKubeconfigAuditCard />)

      await userEvent.click(screen.getByText('offline-cluster'))
      expect(mockDrillToCluster).toHaveBeenCalledWith('offline-cluster')
    })

    it('starts kubeconfig audit mission when Run Audit is clicked', async () => {
      setupDefaults({
        clusters: [makeCluster({ name: 'ctx-a' }), makeCluster({ name: 'ctx-b' })],
      })
      render(<ConsoleKubeconfigAuditCard />)

      await userEvent.click(screen.getByText('Run Audit'))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Kubeconfig Audit',
          type: 'analyze',
        }),
      )
    })
  })

  describe('error state integration', () => {
    it('passes isFailed to useCardLoadingState when cluster fetch fails', () => {
      setupDefaults({ isFailed: true, consecutiveFailures: 3, clusters: [] })
      render(<ConsoleKubeconfigAuditCard />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isFailed: true,
          consecutiveFailures: 3,
        }),
      )
    })

    it('reports loading when clusters are fetching with no cached data', () => {
      setupDefaults({ isLoading: true, clusters: [] })
      render(<ConsoleKubeconfigAuditCard />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isLoading: true,
          hasAnyData: false,
        }),
      )
    })
  })

  describe('useCardLoadingState integration', () => {
    it('passes isDemoData=true when demo mode is active', () => {
      setupDefaults({ isDemoMode: true, clusters: [makeCluster()] })
      render(<ConsoleKubeconfigAuditCard />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true }),
      )
    })

    it('passes isRefreshing when cluster data is refreshing', () => {
      setupDefaults({ isRefreshing: true, clusters: [makeCluster()] })
      render(<ConsoleKubeconfigAuditCard />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isRefreshing: true, hasAnyData: true }),
      )
    })
  })

  describe('running audit mission', () => {
    it('shows Auditing state and disables button when audit mission is running', () => {
      setupDefaults({
        clusters: [makeCluster()],
        missions: [{ title: 'Kubeconfig Audit', status: 'running' }],
      })
      render(<ConsoleKubeconfigAuditCard />)

      expect(screen.getByText('Auditing...')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Auditing/i })).toBeDisabled()
    })
  })
})
