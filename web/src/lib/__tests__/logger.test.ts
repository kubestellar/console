/**
 * Coverage for lib/logger.ts
 *
 * logger is a thin conditional wrapper around console methods.
 * In test environments import.meta.env.DEV is false, so log/debug
 * are no-ops — warn and error always fire.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

import { logger } from '../logger'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('logger.warn', () => {
  it('calls console.warn with all arguments', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logger.warn('something happened', { detail: 42 })
    expect(spy).toHaveBeenCalledWith('something happened', { detail: 42 })
  })

  it('passes multiple arguments through', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logger.warn('a', 'b', 'c')
    expect(spy).toHaveBeenCalledWith('a', 'b', 'c')
  })
})

describe('logger.error', () => {
  it('calls console.error with all arguments', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('boom')
    logger.error('caught error:', err)
    expect(spy).toHaveBeenCalledWith('caught error:', err)
  })

  it('passes multiple arguments through', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('x', 'y', 123)
    expect(spy).toHaveBeenCalledWith('x', 'y', 123)
  })
})

describe('logger.log in test env (DEV=false)', () => {
  it('does not call console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.log('should be silent')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('logger.debug in test env (DEV=false)', () => {
  it('does not call console.debug', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    logger.debug('should be silent')
    expect(spy).not.toHaveBeenCalled()
  })
})
