import { describe, it, expect } from 'vitest'
import * as network from '../network'

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

  it('exports AI chat limits', () => {
    expect(network.MAX_MESSAGE_SIZE_CHARS).toBeGreaterThan(0)
  })

  it('all numeric exports are positive numbers', () => {
    const numericKeys = Object.entries(network).filter(
      ([, v]) => typeof v === 'number'
    )
    for (const [key, value] of numericKeys) {
      expect(value).toBeGreaterThan(0)
    }
  })
})
