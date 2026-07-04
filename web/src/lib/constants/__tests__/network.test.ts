import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock process.env before importing the module
vi.stubEnv('NODE_ENV', 'test')

import {
  LOCAL_AGENT_WS_URL,
  LOCAL_AGENT_HTTP_URL,
  BACKEND_DEFAULT_URL,
  WS_CONNECT_TIMEOUT_MS,
  WS_CONNECTION_COOLDOWN_MS,
  KUBECTL_DEFAULT_TIMEOUT_MS,
  KUBECTL_MEDIUM_TIMEOUT_MS,
  KUBECTL_EXTENDED_TIMEOUT_MS,
  KUBECTL_MAX_TIMEOUT_MS,
  POLL_INTERVAL_FAST_MS,
  POLL_INTERVAL_MS,
  POLL_INTERVAL_SLOW_MS,
  UI_FEEDBACK_TIMEOUT_MS,
  TOAST_DISMISS_MS,
  FOCUS_DELAY_MS,
  CLOSE_ANIMATION_MS,
  TRANSITION_DELAY_MS,
  LOADING_TIMEOUT_MS,
  CARD_LOADING_TIMEOUT_MS,
  LATENCY_GOOD_MS,
  LATENCY_ACCEPTABLE_MS,
  MAX_MESSAGE_SIZE_CHARS,
  suppressLocalAgent,
  isLocalAgentSuppressed,
  suppressOptionalPollers,
  areOptionalPollersSuppressed,
  getWsBackoffDelay,
  WS_RECONNECT_BASE_DELAY_MS,
  WS_RECONNECT_MAX_DELAY_MS,
  WS_BACKOFF_JITTER_MAX_MS,
  isTestEnvironment,
  getLocalAgentURLs,
} from '../network'

const network = {
  LOCAL_AGENT_WS_URL,
  LOCAL_AGENT_HTTP_URL,
  BACKEND_DEFAULT_URL,
  WS_CONNECT_TIMEOUT_MS,
  WS_CONNECTION_COOLDOWN_MS,
  KUBECTL_DEFAULT_TIMEOUT_MS,
  KUBECTL_MEDIUM_TIMEOUT_MS,
  KUBECTL_EXTENDED_TIMEOUT_MS,
  KUBECTL_MAX_TIMEOUT_MS,
  POLL_INTERVAL_FAST_MS,
  POLL_INTERVAL_MS,
  POLL_INTERVAL_SLOW_MS,
  UI_FEEDBACK_TIMEOUT_MS,
  TOAST_DISMISS_MS,
  FOCUS_DELAY_MS,
  CLOSE_ANIMATION_MS,
  TRANSITION_DELAY_MS,
  LOADING_TIMEOUT_MS,
  CARD_LOADING_TIMEOUT_MS,
  LATENCY_GOOD_MS,
  LATENCY_ACCEPTABLE_MS,
  MAX_MESSAGE_SIZE_CHARS,
  suppressLocalAgent,
  isLocalAgentSuppressed,
}

