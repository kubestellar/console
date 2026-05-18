/**
 * Tests for lib/errors/handleError.ts
 *
 * Covers getUserSafeErrorMessage and reportAppError — currently 0% coverage
 * as the module is not imported by any production or test file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getUserSafeErrorMessage, reportAppError } from '../handleError'

describe('getUserSafeErrorMessage', () => {
  it('returns error.message for Error instances', () => {
    const err = new Error('something broke')
    expect(getUserSafeErrorMessage(err)).toBe('something broke')
  })

  it('returns fallback for Error with empty message', () => {
    const err = new Error('')
    expect(getUserSafeErrorMessage(err)).toBe('Something went wrong.')
  })

  it('returns fallback for Error with whitespace-only message', () => {
    const err = new Error('   ')
    expect(getUserSafeErrorMessage(err)).toBe('Something went wrong.')
  })

  it('returns string value for non-empty string errors', () => {
    expect(getUserSafeErrorMessage('timeout')).toBe('timeout')
  })

  it('returns fallback for empty string errors', () => {
    expect(getUserSafeErrorMessage('')).toBe('Something went wrong.')
  })

  it('returns fallback for whitespace-only string', () => {
    expect(getUserSafeErrorMessage('  ')).toBe('Something went wrong.')
  })

  it('returns fallback for null', () => {
    expect(getUserSafeErrorMessage(null)).toBe('Something went wrong.')
  })

  it('returns fallback for undefined', () => {
    expect(getUserSafeErrorMessage(undefined)).toBe('Something went wrong.')
  })

  it('returns fallback for number', () => {
    expect(getUserSafeErrorMessage(42)).toBe('Something went wrong.')
  })

  it('returns fallback for plain object', () => {
    expect(getUserSafeErrorMessage({ code: 500 })).toBe('Something went wrong.')
  })

  it('uses custom fallbackMessage when provided', () => {
    expect(getUserSafeErrorMessage(null, 'Custom fallback')).toBe('Custom fallback')
  })

  it('custom fallback only applies when value is unusable', () => {
    expect(getUserSafeErrorMessage(new Error('real msg'), 'Custom fallback')).toBe('real msg')
  })
})

describe('reportAppError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls console.error by default', () => {
    reportAppError(new Error('boom'), { context: 'TestCtx' })
    expect(console.error).toHaveBeenCalledWith('TestCtx: boom')
  })

  it('calls console.warn when level is warn', () => {
    reportAppError('bad value', { context: 'WarnCtx', level: 'warn' })
    expect(console.warn).toHaveBeenCalledWith('WarnCtx: bad value')
    expect(console.error).not.toHaveBeenCalled()
  })

  it('calls console.error when level is error', () => {
    reportAppError('explicit error', { context: 'ErrCtx', level: 'error' })
    expect(console.error).toHaveBeenCalledWith('ErrCtx: explicit error')
  })

  it('returns the safe message string', () => {
    const result = reportAppError(new Error('returned'), { context: 'Ctx' })
    expect(result).toBe('returned')
  })

  it('returns fallbackMessage when error is unreadable', () => {
    const result = reportAppError(null, { context: 'Ctx', fallbackMessage: 'fallback msg' })
    expect(result).toBe('fallback msg')
  })

  it('uses default fallback "Unknown error" when none provided', () => {
    const result = reportAppError(null, { context: 'Ctx' })
    expect(result).toBe('Unknown error')
    expect(console.error).toHaveBeenCalledWith('Ctx: Unknown error')
  })

  it('formats message as "context: message"', () => {
    reportAppError('detail', { context: 'MyComponent' })
    expect(console.error).toHaveBeenCalledWith('MyComponent: detail')
  })
})
