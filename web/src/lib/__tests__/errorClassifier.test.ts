import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  classifyError,
  getErrorTypeFromString,
  getIconForErrorType,
  getSuggestionForErrorType,
  formatLastSeen,
} from '../errorClassifier'

describe('classifyError', () => {
  it('returns unknown for empty message', () => {
    const result = classifyError('')
    expect(result.type).toBe('unknown')
    expect(result.icon).toBe('AlertCircle')
  })

  it('classifies timeout errors', () => {
    expect(classifyError('connection timed out').type).toBe('timeout')
    expect(classifyError('context deadline exceeded').type).toBe('timeout')
    expect(classifyError('i/o timeout').type).toBe('timeout')
    expect(classifyError('request timeout').type).toBe('timeout')
  })

  it('classifies auth errors', () => {
    expect(classifyError('401 unauthorized').type).toBe('auth')
    expect(classifyError('403 forbidden').type).toBe('auth')
    expect(classifyError('token expired').type).toBe('auth')
    expect(classifyError('access denied').type).toBe('auth')
  })

  it('classifies network errors', () => {
    expect(classifyError('connection refused').type).toBe('network')
    expect(classifyError('no such host').type).toBe('network')
    expect(classifyError('dial tcp failed').type).toBe('network')
    expect(classifyError('DNS resolution failed').type).toBe('network')
  })

  it('classifies certificate errors', () => {
    expect(classifyError('x509: certificate has expired').type).toBe('certificate')
    expect(classifyError('TLS handshake error').type).toBe('certificate')
    expect(classifyError('SSL connection error').type).toBe('certificate')
  })

  it('returns unknown for unrecognized errors', () => {
    const result = classifyError('something completely different')
    expect(result.type).toBe('unknown')
    expect(result.suggestion).toBe('Check cluster connectivity and configuration')
  })

  it('truncates long messages', () => {
    const longMessage = 'x'.repeat(200)
    const result = classifyError(longMessage)
    expect(result.message.length).toBeLessThanOrEqual(100)
    expect(result.message.endsWith('...')).toBe(true)
  })

  it('preserves short messages', () => {
    const result = classifyError('connection refused')
    expect(result.message).toBe('connection refused')
  })

  it('returns correct icon for timeout', () => {
    expect(classifyError('timed out').icon).toBe('WifiOff')
  })

  it('returns correct icon for auth', () => {
    expect(classifyError('unauthorized').icon).toBe('Lock')
  })
})

describe('getErrorTypeFromString', () => {
  it('returns matching type for known strings', () => {
    expect(getErrorTypeFromString('timeout')).toBe('timeout')
    expect(getErrorTypeFromString('auth')).toBe('auth')
    expect(getErrorTypeFromString('network')).toBe('network')
    expect(getErrorTypeFromString('certificate')).toBe('certificate')
  })

  it('normalizes case', () => {
    expect(getErrorTypeFromString('TIMEOUT')).toBe('timeout')
    expect(getErrorTypeFromString('Auth')).toBe('auth')
  })

  it('returns unknown for unrecognized strings', () => {
    expect(getErrorTypeFromString('something')).toBe('unknown')
  })

  it('returns unknown for undefined', () => {
    expect(getErrorTypeFromString(undefined)).toBe('unknown')
  })
})

describe('getIconForErrorType', () => {
  it('returns correct icons for all error types', () => {
    expect(getIconForErrorType('timeout')).toBe('WifiOff')
    expect(getIconForErrorType('auth')).toBe('Lock')
    expect(getIconForErrorType('network')).toBe('XCircle')
    expect(getIconForErrorType('certificate')).toBe('ShieldAlert')
    expect(getIconForErrorType('unknown')).toBe('AlertCircle')
  })
})

describe('getSuggestionForErrorType', () => {
  it('returns suggestions for all error types', () => {
    expect(getSuggestionForErrorType('timeout')).toContain('VPN')
    expect(getSuggestionForErrorType('auth')).toContain('authenticate')
    expect(getSuggestionForErrorType('network')).toContain('firewall')
    expect(getSuggestionForErrorType('certificate')).toContain('certificate')
    expect(getSuggestionForErrorType('unknown')).toContain('connectivity')
  })
})

describe('formatLastSeen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-31T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns never for undefined', () => {
    expect(formatLastSeen(undefined)).toBe('never')
  })

  it('returns never for invalid date string', () => {
    expect(formatLastSeen('not-a-date')).toBe('never')
  })

  it('returns just now for recent timestamps', () => {
    expect(formatLastSeen('2026-03-31T11:59:30Z')).toBe('just now')
  })

  it('returns 1m ago', () => {
    expect(formatLastSeen('2026-03-31T11:58:30Z')).toBe('1m ago')
  })

  it('returns minutes ago', () => {
    expect(formatLastSeen('2026-03-31T11:55:00Z')).toBe('5m ago')
  })

  it('returns 1h ago', () => {
    expect(formatLastSeen('2026-03-31T10:30:00Z')).toBe('1h ago')
  })

  it('returns hours ago', () => {
    expect(formatLastSeen('2026-03-31T06:00:00Z')).toBe('6h ago')
  })

  it('returns 1d ago', () => {
    expect(formatLastSeen('2026-03-30T06:00:00Z')).toBe('1d ago')
  })

  it('returns days ago', () => {
    expect(formatLastSeen('2026-03-26T12:00:00Z')).toBe('5d ago')
  })

  it('accepts Date objects', () => {
    expect(formatLastSeen(new Date('2026-03-31T11:55:00Z'))).toBe('5m ago')
  })
})
