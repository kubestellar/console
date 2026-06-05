import { describe, it, expect } from 'vitest'
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
