import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ============================================================================
// Mocks
// ============================================================================

const mockExec = vi.fn()

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: (...args: unknown[]) => mockExec(...args) },
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, KUBECTL_EXTENDED_TIMEOUT_MS: 30000 }
})

const mockUseDemoMode = vi.fn(() => ({ isDemoMode: false }))
vi.mock('../useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

import { useProwJobs, getDemoProwJobs } from '../useProw'
import type { ProwJob } from '../useProw'

// ============================================================================
// Helpers
// ============================================================================

/** Build a minimal ProwJobResource for the kubectl JSON output */
function makeProwJobResource(overrides: {
  name?: string
  job?: string
  type?: string
  state?: string
  startTime?: string
  completionTime?: string
  pr?: number
  buildId?: string
} = {}) {
  const now = new Date().toISOString()
  return {
    metadata: {
      name: overrides.name ?? 'pj-1',
      creationTimestamp: now,
      labels: {
        'prow.k8s.io/job': overrides.job ?? 'pull-e2e',
        'prow.k8s.io/type': overrides.type ?? 'presubmit',
        ...(overrides.buildId ? { 'prow.k8s.io/build-id': overrides.buildId } : {}),
      },
    },
    spec: {
      job: overrides.job ?? 'pull-e2e',
      type: overrides.type ?? 'presubmit',
      cluster: 'prow',
      ...(overrides.pr != null ? { refs: { pulls: [{ number: overrides.pr }] } } : {}),
    },
    status: {
      state: overrides.state ?? 'success',
      startTime: overrides.startTime ?? now,
      completionTime: overrides.completionTime,
      url: 'https://prow.example.com/view/1',
      build_id: overrides.buildId,
    },
  }
}

function buildKubectlResponse(items: ReturnType<typeof makeProwJobResource>[]) {
  return {
    exitCode: 0,
    output: JSON.stringify({ items }),
    error: '',
  }
}

const KUBECTL_ERROR_RESPONSE = { exitCode: 1, output: '', error: 'connection refused' }

// ============================================================================
// Tests
// ============================================================================

describe('useProwJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    mockExec.mockResolvedValue(buildKubectlResponse([]))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---------- Shape & Defaults ----------

  it('returns the expected return shape', () => {
    const { result } = renderHook(() => useProwJobs())
    expect(result.current).toHaveProperty('jobs')
    expect(result.current).toHaveProperty('status')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('formatTimeAgo')
    expect(typeof result.current.formatTimeAgo).toBe('function')
  })

  it('starts in loading state', () => {
    // Never resolve the mock so loading remains true
    mockExec.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useProwJobs())
    expect(result.current.isLoading).toBe(true)
  })

  // ---------- Happy Path ----------

  it('fetches and parses ProwJobs from kubectlProxy', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString()
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    mockExec.mockResolvedValue(
      buildKubectlResponse([
        makeProwJobResource({ name: 'pj-a', state: 'success', startTime: tenMinutesAgo, completionTime: fiveMinutesAgo, pr: 42 }),
        makeProwJobResource({ name: 'pj-b', state: 'failure', startTime: tenMinutesAgo }),
      ])
    )

    const { result } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.jobs).toHaveLength(2)
    // Items are reversed (most recent first)
    expect(result.current.jobs[0].id).toBe('pj-b')
    expect(result.current.jobs[1].id).toBe('pj-a')
    expect(result.current.error).toBeNull()
    expect(result.current.consecutiveFailures).toBe(0)
  })

  it('passes custom prowCluster and namespace to kubectlProxy', async () => {
    mockExec.mockResolvedValue(buildKubectlResponse([]))

    const { result } = renderHook(() => useProwJobs('my-cluster', 'ci'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockExec).toHaveBeenCalledWith(
      ['get', 'prowjobs', '-n', 'ci', '-o', 'json', '--sort-by=.metadata.creationTimestamp'],
      expect.objectContaining({ context: 'my-cluster' })
    )
  })

  it('limits results to MAX_PROW_JOBS (100)', async () => {
    const items = Array.from({ length: 120 }, (_, i) =>
      makeProwJobResource({ name: `pj-${i}`, state: 'success' })
    )
    mockExec.mockResolvedValue(buildKubectlResponse(items))

    const { result } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.jobs).toHaveLength(100)
  })

  it('maps PR number from spec.refs.pulls', async () => {
    mockExec.mockResolvedValue(
      buildKubectlResponse([makeProwJobResource({ pr: 999 })])
    )

    const { result } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.jobs[0].pr).toBe(999)
  })

  it('sets duration to dash for pending and triggered jobs', async () => {
    mockExec.mockResolvedValue(
      buildKubectlResponse([
        makeProwJobResource({ name: 'pj-pending', state: 'pending' }),
        makeProwJobResource({ name: 'pj-triggered', state: 'triggered' }),
      ])
    )

    const { result } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    result.current.jobs.forEach((j: ProwJob) => {
      expect(j.duration).toBe('-')
    })
  })

  // ---------- Error Handling ----------

  it('handles kubectl non-zero exit code', async () => {
    mockExec.mockResolvedValue(KUBECTL_ERROR_RESPONSE)

    const { result } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('connection refused')
    expect(result.current.consecutiveFailures).toBe(1)
  })

  it('handles kubectl throwing an exception', async () => {
    mockExec.mockRejectedValue(new Error('network timeout'))

    const { result } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('network timeout')
    expect(result.current.consecutiveFailures).toBe(1)
  })

  it('handles non-Error thrown objects', async () => {
    mockExec.mockRejectedValue('string error')

    const { result } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('Failed to fetch ProwJobs')
  })

  it('sets isFailed after 3 consecutive failures', async () => {
    mockExec.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // First call fails — not yet isFailed
    expect(result.current.isFailed).toBe(false)
    expect(result.current.consecutiveFailures).toBe(1)

    // Trigger two more failures via refetch
    await act(async () => { result.current.refetch() })
    expect(result.current.consecutiveFailures).toBe(2)
    expect(result.current.isFailed).toBe(false)

    await act(async () => { result.current.refetch() })
    expect(result.current.consecutiveFailures).toBe(3)
    expect(result.current.isFailed).toBe(true)
  })

  it('resets consecutiveFailures on successful fetch', async () => {
    mockExec.mockRejectedValueOnce(new Error('fail'))

    const { result } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(1))

    // Next call succeeds
    mockExec.mockResolvedValue(buildKubectlResponse([makeProwJobResource()]))
    await act(async () => { result.current.refetch() })

    expect(result.current.consecutiveFailures).toBe(0)
    expect(result.current.error).toBeNull()
  })

  // ---------- Status Computation ----------

  it('computes status.healthy as true when consecutiveFailures < 3', async () => {
    mockExec.mockResolvedValue(buildKubectlResponse([]))
    const { result } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.status.healthy).toBe(true)
  })

  it('computes successRate from recent jobs within the last hour', async () => {
    const recent = new Date(Date.now() - 10 * 60_000).toISOString()
    mockExec.mockResolvedValue(
      buildKubectlResponse([
        makeProwJobResource({ name: 'a', state: 'success', startTime: recent }),
        makeProwJobResource({ name: 'b', state: 'success', startTime: recent }),
        makeProwJobResource({ name: 'c', state: 'failure', startTime: recent }),
      ])
    )

    const { result } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // 2 success, 1 failure => 66.7%
    expect(result.current.status.successRate).toBeCloseTo(66.7, 0)
    expect(result.current.status.prowJobsLastHour).toBe(3)
  })

  it('returns 100% successRate when no completed jobs exist', async () => {
    mockExec.mockResolvedValue(buildKubectlResponse([]))
    const { result } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.status.successRate).toBe(100)
  })

  it('counts pending and running jobs separately in status', async () => {
    const now = new Date().toISOString()
    mockExec.mockResolvedValue(
      buildKubectlResponse([
        makeProwJobResource({ name: 'p1', state: 'pending', startTime: now }),
        makeProwJobResource({ name: 'p2', state: 'triggered', startTime: now }),
        makeProwJobResource({ name: 'r1', state: 'running', startTime: now }),
      ])
    )

    const { result } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.status.pendingJobs).toBe(2)
    expect(result.current.status.runningJobs).toBe(1)
  })

  // ---------- Demo Mode ----------

  it('returns demo data in demo mode without calling kubectlProxy', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const { result } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockExec).not.toHaveBeenCalled()
    expect(result.current.jobs.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
    expect(result.current.consecutiveFailures).toBe(0)
  })

  it('getDemoProwJobs returns a non-empty array with valid shapes', () => {
    const demoJobs = getDemoProwJobs()
    expect(demoJobs.length).toBeGreaterThan(0)
    for (const job of demoJobs) {
      expect(job).toHaveProperty('id')
      expect(job).toHaveProperty('name')
      expect(job).toHaveProperty('type')
      expect(job).toHaveProperty('state')
      expect(job).toHaveProperty('startTime')
      expect(job).toHaveProperty('duration')
    }
  })

  it('switches from live to demo data when demo mode toggles on', async () => {
    mockExec.mockResolvedValue(
      buildKubectlResponse([makeProwJobResource({ name: 'live-job' })])
    )

    const { result, rerender } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.jobs[0].id).toBe('live-job')

    // Toggle to demo mode
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    rerender()

    await waitFor(() => {
      expect(result.current.jobs[0].id).not.toBe('live-job')
    })
  })

  // ---------- Polling & Cleanup ----------

  it('sets up polling interval and cleans it up on unmount', async () => {
    mockExec.mockResolvedValue(buildKubectlResponse([]))

    const { result, unmount } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const callCountAfterMount = mockExec.mock.calls.length

    // Advance by the polling interval (2 minutes)
    const REFRESH_INTERVAL_MS = 120_000
    await act(async () => { vi.advanceTimersByTime(REFRESH_INTERVAL_MS) })
    expect(mockExec.mock.calls.length).toBeGreaterThan(callCountAfterMount)

    unmount()
    const callCountAfterUnmount = mockExec.mock.calls.length

    // After unmount, advancing time should not trigger more calls
    await act(async () => { vi.advanceTimersByTime(REFRESH_INTERVAL_MS) })
    expect(mockExec.mock.calls.length).toBe(callCountAfterUnmount)
  })

  // ---------- Refetch ----------

  it('refetch triggers a new fetch and updates lastRefresh', async () => {
    mockExec.mockResolvedValue(buildKubectlResponse([]))

    const { result } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const firstRefresh = result.current.lastRefresh

    await act(async () => { result.current.refetch() })
    expect(result.current.lastRefresh).not.toBe(firstRefresh)
  })

  // ---------- formatTimeAgo ----------

  it('formatTimeAgo returns human-readable time', () => {
    const { result } = renderHook(() => useProwJobs())

    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(result.current.formatTimeAgo(fiveMinAgo)).toBe('5m ago')

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString()
    expect(result.current.formatTimeAgo(twoHoursAgo)).toBe('2h ago')

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString()
    expect(result.current.formatTimeAgo(threeDaysAgo)).toBe('3d ago')
  })

  // ---------- Edge Cases ----------

  it('handles empty items array from kubectl', async () => {
    mockExec.mockResolvedValue({
      exitCode: 0,
      output: JSON.stringify({ items: [] }),
      error: '',
    })

    const { result } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.jobs).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('handles missing optional fields in ProwJobResource gracefully', async () => {
    const minimal = {
      metadata: { name: 'bare-job', creationTimestamp: new Date().toISOString() },
      spec: {},
      status: {},
    }
    mockExec.mockResolvedValue({
      exitCode: 0,
      output: JSON.stringify({ items: [minimal] }),
      error: '',
    })

    const { result } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.jobs).toHaveLength(1)
    expect(result.current.jobs[0].name).toBe('bare-job')
    expect(result.current.jobs[0].pr).toBeUndefined()
    expect(result.current.jobs[0].buildId).toBeUndefined()
  })

  it('falls back to metadata.name when prow.k8s.io/job label is missing', async () => {
    const resource = {
      metadata: { name: 'fallback-name', creationTimestamp: new Date().toISOString() },
      spec: { type: 'periodic' },
      status: { state: 'success', startTime: new Date().toISOString() },
    }
    mockExec.mockResolvedValue({
      exitCode: 0,
      output: JSON.stringify({ items: [resource] }),
      error: '',
    })

    const { result } = renderHook(() => useProwJobs())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.jobs[0].name).toBe('fallback-name')
  })
})
