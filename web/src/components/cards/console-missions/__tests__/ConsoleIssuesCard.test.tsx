import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConsoleIssuesCard } from '../ConsoleIssuesCard'
import type { DeploymentIssue, PodIssue } from '../../../../hooks/mcp/types'

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

const mockUseCachedPodIssues = vi.fn()
const mockUseCachedDeploymentIssues = vi.fn()
vi.mock('../../../../hooks/useCachedData', () => ({
  useCachedPodIssues: () => mockUseCachedPodIssues(),
  useCachedDeploymentIssues: () => mockUseCachedDeploymentIssues(),
}))

const mockSelectedClusters = vi.fn(() => [] as string[])
vi.mock('../../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: mockSelectedClusters(),
    isAllClustersSelected: true,
    customFilter: '',
  }),
}))

const mockDrillToPod = vi.fn()
const mockDrillToDeployment = vi.fn()
vi.mock('../../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToPod: mockDrillToPod,
    drillToDeployment: mockDrillToDeployment,
  }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
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

function makePodIssue(overrides: Partial<PodIssue> = {}): PodIssue {
  return {
    name: 'crashloop-pod',
    namespace: 'default',
    cluster: 'prod',
    status: 'CrashLoopBackOff',
    reason: 'BackOff',
    issues: ['Container restarting'],
    restarts: 5,
    ...overrides,
  }
}

function makeDeploymentIssue(overrides: Partial<DeploymentIssue> = {}): DeploymentIssue {
  return {
    name: 'web-deploy',
    namespace: 'apps',
    cluster: 'staging',
    replicas: 3,
    readyReplicas: 1,
    reason: 'Unavailable',
    message: 'Minimum replicas not available',
    ...overrides,
  }
}

