/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedDragonfly.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../lib/constants/network', () => ({
    createCachedHook: vi.fn(),
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
}))

const { mockAuthFetch, mockUseCache } = vi.hoisted(() => ({
  mockAuthFetch: vi.fn(),
  mockUseCache: vi.fn(() => ({
    data: null,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
  })),
}))
vi.mock('../../lib/api', () => ({
    createCachedHook: vi.fn(), authFetch: mockAuthFetch }))
vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (...args: unknown[]) => mockUseCache(...args),
  createCachedHook: (_config: unknown) => () => mockUseCache(_config),
}))

import { __testables, useCachedDragonfly } from '../useCachedDragonfly'

const { classifyDragonflyPod, podIsReady, parseVersion, buildStatus } = __testables

// ---------------------------------------------------------------------------
// classifyDragonflyPod
// ---------------------------------------------------------------------------

describe('classifyDragonflyPod', () => {
  it('returns null for non-dragonfly pods', () => {
    expect(classifyDragonflyPod({ name: 'nginx-abc' })).toBeNull()
    expect(classifyDragonflyPod({ name: 'prometheus-0' })).toBeNull()
  })

  it('classifies by app.kubernetes.io/component label', () => {
    const pod = { name: 'pod1', metadata: { labels: { 'app.kubernetes.io/component': 'dragonfly-manager' } } }
    expect(classifyDragonflyPod(pod)).toBe('manager')
  })

  it('classifies by short component label', () => {
    const pod = { name: 'pod1', metadata: { labels: { 'app.kubernetes.io/component': 'scheduler' } } }
    expect(classifyDragonflyPod(pod)).toBe('scheduler')
  })

  it('classifies by app.kubernetes.io/name label', () => {
    const pod = { name: 'pod1', metadata: { labels: { 'app.kubernetes.io/name': 'dragonfly-seed-peer' } } }
    expect(classifyDragonflyPod(pod)).toBe('seed-peer')
  })

  it('classifies by app label', () => {
    const pod = { name: 'pod1', metadata: { labels: { app: 'dragonfly-dfdaemon' } } }
    expect(classifyDragonflyPod(pod)).toBe('dfdaemon')
  })

  it('classifies by pod name prefix', () => {
    expect(classifyDragonflyPod({ name: 'dragonfly-manager-abc-xyz' })).toBe('manager')
    expect(classifyDragonflyPod({ name: 'dragonfly-scheduler-0' })).toBe('scheduler')
    expect(classifyDragonflyPod({ name: 'dragonfly-seed-peer-abc' })).toBe('seed-peer')
    expect(classifyDragonflyPod({ name: 'dragonfly-dfdaemon-xyz' })).toBe('dfdaemon')
  })

  it('is case-insensitive for labels', () => {
    const pod = { name: 'pod1', metadata: { labels: { 'app.kubernetes.io/component': 'Dragonfly-Manager' } } }
    expect(classifyDragonflyPod(pod)).toBe('manager')
  })

  it('returns null when labels are empty', () => {
    expect(classifyDragonflyPod({ name: 'random-pod', metadata: { labels: {} } })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// podIsReady
// ---------------------------------------------------------------------------

describe('podIsReady', () => {
  it('returns true when Running and all containers ready', () => {
    const pod = { name: 'p', status: { phase: 'Running', containerStatuses: [{ ready: true }, { ready: true }] } }
    expect(podIsReady(pod)).toBe(true)
  })

  it('returns false when not Running', () => {
    const pod = { name: 'p', status: { phase: 'Pending', containerStatuses: [{ ready: true }] } }
    expect(podIsReady(pod)).toBe(false)
  })

  it('returns false when some containers not ready', () => {
    const pod = { name: 'p', status: { phase: 'Running', containerStatuses: [{ ready: true }, { ready: false }] } }
    expect(podIsReady(pod)).toBe(false)
  })

  it('returns false when no container statuses', () => {
    const pod = { name: 'p', status: { phase: 'Running', containerStatuses: [] } }
    expect(podIsReady(pod)).toBe(false)
  })

  it('returns false when status is missing', () => {
    expect(podIsReady({ name: 'p' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// parseVersion
// ---------------------------------------------------------------------------

describe('parseVersion (dragonfly)', () => {
  it('extracts version tag from container image', () => {
    const pod = {
      name: 'p',
      status: { containerStatuses: [{ image: 'dragonflyoss/manager:v2.1.0' }] },
    }
    expect(parseVersion(pod)).toBe('v2.1.0')
  })

  it('strips digest before extracting version', () => {
    const pod = {
      name: 'p',
      status: { containerStatuses: [{ image: 'dragonflyoss/scheduler:v2.0.5@sha256:abc123' }] },
    }
    expect(parseVersion(pod)).toBe('v2.0.5')
  })

  it('returns empty string for image without tag', () => {
    const pod = { name: 'p', status: { containerStatuses: [{ image: 'dragonflyoss/manager' }] } }
    expect(parseVersion(pod)).toBe('')
  })

  it('returns empty string when no containers', () => {
    expect(parseVersion({ name: 'p' })).toBe('')
    expect(parseVersion({ name: 'p', status: { containerStatuses: [] } })).toBe('')
  })
})

// ---------------------------------------------------------------------------
// buildStatus
// ---------------------------------------------------------------------------

describe('buildStatus (dragonfly)', () => {
  it('returns not-installed for empty pods', () => {
    const result = buildStatus([])
    expect(result.health).toBe('not-installed')
    expect(result.components).toEqual([])
  })

  it('returns not-installed when no dragonfly pods found', () => {
    const pods = [{ name: 'nginx-abc', status: { phase: 'Running' } }]
    const result = buildStatus(pods)
    expect(result.health).toBe('not-installed')
  })

  it('returns healthy when all dragonfly pods are ready', () => {
    const pods = [
      {
        name: 'dragonfly-manager-0',
        namespace: 'dragonfly-system',
        cluster: 'prod',
        status: { phase: 'Running', containerStatuses: [{ ready: true, image: 'dragonflyoss/manager:v2.1.0' }] },
        metadata: { labels: {} },
      },
      {
        name: 'dragonfly-scheduler-0',
        namespace: 'dragonfly-system',
        cluster: 'prod',
        status: { phase: 'Running', containerStatuses: [{ ready: true, image: 'dragonflyoss/scheduler:v2.1.0' }] },
        metadata: { labels: {} },
      },
    ]
    const result = buildStatus(pods)
    expect(result.health).toBe('healthy')
    expect(result.clusterName).toBe('prod')
    expect(result.components).toHaveLength(2)
    expect(result.summary.managerReplicas).toBe(1)
    expect(result.summary.schedulerReplicas).toBe(1)
  })

  it('returns degraded when some pods are not ready', () => {
    const pods = [
      {
        name: 'dragonfly-manager-0',
        namespace: 'dragonfly-system',
        cluster: 'prod',
        status: { phase: 'Running', containerStatuses: [{ ready: true, image: 'img:v1' }] },
        metadata: { labels: {} },
      },
      {
        name: 'dragonfly-scheduler-0',
        namespace: 'dragonfly-system',
        cluster: 'prod',
        status: { phase: 'Pending', containerStatuses: [{ ready: false, image: 'img:v1' }] },
        metadata: { labels: {} },
      },
    ]
    const result = buildStatus(pods)
    expect(result.health).toBe('degraded')
  })

  it('counts dfdaemon pods in summary', () => {
    const pods = [
      {
        name: 'dragonfly-dfdaemon-abc',
        namespace: 'dragonfly-system',
        cluster: 'c1',
        status: { phase: 'Running', containerStatuses: [{ ready: true, image: 'img:v1' }] },
        metadata: { labels: {} },
      },
      {
        name: 'dragonfly-dfdaemon-def',
        namespace: 'dragonfly-system',
        cluster: 'c1',
        status: { phase: 'Running', containerStatuses: [{ ready: false, image: 'img:v1' }] },
        metadata: { labels: {} },
      },
    ]
    const result = buildStatus(pods)
    expect(result.summary.dfdaemonNodesTotal).toBe(2)
    expect(result.summary.dfdaemonNodesUp).toBe(1)
  })

  it('extracts version from first container image', () => {
    const pods = [
      {
        name: 'dragonfly-seed-peer-0',
        namespace: 'ns',
        cluster: '',
        status: { phase: 'Running', containerStatuses: [{ ready: true, image: 'dragonflyoss/seed-peer:v2.0.8' }] },
        metadata: { labels: {} },
      },
    ]
    const result = buildStatus(pods)
    const comp = result.components.find(c => c.component === 'seed-peer')
    expect(comp?.version).toBe('v2.0.8')
  })
})

// ---------------------------------------------------------------------------
// Fetcher (via useCache capture)
// ---------------------------------------------------------------------------

describe('fetchDragonflyStatus (fetcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function captureFetcher(): () => Promise<unknown> {
    renderHook(() => useCachedDragonfly())
    const config = mockUseCache.mock.calls[0]?.[0] as { fetcher: () => Promise<unknown> }
    return config.fetcher
  }

  it('returns parsed data on success', async () => {
    const dragonflyPod = {
      name: 'dragonfly-manager-0',
      namespace: 'dragonfly-system',
      cluster: 'prod',
      status: {
        phase: 'Running',
        containerStatuses: [{ name: 'manager', ready: true, image: 'dragonflyoss/manager:v2.1.0' }],
      },
      metadata: { labels: { 'app.kubernetes.io/component': 'dragonfly-manager' } },
    }
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ items: [dragonflyPod] }),
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string; components: unknown[] }
    expect(result.health).toBe('healthy')
    expect(result.components).toHaveLength(1)
  })

  it('returns not-installed for 404 status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string }
    expect(result.health).toBe('not-installed')
  })

  it('returns not-installed for 503 status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string }
    expect(result.health).toBe('not-installed')
  })

  it('throws on non-whitelisted error status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const fetcher = captureFetcher()
    await expect(fetcher()).rejects.toThrow('HTTP 500')
  })

  it('throws on network error', async () => {
    mockAuthFetch.mockRejectedValueOnce(new Error('Network error'))

    const fetcher = captureFetcher()
    await expect(fetcher()).rejects.toThrow('Network error')
  })

  it('returns not-installed when JSON parse fails', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string }
    expect(result.health).toBe('not-installed')
  })
})
