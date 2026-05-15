import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConsoleHealthCheckCard } from '../ConsoleHealthCheckCard'

const mockDrillToAllClusters = vi.fn()
const mockDrillToCluster = vi.fn()
const mockDrillToPod = vi.fn()
const mockStartMission = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockHorseshoeGauge = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({
    startMission: mockStartMission,
    missions: [],
  }),
}))

vi.mock('../../../../hooks/useMCP', () => ({
  useClusters: () => ({
    deduplicatedClusters: [
      { name: 'ctx-a', healthy: true, reachable: true, nodeCount: 2, podCount: 4 },
      { name: 'ctx-b', healthy: true, reachable: true, nodeCount: 3, podCount: 5 },
      { name: 'ctx-c', healthy: true, reachable: true, nodeCount: 1, podCount: 2 },
    ],
    isLoading: false,
    isRefreshing: false,
  }),
}))

vi.mock('../../../../hooks/useCachedData', () => ({
  useCachedPodIssues: () => ({
    issues: [{ cluster: 'ctx-a' }, { cluster: 'ctx-b' }],
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
  }),
  useCachedDeploymentIssues: () => ({
    issues: [],
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
  }),
}))

vi.mock('../../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [],
    isAllClustersSelected: true,
    customFilter: '',
  }),
}))

vi.mock('../../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToAllClusters: mockDrillToAllClusters,
    drillToCluster: mockDrillToCluster,
    drillToPod: mockDrillToPod,
  }),
}))

vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

vi.mock('../../llmd/shared/HorseshoeGauge', () => ({
  HorseshoeGauge: (props: Record<string, unknown>) => {
    mockHorseshoeGauge(props)
    return <div data-testid="horseshoe-gauge" />
  },
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

describe('ConsoleHealthCheckCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the all-clusters drilldown for healthy and unhealthy stats', async () => {
    const user = userEvent.setup()

    render(<ConsoleHealthCheckCard />)

    await user.click(screen.getByTitle('healthCheck.healthyClusterTooltip'))
    await user.click(screen.getByTitle('healthCheck.unhealthyClusterTooltip'))

    expect(mockDrillToAllClusters).toHaveBeenNthCalledWith(1, 'healthy')
    expect(mockDrillToAllClusters).toHaveBeenNthCalledWith(2, 'unhealthy')
    expect(mockDrillToCluster).not.toHaveBeenCalled()
  })

  it('computes the horseshoe score from healthy clusters only', () => {
    render(<ConsoleHealthCheckCard />)

    expect(mockHorseshoeGauge).toHaveBeenCalledWith(
      expect.objectContaining({ value: 100 }),
    )
  })
})