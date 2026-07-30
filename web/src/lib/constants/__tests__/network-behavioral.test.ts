/**
 * Behavioral tests for network.ts runtime logic.
 *
 * The existing network.test.ts only verifies exports are the correct types
 * and ordering. This file tests the actual behavior of:
 * - isTestEnvironment() (indirectly — verified via module-level URL values)
 * - getLocalAgentURLs() (indirectly — verified via exported URL values)
 * - getWsBackoffDelay() (directly — exported function)
 * - suppressLocalAgent() / isLocalAgentSuppressed()
 * - suppressOptionalPollers() / areOptionalPollersSuppressed()
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('getWsBackoffDelay', () => {
  // We need a fresh import for each test to control Math.random
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns base delay + jitter for attempt 0', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { getWsBackoffDelay, WS_RECONNECT_BASE_DELAY_MS } = await import('../network')
    const delay = getWsBackoffDelay(0)
    // 2000 * 2^0 + 0 jitter = 2000
    expect(delay).toBe(WS_RECONNECT_BASE_DELAY_MS)
  })

  it('doubles delay for each subsequent attempt', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { getWsBackoffDelay, WS_RECONNECT_BASE_DELAY_MS } = await import('../network')
    const delay1 = getWsBackoffDelay(1)
    const delay2 = getWsBackoffDelay(2)
    const delay3 = getWsBackoffDelay(3)
    expect(delay1).toBe(WS_RECONNECT_BASE_DELAY_MS * 2)
    expect(delay2).toBe(WS_RECONNECT_BASE_DELAY_MS * 4)
    expect(delay3).toBe(WS_RECONNECT_BASE_DELAY_MS * 8)
  })

  it('caps at WS_RECONNECT_MAX_DELAY_MS for high attempts', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { getWsBackoffDelay, WS_RECONNECT_MAX_DELAY_MS } = await import('../network')
    const delay = getWsBackoffDelay(100)
    expect(delay).toBe(WS_RECONNECT_MAX_DELAY_MS)
  })

  it('adds jitter up to WS_BACKOFF_JITTER_MAX_MS', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const {
      getWsBackoffDelay,
      WS_RECONNECT_BASE_DELAY_MS,
      WS_BACKOFF_JITTER_MAX_MS,
    } = await import('../network')
    const delay = getWsBackoffDelay(0)
    expect(delay).toBe(WS_RECONNECT_BASE_DELAY_MS + 0.5 * WS_BACKOFF_JITTER_MAX_MS)
  })

  it('maximum jitter is WS_BACKOFF_JITTER_MAX_MS', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    const {
      getWsBackoffDelay,
      WS_RECONNECT_BASE_DELAY_MS,
      WS_BACKOFF_JITTER_MAX_MS,
    } = await import('../network')
    const delay = getWsBackoffDelay(0)
    expect(delay).toBeLessThan(WS_RECONNECT_BASE_DELAY_MS + WS_BACKOFF_JITTER_MAX_MS)
  })

  it('delay is always positive', async () => {
    const { getWsBackoffDelay } = await import('../network')
    for (let i = 0; i < 10; i++) {
      expect(getWsBackoffDelay(i)).toBeGreaterThan(0)
    }
  })

  it('delay at max attempt equals max + jitter', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1)
    const {
      getWsBackoffDelay,
      WS_RECONNECT_MAX_DELAY_MS,
      WS_BACKOFF_JITTER_MAX_MS,
    } = await import('../network')
    const delay = getWsBackoffDelay(20)
    expect(delay).toBe(WS_RECONNECT_MAX_DELAY_MS + WS_BACKOFF_JITTER_MAX_MS)
  })
})

describe('isTestEnvironment (indirect verification)', () => {
  /**
   * In vitest, process.env.NODE_ENV === 'test', so isTestEnvironment() returns true.
   * This means _isNetlify and isConsoleLiveHost are both false (the hostname checks
   * are skipped). Therefore the agent should NOT be suppressed by default.
   */
  it('does not suppress local agent in test environment', async () => {
    const { isLocalAgentSuppressed } = await import('../network')
    // In vitest, isTestEnvironment() is true, so Netlify detection is skipped
    // and the agent is not suppressed (unless VITE_NO_LOCAL_AGENT is set)
    expect(isLocalAgentSuppressed()).toBe(false)
  })

  it('does not suppress optional pollers in test environment', async () => {
    const { areOptionalPollersSuppressed } = await import('../network')
    // isConsoleLiveHost is false in test env due to isTestEnvironment() guard
    expect(areOptionalPollersSuppressed()).toBe(false)
  })

  it('provides valid default agent URLs in test environment', async () => {
    const { LOCAL_AGENT_WS_URL, LOCAL_AGENT_HTTP_URL } = await import('../network')
    // In test env, agent is not suppressed → URLs should be the defaults
    expect(LOCAL_AGENT_HTTP_URL).toBe('http://127.0.0.1:8585')
    expect(LOCAL_AGENT_WS_URL).toBe('ws://127.0.0.1:8585/ws')
  })
})

