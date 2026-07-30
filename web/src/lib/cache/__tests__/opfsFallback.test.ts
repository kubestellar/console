import { describe, it, expect, vi, afterEach } from 'vitest'
import { isExpectedOpfsFallback, logOpfsFallback } from '../opfsFallback'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('opfsFallback', () => {
  it('detects expected OPFS fallback errors', () => {
    const error = new Error('missing SharedArrayBuffer/Atomics support')
    expect(isExpectedOpfsFallback(error)).toBe(true)
    expect(isExpectedOpfsFallback({ message: 'Ignoring inability to install OPFS sqlite3_vfs' })).toBe(true)
    expect(isExpectedOpfsFallback(new Error('OPFS initialization failed — falling back to IndexedDB'))).toBe(true)
  })

  it('keeps unexpected cache failures noisy', () => {
    expect(isExpectedOpfsFallback(new Error('database schema migration failed'))).toBe(false)
  })

  it('logs expected fallback at debug level', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = new Error('OPFS not available — falling back to IndexedDB')

    logOpfsFallback('[Cache] fallback', error)

    expect(debugSpy).toHaveBeenCalledWith('[Cache] fallback', error)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('logs unexpected fallback errors at warn level', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = new Error('worker bundle failed to load')

    logOpfsFallback('[Cache] fallback', error)

    expect(warnSpy).toHaveBeenCalledWith('[Cache] fallback', error)
    expect(debugSpy).not.toHaveBeenCalled()
  })
})
