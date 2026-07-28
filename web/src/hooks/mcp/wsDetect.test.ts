import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isWebDriverAutomation, resolveAgentWsUrl, isLikelyWsError } from './wsDetect'

describe('wsDetect', () => {
  describe('isWebDriverAutomation', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', { webdriver: false })
    })

    it('returns true when navigator.webdriver is true', () => {
      vi.stubGlobal('navigator', { webdriver: true })
      expect(isWebDriverAutomation()).toBe(true)
    })

    it('returns false when navigator.webdriver is false', () => {
      vi.stubGlobal('navigator', { webdriver: false })
      expect(isWebDriverAutomation()).toBe(false)
    })

    it('returns false when navigator is undefined', () => {
      vi.stubGlobal('navigator', undefined)
      expect(isWebDriverAutomation()).toBe(false)
    })
  })

  describe('resolveAgentWsUrl', () => {
    beforeEach(() => {
      vi.stubGlobal('window', {
        location: {
          protocol: 'http:',
          host: 'localhost:5174',
        },
      })
    })

    it('returns ws:// URL for http:// protocol', () => {
      vi.stubGlobal('window', {
        location: {
          protocol: 'http:',
          host: 'localhost:5174',
        },
      })
      expect(resolveAgentWsUrl()).toBe('ws://localhost:5174/ws')
    })

    it('returns wss:// URL for https:// protocol', () => {
      vi.stubGlobal('window', {
        location: {
          protocol: 'https:',
          host: 'console.kubestellar.io',
        },
      })
      expect(resolveAgentWsUrl()).toBe('wss://console.kubestellar.io/ws')
    })

    it('handles custom ports correctly', () => {
      vi.stubGlobal('window', {
        location: {
          protocol: 'http:',
          host: 'example.com:8080',
        },
      })
      expect(resolveAgentWsUrl()).toBe('ws://example.com:8080/ws')
    })

    it('handles production domain without port', () => {
      vi.stubGlobal('window', {
        location: {
          protocol: 'https:',
          host: 'console.kubestellar.io',
        },
      })
      expect(resolveAgentWsUrl()).toBe('wss://console.kubestellar.io/ws')
    })
  })

  describe('isLikelyWsError', () => {
    it('returns true for DOMException', () => {
      const error = new DOMException('Network error')
      expect(isLikelyWsError(error)).toBe(true)
    })

    it('returns true for TypeError', () => {
      const error = new TypeError('Type error')
      expect(isLikelyWsError(error)).toBe(true)
    })

    it('returns true for errors with "websocket" in message', () => {
      const error = new Error('WebSocket connection failed')
      expect(isLikelyWsError(error)).toBe(true)
    })

    it('returns true for errors with "ws" in message', () => {
      const error = new Error('WS failed to connect')
      expect(isLikelyWsError(error)).toBe(true)
    })

    it('returns true for errors with "network" in message', () => {
      const error = new Error('Network error occurred')
      expect(isLikelyWsError(error)).toBe(true)
    })

    it('returns true for errors with "failed" in message', () => {
      const error = new Error('Connection failed')
      expect(isLikelyWsError(error)).toBe(true)
    })

    it('returns false for unrelated errors', () => {
      const error = new Error('Invalid argument')
      expect(isLikelyWsError(error)).toBe(false)
    })

    it('handles error objects with message property', () => {
      const error = { message: 'websocket timeout' }
      expect(isLikelyWsError(error)).toBe(true)
    })

    it('handles string errors', () => {
      expect(isLikelyWsError('websocket error')).toBe(true)
    })

    it('handles null error', () => {
      expect(isLikelyWsError(null)).toBe(false)
    })

    it('handles undefined error', () => {
      expect(isLikelyWsError(undefined)).toBe(false)
    })

    it('is case-insensitive for message matching', () => {
      const error = new Error('WEBSOCKET CONNECTION FAILED')
      expect(isLikelyWsError(error)).toBe(true)
    })
  })
})