function setupDefaults({
  podIssues = [] as PodIssue[],
  deploymentIssues = [] as DeploymentIssue[],
  podIssuesLoading = false,
  deployIssuesLoading = false,
  podsRefreshing = false,
  deploysRefreshing = false,
  podsDemoFallback = false,
  deploysDemoFallback = false,
  podsFailed = false,
  deploysFailed = false,
  podsFailures = 0,
  deploysFailures = 0,
  missions = [] as { type: string; status: string }[],
} = {}) {
  mockUseMissions.mockReturnValue({
    startMission: mockStartMission,
    missions,
  })
  mockUseCachedPodIssues.mockReturnValue({
    issues: podIssues,
    isLoading: podIssuesLoading,
    isRefreshing: podsRefreshing,
    isDemoFallback: podsDemoFallback,
    isFailed: podsFailed,
    consecutiveFailures: podsFailures,
  })
  mockUseCachedDeploymentIssues.mockReturnValue({
    issues: deploymentIssues,
    isLoading: deployIssuesLoading,
    isRefreshing: deploysRefreshing,
    isDemoFallback: deploysDemoFallback,
    isFailed: deploysFailed,
    consecutiveFailures: deploysFailures,
  })
  mockUseCardLoadingState.mockReturnValue({})
  mockSelectedClusters.mockReturnValue([])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConsoleIssuesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaults()
  })

  describe('issue list render', () => {
    it('renders pod and deployment issue counts in summary tiles', () => {
      setupDefaults({
        podIssues: [makePodIssue(), makePodIssue({ name: 'pod-b' })],
        deploymentIssues: [makeDeploymentIssue()],
      })
      render(<ConsoleIssuesCard />)

      expect(screen.getByTitle('2 pods with issues - Click to view first issue')).toHaveTextContent('2')
      expect(screen.getByText('Pod Issues')).toBeInTheDocument()
      expect(screen.getByTitle('1 deployment with issues - Click to view first issue')).toHaveTextContent('1')
      expect(screen.getByText('Deployment Issues')).toBeInTheDocument()
    })

    it('renders top pod issues in the preview list', () => {
      setupDefaults({
        podIssues: [
          makePodIssue({ name: 'alpha-pod', status: 'Error' }),
          makePodIssue({ name: 'beta-pod', status: 'Pending' }),
        ],
      })
      render(<ConsoleIssuesCard />)

      expect(screen.getByText('alpha-pod')).toBeInTheDocument()
      expect(screen.getByText('Error')).toBeInTheDocument()
      expect(screen.getByText('beta-pod')).toBeInTheDocument()
    })

    it('shows overflow count when more than three issues exist', () => {
      setupDefaults({
        podIssues: [
          makePodIssue({ name: 'p1' }),
          makePodIssue({ name: 'p2' }),
          makePodIssue({ name: 'p3' }),
          makePodIssue({ name: 'p4' }),
        ],
      })
      render(<ConsoleIssuesCard />)

      expect(screen.getByText('+1 more issues')).toBeInTheDocument()
    })

    it('drills to pod when a preview row is clicked', async () => {
      const issue = makePodIssue({ name: 'click-pod', cluster: 'prod', namespace: 'kube-system' })
      setupDefaults({ podIssues: [issue] })
      render(<ConsoleIssuesCard />)

      await userEvent.click(screen.getByText('click-pod'))
      expect(mockDrillToPod).toHaveBeenCalledWith(
        'prod',
        'kube-system',
        'click-pod',
        expect.objectContaining({ status: issue.status }),
      )
    })

    it('starts repair mission when Ask AI to Fix is clicked', async () => {
      setupDefaults({ podIssues: [makePodIssue()] })
      render(<ConsoleIssuesCard />)

      await userEvent.click(screen.getByText('Ask AI to Fix'))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'repair', title: 'Fix Cluster Issues' }),
      )
    })
  })

  describe('empty state', () => {
    it('shows All Clear when there are no issues', () => {
      setupDefaults()
      render(<ConsoleIssuesCard />)

      expect(screen.getByText('All Clear')).toBeInTheDocument()
      expect(screen.getByTitle('No pod issues')).toHaveTextContent('0')
      expect(screen.getByTitle('No deployment issues')).toHaveTextContent('0')
    })

    it('disables the repair button when total issues is zero', () => {
      setupDefaults()
      render(<ConsoleIssuesCard />)

      expect(screen.getByRole('button', { name: /All Clear/i })).toBeDisabled()
    })
  })

  describe('loading skeleton integration', () => {
    it('reports loading to CardWrapper when fetching with no cached data', () => {
      setupDefaults({ podIssuesLoading: true, deployIssuesLoading: true })
      render(<ConsoleIssuesCard />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isLoading: true,
          hasAnyData: false,
        }),
      )
    })

    it('does not report loading when cached issues exist while refreshing', () => {
      setupDefaults({
        podIssues: [makePodIssue()],
        podIssuesLoading: true,
        podsRefreshing: true,
      })
      render(<ConsoleIssuesCard />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isLoading: false,
          isRefreshing: true,
          hasAnyData: true,
        }),
      )
    })
  })

  describe('useCardLoadingState integration', () => {
    it('passes isDemoData=true when pod hook uses demo fallback', () => {
      setupDefaults({ podsDemoFallback: true, podIssues: [makePodIssue()] })
      render(<ConsoleIssuesCard />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true }),
      )
    })

    it('passes isDemoData=true when deployment hook uses demo fallback', () => {
      setupDefaults({ deploysDemoFallback: true, deploymentIssues: [makeDeploymentIssue()] })
      render(<ConsoleIssuesCard />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true }),
      )
    })

    it('passes isFailed and max consecutiveFailures from both hooks', () => {
      setupDefaults({
        podsFailed: true,
        deploysFailed: true,
        podsFailures: 2,
        deploysFailures: 5,
      })
      render(<ConsoleIssuesCard />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isFailed: true,
          consecutiveFailures: 5,
        }),
      )
    })
  })

  describe('running repair mission', () => {
    it('shows Repair in Progress and disables button when a repair mission is running', () => {
      setupDefaults({
        podIssues: [makePodIssue()],
        missions: [{ type: 'repair', status: 'running' }],
      })
      render(<ConsoleIssuesCard />)

      expect(screen.getByText('Repair in Progress')).toBeInTheDocument()
      expect(screen.getByText('Fixing...')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Repair in Progress/i })).toBeDisabled()
    })
  })
})
