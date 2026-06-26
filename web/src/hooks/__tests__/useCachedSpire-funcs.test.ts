/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedSpire.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { mockAuthFetch, mockUseCache } = vi.hoisted(() => ({
  mockAuthFetch: vi.fn(),
  mockUseCache: vi.fn(),
}))
vi.mock('../../lib/api', () => ({
    createCachedHook: vi.fn(), authFetch: mockAuthFetch }))

vi.mock('../../lib/constants/network', () => ({
    createCachedHook: vi.fn(),
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../useDemoMode', () => ({
    createCachedHook: vi.fn(),
  useDemoMode: () => ({ isDemoMode: false }),
  isDemoModeForced: () => false,
  canToggleDemoMode: () => true,
  isNetlifyDeployment: () => false,
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  getDemoMode: () => false,
  setGlobalDemoMode: vi.fn(),
}))

mockUseCache.mockReturnValue({
  data: null,
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  error: null,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
  refetch: vi.fn(),
})
vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (...args: unknown[]) => mockUseCache(...args),
  createCachedHook: (_config: unknown) => () => mockUseCache(_config),
}))

vi.mock('../../components/cards/CardDataContext', () => ({
    createCachedHook: vi.fn(),
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false, showEmptyState: false })),
  useCardDemoState: vi.fn(),
}))

import { __testables, useCachedSpire } from '../useCachedSpire'
import type {
  SpireServerPod,
  SpireAgentDaemonSet,
  SpireSummary,
} from '../../lib/demo/spire'

const { countReadyPods, deriveHealth, buildSpireStatus } = __testables

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeServerPod(overrides: Partial<SpireServerPod> = {}): SpireServerPod {
  return {
    name: 'spire-server-0',
    phase: 'Running',
    ready: true,
    restarts: 0,
    startedAt: new Date().toISOString(),
    node: 'node-1',
    ...overrides,
  }
}

function makeAgentDaemonSet(
  overrides: Partial<SpireAgentDaemonSet> = {},
): SpireAgentDaemonSet {
  return {
    name: 'spire-agent',
    namespace: 'spire-system',
    desiredNumberScheduled: 3,
    numberReady: 3,
    numberAvailable: 3,
    numberMisscheduled: 0,
    ...overrides,
  }
}

