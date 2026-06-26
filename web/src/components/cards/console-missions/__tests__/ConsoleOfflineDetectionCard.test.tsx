import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConsoleOfflineDetectionCard } from '../ConsoleOfflineDetectionCard'
import type { ClusterInfo, GPUNode, PodIssue } from '../../../../hooks/mcp/types'
import type { NodeData } from '../offlineDataTransforms'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string; count?: number }) => {
      if (opts?.defaultValue) return String(opts.defaultValue)
      if (key.includes('allHealthy')) return 'All Healthy'
      if (key.includes('gpuIssues')) return 'GPU Issues'
      if (key.includes('predicted')) return 'Predicted'
      if (key.includes('issuesTooltip') && opts?.count !== undefined) {
        return `${opts.count} cluster issues`
      }
      if (key.includes('unhealthy')) return 'Unhealthy'
      if (key.includes('offline')) return 'Offline'
      return key
    },
  }),
}))

const mockStartMission = vi.fn()
const mockUseMissions = vi.fn()
vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => mockUseMissions(),
}))

const mockUseCachedGPUNodes = vi.fn()
const mockUseCachedPodIssues = vi.fn()
vi.mock('../../../../hooks/useCachedData', () => ({
  useCachedGPUNodes: () => mockUseCachedGPUNodes(),
  useCachedPodIssues: () => mockUseCachedPodIssues(),
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
    selectedDistributions: [],
    isAllDistributionsSelected: true,
  }),
}))

const mockDrillToCluster = vi.fn()
const mockDrillToNode = vi.fn()
vi.mock('../../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToCluster: mockDrillToCluster,
    drillToNode: mockDrillToNode,
  }),
}))

const mockUseCardLoadingState = vi.fn()
const mockUseCardDemoState = vi.fn()
vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
  useCardDemoState: () => mockUseCardDemoState(),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
}))

vi.mock('../../clusters/useClusterFiltering', () => ({
  useClusterFiltering: ({ clusters }: { clusters: ClusterInfo[] }) => ({
    globalFilteredClusters: clusters,
  }),
}))

vi.mock('../../../../hooks/usePredictionSettings', () => ({
  usePredictionSettings: () => ({
    settings: {
      thresholds: {
        highRestartCount: 3,
        cpuPressure: 80,
        memoryPressure: 85,
      },
      interval: 30,
      aiEnabled: false,
    },
  }),
}))

const mockTriggerAIAnalysis = vi.fn()
vi.mock('../../../../hooks/useAIPredictions', () => ({
  useAIPredictions: () => ({
    predictions: [],
    isAnalyzing: false,
    analyze: mockTriggerAIAnalysis,
    isEnabled: false,
  }),
}))

vi.mock('../../../../hooks/usePredictionFeedback', () => ({
  usePredictionFeedback: () => ({
    submitFeedback: vi.fn(),
    getFeedback: () => null,
  }),
}))

vi.mock('../../../../hooks/useMetricsHistory', () => ({
  useMetricsHistory: () => ({
    getClusterTrend: () => undefined,
    getPodRestartTrend: () => undefined,
  }),
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

vi.mock('../DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('../../../../lib/cards/CardComponents', () => ({
  CardControlsRow: () => <div data-testid="card-controls-row" />,
  CardSearchInput: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
  }) => (
    <input
      data-testid="search-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
  CardPaginationFooter: () => <div data-testid="pagination-footer" />,
  CardAIActions: () => null,
}))

