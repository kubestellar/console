/**
 * Tests for lib/errorHandling.ts — unified error classification.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  classifyHttpStatus,
  classifyApiError,
  getUserMessage,
  isRetryable,
  type ApiErrorCategory,
} from '../errorHandling'

vi.mock('../errorClassifier', () => ({
  classifyError: (msg: string) => {
    if (/timeout/i.test(msg)) return { type: 'timeout', message: msg }
    if (/auth|401|403/i.test(msg)) return { type: 'auth', message: msg }
    if (/network|fetch/i.test(msg)) return { type: 'network', message: msg }
    if (/cert/i.test(msg)) return { type: 'certificate', message: msg }
    return { type: 'unknown', message: msg }
  },
}))

vi.mock('../clusterErrors', () => ({
  friendlyErrorMessage: (raw: string) => {
    if (/kubeconfig/i.test(raw)) return 'Check your kubeconfig file.'
    return raw
  },
}))

describe('classifyHttpStatus', () => {
  const cases: [number, ApiErrorCategory][] = [
    [401, 'auth'],
    [403, 'auth'],
    [404, 'not_found'],
    [408, 'timeout'],
    [429, 'rate_limited'],
    [502, 'service_unavailable'],
    [503, 'service_unavailable'],
    [504, 'timeout'],
  ]

  it.each(cases)('status %i → %s', (status, expected) => {
    expect(classifyHttpStatus(status)).toBe(expected)
  })

  it('returns unknown for unmapped status 500', () => {
    expect(classifyHttpStatus(500)).toBe('unknown')
  })

  it('returns unknown for unmapped status 200', () => {
    expect(classifyHttpStatus(200)).toBe('unknown')
  })
})

describe('classifyApiError — numeric HTTP status', () => {
  it('classifies 401 as auth, not retryable', () => {
    const result = classifyApiError(401)
    expect(result.category).toBe('auth')
    expect(result.message).toBe('HTTP 401')
    expect(result.retryable).toBe(false)
  })

  it('classifies 503 as service_unavailable, retryable', () => {
    const result = classifyApiError(503)
    expect(result.category).toBe('service_unavailable')
    expect(result.retryable).toBe(true)
  })

  it('classifies 429 as rate_limited, retryable', () => {
    const result = classifyApiError(429)
    expect(result.category).toBe('rate_limited')
    expect(result.retryable).toBe(true)
  })

  it('classifies 404 as not_found, not retryable', () => {
    const result = classifyApiError(404)
    expect(result.category).toBe('not_found')
    expect(result.retryable).toBe(false)
  })

  it('sets userMessage from USER_MESSAGES map', () => {
    const result = classifyApiError(408)
    expect(result.userMessage).toContain('timed out')
  })
})

describe('classifyApiError — fetch network errors (string)', () => {
  const networkMessages = [
    'Failed to fetch',
    'Load failed',
    'NetworkError when attempting to fetch resource',
    'Network request failed',
    'net::ERR_CONNECTION_REFUSED',
    'ERR_INTERNET_DISCONNECTED',
    'ERR_NAME_NOT_RESOLVED',
  ]

  it.each(networkMessages)('"%s" → network, retryable', (msg) => {
    const result = classifyApiError(msg)
    expect(result.category).toBe('network')
    expect(result.retryable).toBe(true)
    expect(result.userMessage).toContain('network')
  })
})

describe('classifyApiError — service unavailable patterns (string)', () => {
  const serviceMessages = [
    '503 error',
    'service unavailable',
    'Server is shutting down',
    'Backend unavailable',
    'temporarily unavailable',
    'ECONNREFUSED',
  ]

  it.each(serviceMessages)('"%s" → service_unavailable, retryable', (msg) => {
    const result = classifyApiError(msg)
    expect(result.category).toBe('service_unavailable')
    expect(result.retryable).toBe(true)
  })
})

describe('classifyApiError — Error object', () => {
  it('extracts message from Error instance', () => {
    const err = new Error('Failed to fetch')
    const result = classifyApiError(err)
    expect(result.category).toBe('network')
    expect(result.message).toBe('Failed to fetch')
  })

  it('uses friendlyErrorMessage when it differs from raw', () => {
    const err = new Error('invalid kubeconfig file')
    const result = classifyApiError(err)
    expect(result.userMessage).toBe('Check your kubeconfig file.')
  })

  it('falls through to USER_MESSAGES when friendlyErrorMessage returns raw', () => {
    const err = new Error('something totally unknown')
    const result = classifyApiError(err)
    // friendlyErrorMessage returns raw → userMessage comes from USER_MESSAGES
    expect(result.userMessage).toContain('unexpected')
  })
})

describe('getUserMessage', () => {
  const categories: ApiErrorCategory[] = [
    'network', 'auth', 'timeout', 'service_unavailable',
    'not_found', 'rate_limited', 'certificate', 'unknown',
  ]

  it.each(categories)('returns non-empty string for category %s', (cat) => {
    const msg = getUserMessage(cat)
    expect(typeof msg).toBe('string')
    expect(msg.length).toBeGreaterThan(0)
  })
})

describe('isRetryable', () => {
  it.each(['network', 'timeout', 'service_unavailable', 'rate_limited'] as ApiErrorCategory[])(
    '%s is retryable',
    (cat) => expect(isRetryable(cat)).toBe(true),
  )

  it.each(['auth', 'not_found', 'certificate', 'unknown'] as ApiErrorCategory[])(
    '%s is not retryable',
    (cat) => expect(isRetryable(cat)).toBe(false),
  )
})
