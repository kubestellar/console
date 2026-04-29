import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { VolcanoStatusData, VolcanoQueue, VolcanoJob } from '../demoData'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseCachedVolcano = vi.fn()
vi.mock('../../../../hooks/useCachedVolcano', () => ({
  useCachedVolcano: (...args: unknown[]) => mockUseCachedVolcano(...args),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOpts?: string | Record<string, unknown>) => {
      if (typeof fallbackOrOpts === 'string') return fallbackOrOpts
      return key
    },
  }),
}))

const mockUseReportCardDataState = vi.fn()
vi.mock('../../CardDataContext', () => ({
  useReportCardDataState: (opts: unknown) => mockUseReportCardDataState(opts),
}))

vi.mock('../../../../lib/formatters', () => ({
  formatTimeAgo: () => 'just now',
}))

// Import component after mocks
import { VolcanoStatus } from '../index'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueue(overrides: Partial<VolcanoQueue> = {}): VolcanoQueue {
  return {
    name: 'default',
    state: 'Open',
    weight: 1,
    runningJobs: 3,
    pendingJobs: 1,
    allocatedCpu: 18,
    allocatedMemGiB: 72,
    allocatedGpu: 1,
    capabilityCpu: 64,
    capabilityMemGiB: 256,
    capabilityGpu: 4,
    cluster: 'prod-east',
    ...overrides,
  }
}

