/**
 * Tests for hooks/mcp/wsDetect.ts
 *
 * Covers isWebDriverAutomation, resolveAgentWsUrl, and isLikelyWsError.
 * The module is re-exported via mcp/shared.ts and used in sharedImpl.connection.ts,
 * but production tests mock the entire mcp/shared module — leaving wsDetect.ts
 * at ~0% coverage despite containing observable branching logic.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { isWebDriverAutomation, resolveAgentWsUrl, isLikelyWsError } from '../wsDetect'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isWebDriverAutomation', () => {
  it('returns false when navigator.webdriver is false', () => {
    vi.stubGlobal('navigator', { ...navigator, webdriver: false })
    expect(isWebDriverAutomation()).toBe(false)
  })

  it('returns true when navigator.webdriver is true', () => {
    vi.stubGlobal('navigator', { ...navigator, webdriver: true })
    expect(isWebDriverAutomation()).toBe(true)
  })
})

describe('resolveAgentWsUrl', () => {
  it('returns ws:// URL for http: protocol', () => {
    // jsdom defaults to http: so this exercises the ws: branch
    const url = resolveAgentWsUrl()
    expect(url).toMatch(/^ws:/)
    expect(url).toMatch(/\/ws$/)
  })

  it('returns wss:// URL for https: protocol', () => {
    vi.stubGlobal('window', {
      ...window,
      location: { ...window.location, protocol: 'https:', host: 'console.example.com' },
    })
    const url = resolveAgentWsUrl()
    expect(url).toMatch(/^wss:/)
    expect(url).toContain('console.example.com/ws')
  })

  it('includes current host in the URL', () => {
    const url = resolveAgentWsUrl()
    expect(url).toContain(window.location.host)
    expect(url).toContain('/ws')
  })
})

describe('isLikelyWsError', () => {
  it('returns true for DOMException', () => {
    expect(isLikelyWsError(new DOMException('WebSocket is closed'))).toBe(true)
  })

  it('returns true for TypeError', () => {
    expect(isLikelyWsError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('returns true for error with "websocket" in message (case-insensitive)', () => {
    expect(isLikelyWsError(new Error('WebSocket connection failed'))).toBe(true)
  })

  it('returns true for error with "ws" in message', () => {
    expect(isLikelyWsError(new Error('ws protocol error'))).toBe(true)
  })

  it('returns true for error with "network" in message', () => {
    expect(isLikelyWsError(new Error('network timeout'))).toBe(true)
  })

  it('returns true for error with "failed" in message', () => {
    expect(isLikelyWsError(new Error('connection failed'))).toBe(true)
  })

  it('returns false for generic unrelated Error', () => {
    expect(isLikelyWsError(new Error('undefined is not a function'))).toBe(false)
  })

  it('returns false for plain string without ws keywords', () => {
    expect(isLikelyWsError('some random error')).toBe(false)
  })

  it('returns true for plain string with "websocket"', () => {
    expect(isLikelyWsError('websocket closed')).toBe(true)
  })

  it('returns false for null', () => {
    expect(isLikelyWsError(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isLikelyWsError(undefined)).toBe(false)
  })

  it('returns false for a number', () => {
    expect(isLikelyWsError(42)).toBe(false)
  })

  it('handles object with message property', () => {
    expect(isLikelyWsError({ message: 'network error occurred' })).toBe(true)
  })
})