const mockGetNodesCache = vi.fn(() => [] as NodeData[])
vi.mock('../nodeCache', () => ({
  getNodesCache: () => mockGetNodesCache(),
  subscribeToNodes: () => () => {},
  fetchAllNodes: vi.fn(() =>
    Promise.resolve({ nodes: [], error: null, consecutiveFailures: 0 }),
  ),
  OFFLINE_DETECTION_FAILURE_THRESHOLD: 3,
  GPU_CLUSTER_EXHAUSTION_THRESHOLD: 0.8,
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

function makePodIssue(overrides: Partial<PodIssue> = {}): PodIssue {
  return {
    name: 'unstable-pod',
    namespace: 'default',
    cluster: 'prod',
    status: 'Running',
    reason: 'CrashLoopBackOff',
    issues: ['High restart count'],
    restarts: 6,
    ...overrides,
  }
}

function makeGpuNode(overrides: Partial<GPUNode> = {}): GPUNode {
  return {
    name: 'gpu-worker',
    cluster: 'prod',
    gpuCount: 0,
    gpuAllocated: 0,
    gpuType: 'nvidia-tesla',
    ...overrides,
  } as GPUNode
}

function setupDefaults({
  clusters = [makeCluster()] as ClusterInfo[],
  podIssues = [] as PodIssue[],
  gpuNodes = [] as GPUNode[],
  nodes = [] as NodeData[],
  podsLoading = false,
  gpuLoading = false,
  podsDemoFallback = false,
  gpuDemoFallback = false,
  podsFailed = false,
  gpuFailed = false,
  podsFailures = 0,
  gpuFailures = 0,
  shouldUseDemoData = true,
  isDemoMode = false,
  missions = [] as { title: string; status: string }[],
} = {}) {
  mockUseMissions.mockReturnValue({
    startMission: mockStartMission,
    missions,
  })
  mockUseClusters.mockReturnValue({
    deduplicatedClusters: clusters,
  })
  mockUseCachedPodIssues.mockReturnValue({
    issues: podIssues,
    isLoading: podsLoading,
    isRefreshing: false,
    isDemoFallback: podsDemoFallback,
    isFailed: podsFailed,
    consecutiveFailures: podsFailures,
  })
  mockUseCachedGPUNodes.mockReturnValue({
    nodes: gpuNodes,
    isLoading: gpuLoading,
    isRefreshing: false,
    isDemoFallback: gpuDemoFallback,
    isFailed: gpuFailed,
    consecutiveFailures: gpuFailures,
  })
  mockUseCardDemoState.mockReturnValue({ shouldUseDemoData })
  mockIsDemoMode.mockReturnValue(isDemoMode)
  mockGetNodesCache.mockReturnValue(nodes)
  mockUseCardLoadingState.mockReturnValue({})
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConsoleOfflineDetectionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaults()
  })

  describe('online/offline status summary', () => {
    it('shows zero issues with healthy styling when all clusters are reachable', () => {
      setupDefaults({
        clusters: [makeCluster({ name: 'healthy-prod' })],
        nodes: [{ name: 'node-a', cluster: 'healthy-prod', status: 'Ready', unschedulable: false }],
      })
      render(<ConsoleOfflineDetectionCard />)

      expect(screen.getByTitle('All Healthy')).toBeInTheDocument()
      expect(screen.getByText('All Healthy')).toBeInTheDocument()
      expect(screen.queryByText('Offline')).not.toBeInTheDocument()
      expect(screen.queryByText('Unhealthy')).not.toBeInTheDocument()
    })

    it('shows issue count with offline tooltip when unreachable clusters exist', () => {
      setupDefaults({
        clusters: [
          makeCluster({ name: 'reachable' }),
          makeCluster({
            name: 'offline-cluster',
            reachable: false,
            healthy: false,
            errorMessage: 'Connection timed out',
          }),
        ],
      })
      render(<ConsoleOfflineDetectionCard />)

      expect(screen.getByTitle('1 cluster issues')).toBeInTheDocument()
      expect(screen.getByText('Offline')).toBeInTheDocument()
      expect(screen.getByText('Connection timed out')).toBeInTheDocument()
    })

    it('counts not-ready nodes as current cluster issues', () => {
      setupDefaults({
        clusters: [makeCluster({ name: 'prod' })],
        nodes: [
          { name: 'worker-down', cluster: 'prod', status: 'NotReady', unschedulable: false },
        ],
      })
      render(<ConsoleOfflineDetectionCard />)

      expect(screen.getByTitle('1 cluster issues')).toBeInTheDocument()
      expect(screen.getByText('worker-down')).toBeInTheDocument()
    })

    it('drills to cluster when issues tile is clicked and issues exist', async () => {
      setupDefaults({
        clusters: [
          makeCluster({ name: 'broken', reachable: false, healthy: false }),
        ],
      })
      render(<ConsoleOfflineDetectionCard />)

      await userEvent.click(screen.getByTitle('1 cluster issues'))
      expect(mockDrillToCluster).toHaveBeenCalledWith('broken')
    })
  })

  describe('GPU and prediction summary tiles', () => {
    it('shows GPU issue count when GPU nodes report zero GPUs', () => {
      setupDefaults({
        gpuNodes: [makeGpuNode({ name: 'gpu-0', cluster: 'prod' })],
      })
      render(<ConsoleOfflineDetectionCard />)

      expect(screen.getByTitle('1 GPU issue - Click to view')).toHaveTextContent('1')
      expect(screen.getByText('gpu-0')).toBeInTheDocument()
      expect(screen.getByText('0 GPUs available')).toBeInTheDocument()
    })

    it('shows predicted risk count from high-restart pods', () => {
      setupDefaults({
        podIssues: [makePodIssue({ restarts: 10, name: 'crash-pod' })],
      })
      render(<ConsoleOfflineDetectionCard />)

      expect(screen.getByTitle(/Current: 1 heuristic/)).toHaveTextContent('1')
      expect(screen.getByText('crash-pod')).toBeInTheDocument()
      expect(screen.getByText('10 restarts')).toBeInTheDocument()
    })
  })

  describe('healthy banner and analysis action', () => {
    it('renders All Healthy action when no issues or predictions match filters', () => {
      setupDefaults({
        clusters: [makeCluster()],
        nodes: [{ name: 'n1', cluster: 'prod', status: 'Ready', unschedulable: false }],
      })
      render(<ConsoleOfflineDetectionCard />)

      expect(screen.getByRole('button', { name: /All Healthy/i })).toBeDisabled()
    })

    it('starts analysis mission when issues exist and button is clicked', async () => {
      setupDefaults({
        clusters: [
          makeCluster({ name: 'offline', reachable: false, healthy: false }),
        ],
      })
      render(<ConsoleOfflineDetectionCard />)

      await userEvent.click(screen.getByRole('button', { name: /Analyze 1 Issue/i }))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'troubleshoot',
          title: 'Health Issue Analysis',
        }),
      )
    })
  })

  describe('search filter', () => {
    it('filters listed items when search query is entered', async () => {
      setupDefaults({
        clusters: [
          makeCluster({ name: 'alpha-offline', reachable: false }),
          makeCluster({ name: 'beta-offline', reachable: false }),
        ],
      })
      render(<ConsoleOfflineDetectionCard />)

      expect(screen.getAllByText('alpha-offline').length).toBeGreaterThan(0)
      expect(screen.getAllByText('beta-offline').length).toBeGreaterThan(0)

      await userEvent.type(screen.getByTestId('search-input'), 'alpha')
      expect(screen.getAllByText('alpha-offline').length).toBeGreaterThan(0)
      expect(screen.queryByText('beta-offline')).not.toBeInTheDocument()
    })
  })

  describe('useCardLoadingState integration', () => {
    it('passes isDemoData when demo mode or demo fallbacks are active', () => {
      setupDefaults({
        isDemoMode: true,
        podsDemoFallback: true,
        podIssues: [makePodIssue()],
      })
      render(<ConsoleOfflineDetectionCard />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true }),
      )
    })

    it('passes isDemoData when GPU hook uses demo fallback', () => {
      setupDefaults({
        gpuDemoFallback: true,
        gpuNodes: [makeGpuNode()],
      })
      render(<ConsoleOfflineDetectionCard />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true }),
      )
    })

    it('reports loading when pod and GPU sources are loading with no data', () => {
      setupDefaults({
        podsLoading: true,
        gpuLoading: true,
        shouldUseDemoData: true,
        clusters: [],
        podIssues: [],
        gpuNodes: [],
      })
      render(<ConsoleOfflineDetectionCard />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isLoading: true,
          hasAnyData: false,
        }),
      )
    })

    it('suppresses card failure when only one data source has failed', () => {
      setupDefaults({
        podsFailed: true,
        podsFailures: 5,
        gpuFailed: false,
        shouldUseDemoData: true,
      })
      render(<ConsoleOfflineDetectionCard />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isFailed: false,
        }),
      )
    })
  })
})