function makeSummary(overrides: Partial<SpireSummary> = {}): SpireSummary {
  return {
    registrationEntries: 0,
    attestedAgents: 0,
    trustBundleAgeHours: 0,
    serverReadyReplicas: 0,
    serverDesiredReplicas: 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// countReadyPods
// ---------------------------------------------------------------------------

describe('countReadyPods', () => {
  it('returns 0 for empty array', () => {
    expect(countReadyPods([])).toBe(0)
  })

  it('counts only pods that are ready AND Running', () => {
    const pods = [
      makeServerPod({ ready: true, phase: 'Running' }),
      makeServerPod({ ready: false, phase: 'Running' }),
      makeServerPod({ ready: true, phase: 'Pending' }),
      makeServerPod({ ready: true, phase: 'Running' }),
    ]
    expect(countReadyPods(pods)).toBe(2)
  })

  it('returns 0 when no pods are ready', () => {
    const pods = [
      makeServerPod({ ready: false, phase: 'Failed' }),
      makeServerPod({ ready: false, phase: 'Pending' }),
    ]
    expect(countReadyPods(pods)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  it('returns not-installed when no server pods and no agent', () => {
    expect(deriveHealth([], null, makeSummary())).toBe('not-installed')
  })

  it('returns healthy when all server pods are ready and agent is fully scheduled', () => {
    const pods = [
      makeServerPod({ ready: true, phase: 'Running' }),
      makeServerPod({ ready: true, phase: 'Running' }),
    ]
    const agent = makeAgentDaemonSet({
      desiredNumberScheduled: 3,
      numberReady: 3,
      numberMisscheduled: 0,
    })
    const summary = makeSummary({ serverDesiredReplicas: 2 })
    expect(deriveHealth(pods, agent, summary)).toBe('healthy')
  })

  it('returns degraded when server pods are not all ready', () => {
    const pods = [
      makeServerPod({ ready: true, phase: 'Running' }),
      makeServerPod({ ready: false, phase: 'Pending' }),
    ]
    const summary = makeSummary({ serverDesiredReplicas: 2 })
    expect(deriveHealth(pods, null, summary)).toBe('degraded')
  })

  it('returns degraded when agent numberReady < desiredNumberScheduled', () => {
    const pods = [makeServerPod({ ready: true, phase: 'Running' })]
    const agent = makeAgentDaemonSet({
      desiredNumberScheduled: 5,
      numberReady: 3,
    })
    const summary = makeSummary({ serverDesiredReplicas: 1 })
    expect(deriveHealth(pods, agent, summary)).toBe('degraded')
  })

  it('returns degraded when agent has misscheduled nodes', () => {
    const pods = [makeServerPod({ ready: true, phase: 'Running' })]
    const agent = makeAgentDaemonSet({
      desiredNumberScheduled: 3,
      numberReady: 3,
      numberMisscheduled: 2,
    })
    const summary = makeSummary({ serverDesiredReplicas: 1 })
    expect(deriveHealth(pods, agent, summary)).toBe('degraded')
  })

  it('returns healthy with only agent (no server pods)', () => {
    const agent = makeAgentDaemonSet()
    const summary = makeSummary({ serverDesiredReplicas: 0 })
    expect(deriveHealth([], agent, summary)).toBe('healthy')
  })

  it('uses pods.length as expected replicas when serverDesiredReplicas is 0', () => {
    const pods = [
      makeServerPod({ ready: true, phase: 'Running' }),
      makeServerPod({ ready: false, phase: 'Pending' }),
    ]
    const summary = makeSummary({ serverDesiredReplicas: 0 })
    // expectedServerReplicas = pods.length = 2, readyPods = 1 < 2 → degraded
    expect(deriveHealth(pods, null, summary)).toBe('degraded')
  })

  it('returns healthy when all pods ready and serverDesiredReplicas is 0', () => {
    const pods = [
      makeServerPod({ ready: true, phase: 'Running' }),
    ]
    const summary = makeSummary({ serverDesiredReplicas: 0 })
    // expectedServerReplicas = pods.length = 1, readyPods = 1 → not degraded
    expect(deriveHealth(pods, null, summary)).toBe('healthy')
  })
})

// ---------------------------------------------------------------------------
// buildSpireStatus
// ---------------------------------------------------------------------------

describe('buildSpireStatus', () => {
  it('builds a complete status with healthy health', () => {
    const pods = [makeServerPod({ ready: true, phase: 'Running' })]
    const agent = makeAgentDaemonSet()
    const result = buildSpireStatus('1.10.4', 'example.org', pods, agent, {
      registrationEntries: 50,
      attestedAgents: 3,
      trustBundleAgeHours: 12,
      serverDesiredReplicas: 1,
    })

    expect(result.health).toBe('healthy')
    expect(result.version).toBe('1.10.4')
    expect(result.trustDomain).toBe('example.org')
    expect(result.serverPods).toHaveLength(1)
    expect(result.agentDaemonSet).not.toBeNull()
    expect(result.summary.registrationEntries).toBe(50)
    expect(result.summary.attestedAgents).toBe(3)
    expect(result.summary.trustBundleAgeHours).toBe(12)
    expect(result.summary.serverReadyReplicas).toBe(1)
    expect(result.summary.serverDesiredReplicas).toBe(1)
    expect(result.lastCheckTime).toBeTruthy()
  })

  it('returns not-installed for empty inputs', () => {
    const result = buildSpireStatus('unknown', '', [], null, {})
    expect(result.health).toBe('not-installed')
    expect(result.serverPods).toEqual([])
    expect(result.agentDaemonSet).toBeNull()
  })

  it('defaults serverReadyReplicas from countReadyPods when not in summary', () => {
    const pods = [
      makeServerPod({ ready: true, phase: 'Running' }),
      makeServerPod({ ready: true, phase: 'Running' }),
    ]
    const result = buildSpireStatus('1.10.4', 'test.org', pods, null, {})
    expect(result.summary.serverReadyReplicas).toBe(2)
  })

  it('defaults attestedAgents from agent numberReady when not in summary', () => {
    const agent = makeAgentDaemonSet({ numberReady: 7 })
    const result = buildSpireStatus('1.10.4', 'test.org', [], agent, {})
    expect(result.summary.attestedAgents).toBe(7)
  })

  it('defaults serverDesiredReplicas to pods.length when not in summary', () => {
    const pods = [
      makeServerPod(),
      makeServerPod(),
      makeServerPod(),
    ]
    const result = buildSpireStatus('1.10.4', 'test.org', pods, null, {})
    expect(result.summary.serverDesiredReplicas).toBe(3)
  })

  it('uses provided serverDesiredReplicas from summary', () => {
    const pods = [makeServerPod()]
    const result = buildSpireStatus('1.10.4', 'test.org', pods, null, {
      serverDesiredReplicas: 5,
    })
    expect(result.summary.serverDesiredReplicas).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// fetcher (via useCache capture)
// ---------------------------------------------------------------------------

describe('fetcher (via useCache capture)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: null,
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
    })
  })

  it('returns parsed SPIRE status on successful response', async () => {
    const validResponse = {
      version: '1.10.4',
      trustDomain: 'example.org',
      serverPods: [
        { name: 'spire-server-0', phase: 'Running', ready: true, restarts: 0, startedAt: new Date().toISOString(), node: 'node-1' },
      ],
      agentDaemonSet: { name: 'spire-agent', namespace: 'spire-system', desiredNumberScheduled: 3, numberReady: 3, numberAvailable: 3, numberMisscheduled: 0 },
      summary: { registrationEntries: 50, attestedAgents: 3, trustBundleAgeHours: 12, serverDesiredReplicas: 1 },
    }

    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validResponse),
    })

    renderHook(() => useCachedSpire())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    expect(result.health).toBe('healthy')
    expect(result.version).toBe('1.10.4')
    expect(result.trustDomain).toBe('example.org')
    expect(result.serverPods).toHaveLength(1)
  })

  it('returns not-installed status on 404 response (no throw)', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 404,
    })

    renderHook(() => useCachedSpire())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    // SPIRE fetcher returns buildSpireStatus on 404 — does not throw
    expect(result.health).toBe('not-installed')
  })

  it('throws when authFetch returns a non-404 error', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 500,
    })

    renderHook(() => useCachedSpire())
    const config = mockUseCache.mock.calls[0][0]

    await expect(config.fetcher()).rejects.toThrow('HTTP 500')
  })

  it('throws when authFetch rejects (network error)', async () => {
    mockAuthFetch.mockRejectedValue(new Error('Network failure'))

    renderHook(() => useCachedSpire())
    const config = mockUseCache.mock.calls[0][0]

    await expect(config.fetcher()).rejects.toThrow('Network failure')
  })
})
