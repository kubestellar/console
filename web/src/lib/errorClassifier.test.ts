import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  classifyError,
  getErrorTypeFromString,
  getIconForErrorType,
  getSuggestionForErrorType,
  formatLastSeen,
} from './errorClassifier'

describe('errorClassifier', () => {
  describe('classifyError', () => {
    it('classifies authentication errors', () => {
      const result = classifyError('The server responded with 401 Unauthorized')
      expect(result.type).toBe('auth')
      expect(result.icon).toBe('Lock')
      expect(result.suggestion).toMatch(/Re-authenticate/i)
    })

    it('classifies timeout errors', () => {
      const result = classifyError('context deadline exceeded while dialing')
      expect(result.type).toBe('timeout')
      expect(result.icon).toBe('WifiOff')
    })

    it('classifies network errors', () => {
      const result = classifyError('dial tcp: lookup my-cluster.example.com failed: no such host')
      expect(result.type).toBe('network')
      expect(result.icon).toBe('XCircle')
    })

    it('classifies certificate errors', () => {
      const result = classifyError('x509: certificate signed by unknown authority')
      expect(result.type).toBe('certificate')
      expect(result.icon).toBe('ShieldAlert')
    })

    it('handles empty or undefined error messages safely', () => {
      const result = classifyError('')
      expect(result.type).toBe('unknown')
      expect(result.icon).toBe('AlertCircle')
    })

    it('truncates extremely long error messages', () => {
      const longMessage = 'A'.repeat(150)
      const result = classifyError(longMessage)
      expect(result.message.length).toBeLessThan(110)
      expect(result.message.endsWith('...')).toBe(true)
    })
  })

  describe('getErrorTypeFromString', () => {
    it('normalizes valid types', () => {
      expect(getErrorTypeFromString('NETWORK')).toBe('network')
      expect(getErrorTypeFromString('Auth')).toBe('auth')
    })

    it('falls back to unknown for invalid types', () => {
      expect(getErrorTypeFromString('database_crash')).toBe('unknown')
      expect(getErrorTypeFromString(undefined)).toBe('unknown')
    })
  })

  describe('UI Mapping Helpers', () => {
    it('maps icons correctly', () => {
      expect(getIconForErrorType('timeout')).toBe('WifiOff')
      expect(getIconForErrorType('unknown')).toBe('AlertCircle')
    })

    it('maps suggestions correctly', () => {
      expect(getSuggestionForErrorType('auth')).toMatch(/Re-authenticate/)
      expect(getSuggestionForErrorType('certificate')).toMatch(/certificate validity/)
    })
  })

  describe('formatLastSeen', () => {
    beforeEach(() => {
      // Lock Date.now() for stable time testing
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('formats times less than a minute as "just now"', () => {
      const timestamp = new Date('2026-05-15T11:59:30Z')
      expect(formatLastSeen(timestamp)).toBe('just now')
    })

    it('formats times in minutes', () => {
      const timestamp = new Date('2026-05-15T11:45:00Z')
      expect(formatLastSeen(timestamp)).toBe('15m ago')
    })

    it('formats times in hours', () => {
      const timestamp = new Date('2026-05-15T09:00:00Z')
      expect(formatLastSeen(timestamp)).toBe('3h ago')
    })

    it('formats times in days', () => {
      const timestamp = new Date('2026-05-12T12:00:00Z')
      expect(formatLastSeen(timestamp)).toBe('3d ago')
    })

    it('handles undefined and invalid dates', () => {
      expect(formatLastSeen(undefined)).toBe('never')
      expect(formatLastSeen('not-a-date')).toBe('never')
    })
  })
})
