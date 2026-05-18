/**
 * Unit tests for sharedImpl.health.ts pure / utility functions
 *
 * Covers:
 * - shouldMarkOffline: no failures, within threshold, agent connected+clusters, agent disconnected
 * - recordClusterFailure: first call sets timestamp, second call is no-op
 * - clearClusterFailure: removes failure record, safe on unknown name
 * - setHealthCheckFailures / getHealthCheckFailures: simple getter/setter
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockIsAgentUnavailable = false
let mockAgentClusterCount = 0

vi.mock('../../useLocalAgent', () => ({
  reportAgentDataSuccess: vi.fn(),
  isAgentUnavailable: () => mockIsAgentUnavailable,
  getAgentClusterCount: () => mockAgentClusterCount,
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoToken: () => false,
  isNetlifyDeployment: false,
}))

vi.mock('../../../lib/cache/fetcherUtils', () => ({
  isClusterModeBackend: () => false,
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: { getNodes: vi.fn(), exec: vi.fn() },
}))

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn() },
}))

vi.mock('../agentFetch', () => ({
  getLocalAgentURL: () => 'http://localhost:4201',
  agentFetch: vi.fn(),
  AGENT_TOKEN_STORAGE_KEY: 'kc-auth-token',
}))

vi.mock('../clusterUtils', () => ({
  detectDistributionFromNamespaces: vi.fn(),
}))

vi.mock('../sharedImpl.state', () => ({
  updateSingleClusterInCache: vi.fn(),
}))

vi.mock('../sharedImpl.constants', () => ({
  HEALTH_CHECK_CONCURRENCY: 3,
  MAX_HEALTH_CHECK_FAILURES: 5,
  MAX_DISTRIBUTION_FAILURES: 3,
}))

vi.mock('../../../lib/constants/time', () => ({
  MS_PER_MINUTE: 60_000,
}))

vi.mock('../../../lib/constants', () => ({
  MCP_HOOK_TIMEOUT_MS: 10_000,
  METRICS_SERVER_TIMEOUT_MS: 5_000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:4201',
  KUBECTL_MAX_TIMEOUT_MS: 30_000,
}))

vi.mock('../../../lib/constants/network', () => ({
  MCP_HOOK_TIMEOUT_MS: 10_000,
  METRICS_SERVER_TIMEOUT_MS: 5_000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:4201',
  KUBECTL_MAX_TIMEOUT_MS: 30_000,
  FOCUS_DELAY_MS: 100,
}))

// ── Helpers ────────────────────────────────────────────────────────────────

// OFFLINE_THRESHOLD_MS = 5 * 60_000 = 300_000 ms
const OFFLINE_THRESHOLD_MS = 5 * 60_000

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockIsAgentUnavailable = false
  mockAgentClusterCount = 0
  vi.useRealTimers()
  vi.resetModules()
})

// ── shouldMarkOffline ──────────────────────────────────────────────────────

describe('shouldMarkOffline', () => {
  it('returns false when no failure recorded for cluster', async () => {
    const { shouldMarkOffline } = await import('../sharedImpl.health')
    expect(shouldMarkOffline('no-failure-cluster')).toBe(false)
  })

  it('returns false when failure just recorded (within threshold)', async () => {
    vi.useFakeTimers()
    const { shouldMarkOffline, recordClusterFailure } = await import('../sharedImpl.health')
    vi.setSystemTime(1_000_000)
    recordClusterFailure('new-fail')
    // Advance less than threshold
    vi.advanceTimersByTime(OFFLINE_THRESHOLD_MS - 1)
    expect(shouldMarkOffline('new-fail')).toBe(false)
  })

  it('returns false after threshold when agent is up and has clusters', async () => {
    vi.useFakeTimers()
    mockIsAgentUnavailable = false
    mockAgentClusterCount = 2
    const { shouldMarkOffline, recordClusterFailure } = await import('../sharedImpl.health')
    vi.setSystemTime(1_000_000)
    recordClusterFailure('agent-up-cluster')
    vi.advanceTimersByTime(OFFLINE_THRESHOLD_MS + 1_000)
    // Agent is up with clusters → should NOT mark offline
    expect(shouldMarkOffline('agent-up-cluster')).toBe(false)
  })

  it('returns true after threshold when agent is unavailable', async () => {
    vi.useFakeTimers()
    mockIsAgentUnavailable = true
    const { shouldMarkOffline, recordClusterFailure } = await import('../sharedImpl.health')
    vi.setSystemTime(1_000_000)
    recordClusterFailure('isolated-cluster')
    vi.advanceTimersByTime(OFFLINE_THRESHOLD_MS + 1_000)
    expect(shouldMarkOffline('isolated-cluster')).toBe(true)
  })

  it('returns true after threshold when agent up but reports 0 clusters', async () => {
    vi.useFakeTimers()
    mockIsAgentUnavailable = false
    mockAgentClusterCount = 0
    const { shouldMarkOffline, recordClusterFailure } = await import('../sharedImpl.health')
    vi.setSystemTime(1_000_000)
    recordClusterFailure('zero-cluster')
    vi.advanceTimersByTime(OFFLINE_THRESHOLD_MS + 1_000)
    expect(shouldMarkOffline('zero-cluster')).toBe(true)
  })
})

// ── recordClusterFailure ───────────────────────────────────────────────────

describe('recordClusterFailure', () => {
  it('records a failure timestamp for a new cluster', async () => {
    vi.useFakeTimers()
    mockIsAgentUnavailable = true
    const { recordClusterFailure, shouldMarkOffline } = await import('../sharedImpl.health')
    vi.setSystemTime(2_000_000)
    recordClusterFailure('record-test')
    vi.advanceTimersByTime(OFFLINE_THRESHOLD_MS + 1_000)
    expect(shouldMarkOffline('record-test')).toBe(true)
  })

  it('does not overwrite an existing failure timestamp', async () => {
    vi.useFakeTimers()
    mockIsAgentUnavailable = true
    const { recordClusterFailure, shouldMarkOffline } = await import('../sharedImpl.health')
    // First call sets the baseline
    vi.setSystemTime(1_000)
    recordClusterFailure('idempotent')
    // Advance past threshold
    vi.advanceTimersByTime(OFFLINE_THRESHOLD_MS + 1_000)
    // Second call should not reset the timer (still offline)
    recordClusterFailure('idempotent')
    expect(shouldMarkOffline('idempotent')).toBe(true)
  })
})

// ── clearClusterFailure ────────────────────────────────────────────────────

describe('clearClusterFailure', () => {
  it('clears failure tracking so shouldMarkOffline returns false', async () => {
    vi.useFakeTimers()
    mockIsAgentUnavailable = true
    const { recordClusterFailure, clearClusterFailure, shouldMarkOffline } = await import('../sharedImpl.health')
    vi.setSystemTime(1_000)
    recordClusterFailure('cleared-cluster')
    vi.advanceTimersByTime(OFFLINE_THRESHOLD_MS + 1_000)
    // Confirm it was marked offline first
    expect(shouldMarkOffline('cleared-cluster')).toBe(true)
    // Now clear
    clearClusterFailure('cleared-cluster')
    expect(shouldMarkOffline('cleared-cluster')).toBe(false)
  })

  it('is safe to call for unknown cluster name', async () => {
    const { clearClusterFailure } = await import('../sharedImpl.health')
    expect(() => clearClusterFailure('never-seen')).not.toThrow()
  })
})

// ── setHealthCheckFailures / getHealthCheckFailures ────────────────────────

describe('setHealthCheckFailures / getHealthCheckFailures', () => {
  it('defaults to 0', async () => {
    const { getHealthCheckFailures } = await import('../sharedImpl.health')
    expect(getHealthCheckFailures()).toBe(0)
  })

  it('setter updates the module-level counter', async () => {
    const { setHealthCheckFailures, getHealthCheckFailures } = await import('../sharedImpl.health')
    setHealthCheckFailures(7)
    expect(getHealthCheckFailures()).toBe(7)
  })

  it('reset to 0 works', async () => {
    const { setHealthCheckFailures, getHealthCheckFailures } = await import('../sharedImpl.health')
    setHealthCheckFailures(3)
    setHealthCheckFailures(0)
    expect(getHealthCheckFailures()).toBe(0)
  })
})