describe('network constants', () => {
  it('exports URL constants', () => {
    expect(typeof network.LOCAL_AGENT_WS_URL).toBe('string')
    expect(typeof network.LOCAL_AGENT_HTTP_URL).toBe('string')
    expect(typeof network.BACKEND_DEFAULT_URL).toBe('string')
  })

  it('exports WebSocket timeouts', () => {
    expect(network.WS_CONNECT_TIMEOUT_MS).toBeGreaterThan(0)
    expect(network.WS_CONNECTION_COOLDOWN_MS).toBeGreaterThan(0)
  })

  it('exports kubectl timeouts in ascending order', () => {
    expect(network.KUBECTL_DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(network.KUBECTL_MEDIUM_TIMEOUT_MS)
    expect(network.KUBECTL_MEDIUM_TIMEOUT_MS).toBeLessThanOrEqual(network.KUBECTL_EXTENDED_TIMEOUT_MS)
    expect(network.KUBECTL_EXTENDED_TIMEOUT_MS).toBeLessThanOrEqual(network.KUBECTL_MAX_TIMEOUT_MS)
  })

  it('exports polling intervals', () => {
    expect(network.POLL_INTERVAL_FAST_MS).toBeLessThan(network.POLL_INTERVAL_MS)
    expect(network.POLL_INTERVAL_MS).toBeLessThan(network.POLL_INTERVAL_SLOW_MS)
  })

  it('exports UI feedback timeouts', () => {
    expect(network.UI_FEEDBACK_TIMEOUT_MS).toBeGreaterThan(0)
    expect(network.TOAST_DISMISS_MS).toBeGreaterThan(0)
  })

  it('exports animation delays', () => {
    expect(network.FOCUS_DELAY_MS).toBeGreaterThan(0)
    expect(network.CLOSE_ANIMATION_MS).toBeGreaterThan(0)
    expect(network.TRANSITION_DELAY_MS).toBeGreaterThan(0)
  })

  it('exports loading thresholds', () => {
    expect(network.LOADING_TIMEOUT_MS).toBeGreaterThan(0)
    expect(network.CARD_LOADING_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('exports latency classification thresholds in ascending order', () => {
    expect(network.LATENCY_GOOD_MS).toBe(100)
    expect(network.LATENCY_GOOD_MS).toBeLessThan(network.LATENCY_ACCEPTABLE_MS)
    expect(network.LATENCY_ACCEPTABLE_MS).toBe(300)
  })

  it('exports AI chat limits', () => {
    expect(network.MAX_MESSAGE_SIZE_CHARS).toBeGreaterThan(0)
  })

  it('exports suppressLocalAgent and isLocalAgentSuppressed functions', () => {
    expect(typeof network.suppressLocalAgent).toBe('function')
    expect(typeof network.isLocalAgentSuppressed).toBe('function')
  })

  it('all numeric exports are positive numbers', () => {
    const numericKeys = Object.entries(network).filter(
      ([, v]) => typeof v === 'number'
    )
    for (const [_key, value] of numericKeys) {
      expect(value).toBeGreaterThan(0)
    }
  })
})

describe('isTestEnvironment (via module init)', () => {
  it('returns true in vitest context', () => {
    expect(isTestEnvironment()).toBe(true)
    expect(process.env.NODE_ENV).toBe('test')
  })
})

describe('getLocalAgentURLs', () => {
  it('returns default URLs when given empty string', () => {
    const result = getLocalAgentURLs('')
    expect(result.httpURL).toBe('http://127.0.0.1:8585')
    expect(result.wsURL).toBe('ws://127.0.0.1:8585/ws')
  })

  it('returns default URLs when given undefined', () => {
    const result = getLocalAgentURLs()
    expect(result.httpURL).toBe('http://127.0.0.1:8585')
    expect(result.wsURL).toBe('ws://127.0.0.1:8585/ws')
  })

  it('returns default URLs when given whitespace', () => {
    const result = getLocalAgentURLs('   ')
    expect(result.httpURL).toBe('http://127.0.0.1:8585')
    expect(result.wsURL).toBe('ws://127.0.0.1:8585/ws')
  })

  it('strips trailing slash from custom URL', () => {
    const result = getLocalAgentURLs('http://custom:9090/')
    expect(result.httpURL).toBe('http://custom:9090')
    expect(result.wsURL).toBe('ws://custom:9090/ws')
  })

  it('strips multiple trailing slashes', () => {
    const result = getLocalAgentURLs('http://custom:9090///')
    expect(result.httpURL).toBe('http://custom:9090')
    expect(result.wsURL).toBe('ws://custom:9090/ws')
  })

  it('converts http to ws protocol', () => {
    const result = getLocalAgentURLs('http://custom:9090')
    expect(result.httpURL).toBe('http://custom:9090')
    expect(result.wsURL).toBe('ws://custom:9090/ws')
  })

  it('converts https to wss protocol', () => {
    const result = getLocalAgentURLs('https://custom:9090')
    expect(result.httpURL).toBe('https://custom:9090')
    expect(result.wsURL).toBe('wss://custom:9090/ws')
  })

  it('handles custom URL with path', () => {
    const result = getLocalAgentURLs('http://custom:9090/api')
    expect(result.httpURL).toBe('http://custom:9090/api')
    expect(result.wsURL).toBe('ws://custom:9090/api/ws')
  })

  it('handles custom URL with path and trailing slash', () => {
    const result = getLocalAgentURLs('http://custom:9090/api/')
    expect(result.httpURL).toBe('http://custom:9090/api')
    expect(result.wsURL).toBe('ws://custom:9090/api/ws')
  })

  it('strips query params from WebSocket URL', () => {
    const result = getLocalAgentURLs('http://custom:9090?foo=bar')
    expect(result.httpURL).toBe('http://custom:9090')
    expect(result.wsURL).toBe('ws://custom:9090/ws')
    expect(result.wsURL).not.toContain('?foo=bar')
  })

  it('strips hash from WebSocket URL', () => {
    const result = getLocalAgentURLs('http://custom:9090#fragment')
    expect(result.httpURL).toBe('http://custom:9090')
    expect(result.wsURL).toBe('ws://custom:9090/ws')
    expect(result.wsURL).not.toContain('#fragment')
  })

  it('falls back to defaults when given invalid URL', () => {
    const result = getLocalAgentURLs('not-a-url')
    expect(result.httpURL).toBe('http://127.0.0.1:8585')
    expect(result.wsURL).toBe('ws://127.0.0.1:8585/ws')
  })

  it('falls back to defaults when given malformed URL', () => {
    const result = getLocalAgentURLs('http://:invalid')
    expect(result.httpURL).toBe('http://127.0.0.1:8585')
    expect(result.wsURL).toBe('ws://127.0.0.1:8585/ws')
  })
})

describe('suppressLocalAgent', () => {
  it('suppresses agent URLs when called with true', () => {
    suppressLocalAgent(true)

    expect(LOCAL_AGENT_WS_URL).toBe('ws://localhost:1/disabled')
    expect(LOCAL_AGENT_HTTP_URL).toBe('')
    expect(isLocalAgentSuppressed()).toBe(true)
  })

  it('does not un-suppress once suppressed', () => {
    suppressLocalAgent(true)
    expect(isLocalAgentSuppressed()).toBe(true)

    suppressLocalAgent(false)
    expect(isLocalAgentSuppressed()).toBe(true)
  })
})

describe('suppressOptionalPollers', () => {
  it('suppresses optional pollers when called with true', () => {
    suppressOptionalPollers(true)
    expect(areOptionalPollersSuppressed()).toBe(true)
  })

  it('remains suppressed once set', () => {
    suppressOptionalPollers(true)
    expect(areOptionalPollersSuppressed()).toBe(true)

    suppressOptionalPollers(false)
    expect(areOptionalPollersSuppressed()).toBe(true)
  })
})

describe('getWsBackoffDelay', () => {
  it('returns base delay plus jitter for attempt 0', () => {
    const delay = getWsBackoffDelay(0)
    const expectedMin = WS_RECONNECT_BASE_DELAY_MS
    const expectedMax = WS_RECONNECT_BASE_DELAY_MS + WS_BACKOFF_JITTER_MAX_MS

    expect(delay).toBeGreaterThanOrEqual(expectedMin)
    expect(delay).toBeLessThan(expectedMax)
  })

  it('returns exponential backoff for successive attempts', () => {
    const delay1 = getWsBackoffDelay(1)
    const delay2 = getWsBackoffDelay(2)

    const expectedMin1 = WS_RECONNECT_BASE_DELAY_MS * 2
    const expectedMax1 = WS_RECONNECT_BASE_DELAY_MS * 2 + WS_BACKOFF_JITTER_MAX_MS

    const expectedMin2 = WS_RECONNECT_BASE_DELAY_MS * 4
    const expectedMax2 = WS_RECONNECT_BASE_DELAY_MS * 4 + WS_BACKOFF_JITTER_MAX_MS

    expect(delay1).toBeGreaterThanOrEqual(expectedMin1)
    expect(delay1).toBeLessThan(expectedMax1)
    expect(delay2).toBeGreaterThanOrEqual(expectedMin2)
    expect(delay2).toBeLessThan(expectedMax2)
  })

  it('caps delay at WS_RECONNECT_MAX_DELAY_MS plus jitter', () => {
    const delay = getWsBackoffDelay(10)
    const expectedMin = WS_RECONNECT_MAX_DELAY_MS
    const expectedMax = WS_RECONNECT_MAX_DELAY_MS + WS_BACKOFF_JITTER_MAX_MS

    expect(delay).toBeGreaterThanOrEqual(expectedMin)
    expect(delay).toBeLessThan(expectedMax)
  })

  it('adds random jitter on each call', () => {
    const delays = Array.from({ length: 5 }, () => getWsBackoffDelay(0))
    const uniqueDelays = new Set(delays)

    expect(uniqueDelays.size).toBeGreaterThan(1)
  })
})