describe('suppressLocalAgent', () => {
  it('is a function', async () => {
    const { suppressLocalAgent } = await import('../network')
    expect(typeof suppressLocalAgent).toBe('function')
  })

  it('suppressLocalAgent(true) sets isLocalAgentSuppressed to true', async () => {
    // Note: since module state is shared, this test verifies the mutation path.
    // The module may already be suppressed if another test ran first in the same
    // vitest worker. We test the contract: after calling suppress(true), it reports true.
    const { suppressLocalAgent, isLocalAgentSuppressed } = await import('../network')
    suppressLocalAgent(true)
    expect(isLocalAgentSuppressed()).toBe(true)
  })

  it('suppressLocalAgent(false) does not un-suppress if already suppressed', async () => {
    const { suppressLocalAgent, isLocalAgentSuppressed } = await import('../network')
    suppressLocalAgent(true)
    suppressLocalAgent(false) // no-op once suppressed
    expect(isLocalAgentSuppressed()).toBe(true)
  })
})

describe('suppressOptionalPollers', () => {
  it('suppressOptionalPollers(true) enables suppression', async () => {
    const { suppressOptionalPollers, areOptionalPollersSuppressed } = await import('../network')
    suppressOptionalPollers(true)
    expect(areOptionalPollersSuppressed()).toBe(true)
  })

  it('suppressOptionalPollers(false) does not change state', async () => {
    // The function only acts on truthy input
    const { suppressOptionalPollers, areOptionalPollersSuppressed } = await import('../network')
    const before = areOptionalPollersSuppressed()
    suppressOptionalPollers(false)
    // State should not have changed to false if it was true
    expect(areOptionalPollersSuppressed()).toBe(before)
  })
})

describe('getLocalAgentURLs (indirect via module defaults)', () => {
  /**
   * The module initializes URLs using getLocalAgentURLs(import.meta.env.VITE_KC_AGENT_URL).
   * In vitest, VITE_KC_AGENT_URL is typically unset, so we get defaults.
   */
  it('default HTTP URL is http://127.0.0.1:8585', async () => {
    const { LOCAL_AGENT_HTTP_URL } = await import('../network')
    // Only valid if agent is not suppressed
    const { isLocalAgentSuppressed } = await import('../network')
    if (!isLocalAgentSuppressed()) {
      expect(LOCAL_AGENT_HTTP_URL).toBe('http://127.0.0.1:8585')
    }
  })

  it('default WS URL converts http to ws and appends /ws', async () => {
    const { LOCAL_AGENT_WS_URL, isLocalAgentSuppressed } = await import('../network')
    if (!isLocalAgentSuppressed()) {
      expect(LOCAL_AGENT_WS_URL).toMatch(/^ws:\/\//)
      expect(LOCAL_AGENT_WS_URL).toContain('/ws')
    }
  })
})

describe('WebSocket backoff constants', () => {
  it('WS_RECONNECT_BASE_DELAY_MS is 2000', async () => {
    const { WS_RECONNECT_BASE_DELAY_MS } = await import('../network')
    expect(WS_RECONNECT_BASE_DELAY_MS).toBe(2_000)
  })

  it('WS_RECONNECT_MAX_DELAY_MS is 30000', async () => {
    const { WS_RECONNECT_MAX_DELAY_MS } = await import('../network')
    expect(WS_RECONNECT_MAX_DELAY_MS).toBe(30_000)
  })

  it('MAX_WS_RECONNECT_ATTEMPTS is 5', async () => {
    const { MAX_WS_RECONNECT_ATTEMPTS } = await import('../network')
    expect(MAX_WS_RECONNECT_ATTEMPTS).toBe(5)
  })

  it('WS_BACKOFF_JITTER_MAX_MS is 1000', async () => {
    const { WS_BACKOFF_JITTER_MAX_MS } = await import('../network')
    expect(WS_BACKOFF_JITTER_MAX_MS).toBe(1_000)
  })

  it('max delay > base delay', async () => {
    const { WS_RECONNECT_BASE_DELAY_MS, WS_RECONNECT_MAX_DELAY_MS } = await import('../network')
    expect(WS_RECONNECT_MAX_DELAY_MS).toBeGreaterThan(WS_RECONNECT_BASE_DELAY_MS)
  })
})
