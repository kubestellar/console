import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTimerScope, getDynamicScope } from '../scope'

describe('createTimerScope', () => {
  let scope: ReturnType<typeof createTimerScope>

  beforeEach(() => {
    vi.useFakeTimers()
    scope = createTimerScope()
  })

  afterEach(() => {
    scope.clearAll()
    vi.useRealTimers()
  })

  it('safeSetTimeout works with function callbacks', () => {
    const fn = vi.fn()
    scope.safeSetTimeout(fn, 100)
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('safeSetTimeout rejects string callbacks', () => {
    expect(() => scope.safeSetTimeout('console.log("evil")' as unknown, 100)).toThrow(TypeError)
  })

  it('safeClearTimeout clears a timeout', () => {
    const fn = vi.fn()
    const id = scope.safeSetTimeout(fn, 100)
    scope.safeClearTimeout(id)
    vi.advanceTimersByTime(200)
    expect(fn).not.toHaveBeenCalled()
  })

  it('safeSetInterval works with function callbacks', () => {
    const fn = vi.fn()
    scope.safeSetInterval(fn, 2000)
    vi.advanceTimersByTime(6000)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('safeSetInterval rejects string callbacks', () => {
    expect(() => scope.safeSetInterval('alert()' as unknown, 1000)).toThrow(TypeError)
  })

  it('safeSetInterval clamps delay to minimum 1000ms', () => {
    const fn = vi.fn()
    scope.safeSetInterval(fn, 100) // should be clamped to 1000ms
    vi.advanceTimersByTime(500)
    expect(fn).not.toHaveBeenCalled() // Not called at 500ms
    vi.advanceTimersByTime(600)
    expect(fn).toHaveBeenCalledOnce() // Called at 1000ms
  })

  it('clearAll clears all timers', () => {
    const fn1 = vi.fn()
    const fn2 = vi.fn()
    scope.safeSetTimeout(fn1, 100)
    scope.safeSetInterval(fn2, 2000)
    scope.clearAll()
    vi.advanceTimersByTime(5000)
    expect(fn1).not.toHaveBeenCalled()
    expect(fn2).not.toHaveBeenCalled()
  })

  it('throws when timer limit exceeded', () => {
    const MAX_TIMERS = 20
    for (let i = 0; i < MAX_TIMERS; i++) {
      scope.safeSetTimeout(() => {}, 999999)
    }
    expect(() => scope.safeSetTimeout(() => {}, 100)).toThrow('Timer limit exceeded')
  })

  it('handles NaN delay by sanitizing to 0', () => {
    const fn = vi.fn()
    scope.safeSetTimeout(fn, NaN)
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('safeClearTimeout handles undefined', () => {
    expect(() => scope.safeClearTimeout(undefined)).not.toThrow()
  })

  it('safeSetInterval throws when timer limit is exceeded', () => {
    const MAX_TIMERS = 20
    for (let i = 0; i < MAX_TIMERS; i++) {
      scope.safeSetTimeout(() => {}, 999999)
    }
    expect(() => scope.safeSetInterval(() => {}, 1000)).toThrow('Timer limit exceeded')
  })

  it('safeSetInterval swallows errors thrown by the callback', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    scope.safeSetInterval(() => { throw new Error('interval bomb') }, 1000)
    vi.advanceTimersByTime(1000)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DynamicCard]'),
      expect.any(Error)
    )
    consoleErrorSpy.mockRestore()
  })
})

describe('getDynamicScope', () => {
  it('returns scope with React', () => {
    const scope = getDynamicScope()
    expect(scope.React).toBeDefined()
    expect(scope.useState).toBeDefined()
    expect(scope.useEffect).toBeDefined()
    expect(scope.useMemo).toBeDefined()
    expect(scope.useCallback).toBeDefined()
    expect(scope.useRef).toBeDefined()
  })

  it('provides cn utility', () => {
    const scope = getDynamicScope()
    expect(typeof scope.cn).toBe('function')
  })

  it('provides timer functions', () => {
    const scope = getDynamicScope()
    expect(typeof scope.setTimeout).toBe('function')
    expect(typeof scope.clearTimeout).toBe('function')
    expect(typeof scope.setInterval).toBe('function')
    expect(typeof scope.clearInterval).toBe('function')
  })

  it('provides cleanup function', () => {
    const scope = getDynamicScope()
    expect(typeof scope.__timerCleanup).toBe('function')
  })

  it('provides Spinner and SpinWrapper', () => {
    const scope = getDynamicScope()
    expect(typeof scope.Spinner).toBe('function')
    expect(typeof scope.SpinWrapper).toBe('function')
  })

  it('__timerCleanup runs without error', () => {
    const scope = getDynamicScope()
    // Should not throw even when called with no active timers or fetches
    expect(() => scope.__timerCleanup()).not.toThrow()
  })
})