function makeJob(overrides: Partial<VolcanoJob> = {}): VolcanoJob {
  return {
    name: 'resnet50-train-001',
    namespace: 'ml-training',
    queue: 'ml-training',
    phase: 'Running',
    minAvailable: 8,
    runningPods: 8,
    totalPods: 8,
    gpuRequest: 4,
    cluster: 'prod-east',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeData(overrides: Partial<VolcanoStatusData> = {}): VolcanoStatusData {
  return {
    health: 'healthy',
    queues: [makeQueue()],
    jobs: [makeJob()],
    podGroups: [
      {
        name: 'resnet50-train-001-pg',
        namespace: 'ml-training',
        queue: 'ml-training',
        phase: 'Running',
        minMember: 8,
        runningMember: 8,
        cluster: 'prod-east',
      },
    ],
    stats: {
      totalQueues: 1,
      openQueues: 1,
      totalJobs: 7,
      pendingJobs: 1,
      runningJobs: 3,
      completedJobs: 2,
      failedJobs: 1,
      totalPodGroups: 5,
      allocatedGpu: 4,
      schedulerVersion: '1.9.0',
    },
    summary: {
      totalQueues: 1,
      totalJobs: 7,
      totalPodGroups: 5,
      allocatedGpu: 4,
    },
    lastCheckTime: new Date().toISOString(),
    ...overrides,
  }
}

function defaultHookReturn(overrides: Record<string, unknown> = {}) {
  return {
    data: makeData(),
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    showSkeleton: false,
    showEmptyState: false,
    error: false,
    refetch: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VolcanoStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCachedVolcano.mockReturnValue(defaultHookReturn())
    mockUseReportCardDataState.mockReturnValue(undefined)
  })

  it('renders without crashing', () => {
    const { container } = render(<VolcanoStatus />)
    expect(container).toBeTruthy()
  })

  it('renders loading skeleton when showSkeleton is true', () => {
    mockUseCachedVolcano.mockReturnValue(
      defaultHookReturn({ showSkeleton: true, data: makeData({ health: 'unknown' }) }),
    )
    const { container } = render(<VolcanoStatus />)
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders error state when error and showEmptyState are true', () => {
    mockUseCachedVolcano.mockReturnValue(
      defaultHookReturn({ error: true, showEmptyState: true, isFailed: true }),
    )
    render(<VolcanoStatus />)
    expect(screen.getByText('Unable to fetch Volcano status')).toBeTruthy()
  })

  it('renders not-installed state', () => {
    mockUseCachedVolcano.mockReturnValue(
      defaultHookReturn({ data: makeData({ health: 'not-installed' }) }),
    )
    render(<VolcanoStatus />)
    expect(screen.getByText('Volcano scheduler not detected')).toBeTruthy()
  })

  it('renders healthy state with green indicator', () => {
    const { container } = render(<VolcanoStatus />)
    expect(screen.getByText('Healthy')).toBeTruthy()
    const greenElements = container.querySelectorAll('.text-green-400')
    expect(greenElements.length).toBeGreaterThan(0)
  })

  it('renders degraded state with yellow indicator', () => {
    mockUseCachedVolcano.mockReturnValue(
      defaultHookReturn({ data: makeData({ health: 'degraded' }) }),
    )
    render(<VolcanoStatus />)
    expect(screen.getByText('Degraded')).toBeTruthy()
  })

  it('renders queue rows', () => {
    render(<VolcanoStatus />)
    expect(screen.getByText('default')).toBeTruthy()
    expect(screen.getByText('Open')).toBeTruthy()
  })

  it('renders job rows with phase badges', () => {
    render(<VolcanoStatus />)
    expect(screen.getByText('Running')).toBeTruthy()
  })

  it('renders job namespace/name', () => {
    render(<VolcanoStatus />)
    expect(screen.getByText('ml-training/resnet50-train-001')).toBeTruthy()
  })

  it('renders GPU request for jobs', () => {
    render(<VolcanoStatus />)
    expect(screen.getByText('4 GPU')).toBeTruthy()
  })

  it('renders CPU-only label for jobs with no GPU', () => {
    mockUseCachedVolcano.mockReturnValue(
      defaultHookReturn({ data: makeData({ jobs: [makeJob({ gpuRequest: 0 })] }) }),
    )
    render(<VolcanoStatus />)
    expect(screen.getByText('CPU-only')).toBeTruthy()
  })

  it('renders scheduler version', () => {
    render(<VolcanoStatus />)
    expect(screen.getByText('1.9.0')).toBeTruthy()
  })

  it('renders summary metric tiles', () => {
    render(<VolcanoStatus />)
    expect(screen.getByText('Queues')).toBeTruthy()
    expect(screen.getByText('Pending')).toBeTruthy()
  })

  it('handles empty queues array safely', () => {
    mockUseCachedVolcano.mockReturnValue(
      defaultHookReturn({ data: makeData({ queues: [] }) }),
    )
    render(<VolcanoStatus />)
    expect(screen.getByText('No queues configured')).toBeTruthy()
  })

  it('handles empty jobs array safely', () => {
    mockUseCachedVolcano.mockReturnValue(
      defaultHookReturn({ data: makeData({ jobs: [] }) }),
    )
    render(<VolcanoStatus />)
    expect(screen.getByText('No Volcano jobs found')).toBeTruthy()
  })

  it('handles undefined queues/jobs/podGroups gracefully (array safety)', () => {
    const data = makeData()
    ;(data as Record<string, unknown>).queues = undefined
    ;(data as Record<string, unknown>).jobs = undefined
    ;(data as Record<string, unknown>).podGroups = undefined
    mockUseCachedVolcano.mockReturnValue(defaultHookReturn({ data }))
    const { container } = render(<VolcanoStatus />)
    expect(container).toBeTruthy()
  })

  it('reports card data state with correct arguments', () => {
    render(<VolcanoStatus />)
    expect(mockUseReportCardDataState).toHaveBeenCalledWith(
      expect.objectContaining({
        isFailed: false,
        isDemoData: false,
        isRefreshing: false,
        hasData: true,
      }),
    )
  })

  it('reports isDemoData when hook returns isDemoData true', () => {
    mockUseCachedVolcano.mockReturnValue(defaultHookReturn({ isDemoData: true }))
    render(<VolcanoStatus />)
    expect(mockUseReportCardDataState).toHaveBeenCalledWith(
      expect.objectContaining({ isDemoData: true }),
    )
  })

  it('renders queue CPU/GPU usage bars', () => {
    render(<VolcanoStatus />)
    expect(screen.getByText('CPU')).toBeTruthy()
    expect(screen.getByText('GPU')).toBeTruthy()
  })
})
