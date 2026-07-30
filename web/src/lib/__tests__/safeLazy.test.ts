/**
 * Unit tests for safeLazy — the retry/timeout-aware React.lazy() wrapper.
 *
 * Covers:
 * - Happy path: resolves named export correctly
 * - Missing export: throws descriptive error (stale chunk scenario)
 * - Null module: throws when import resolves to undefined
 * - Non-component export: throws when export is not a function/object
 * - Retry on error: retries with exponential backoff
 * - Retry exhaustion: re-throws after all retries fail
 * - Timeout: rejects if import hangs beyond the attempt timeout
 * - Console warning on retry
 *
 * Run:   npx vitest run src/lib/__tests__/safeLazy.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { safeLazy } from '../safeLazy'

/**
 * Helper to extract the internal factory function from a React.lazy component.
 * React.lazy stores it at _payload._result (React 18+).
 */
function getLoader(lazyComp: unknown): () => Promise<{ default: unknown }> {
  return (lazyComp as { _payload: { _result: () => Promise<{ default: unknown }> } })._payload._result
}

describe('safeLazy', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns a lazy component', () => {
    const LazyComp = safeLazy(
      () => Promise.resolve({ TestComp: () => null }),
      'TestComp',
    )
    expect(LazyComp).toBeDefined()
    expect(typeof LazyComp).toBe('object') // React.lazy returns an object
  })

  it('resolves a named export correctly', async () => {
    const FakeComponent = () => null
    const LazyComp = safeLazy(
      () => Promise.resolve({ MyComponent: FakeComponent }),
      'MyComponent',
    )

    const result = await getLoader(LazyComp)()
    expect(result.default).toBe(FakeComponent)
  })

  it('throws descriptive error when module is null', async () => {
    const LazyComp = safeLazy(
      () => Promise.resolve(null as unknown as Record<string, unknown>),
      'Foo',
    )

    const resultPromise = getLoader(LazyComp)()
    // Advance past retry delays (500ms + 1000ms) since safeLazy retries all errors
    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(1000)

    await expect(resultPromise).rejects.toThrow(/chunk may be stale/)
  })

  it('throws descriptive error when export is missing', async () => {
    const LazyComp = safeLazy(
      () => Promise.resolve({ OtherExport: () => null }),
      'MissingExport',
    )

    const resultPromise = getLoader(LazyComp)()
    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(1000)

    const err = await resultPromise.catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('MissingExport')
    expect((err as Error).message).toContain('chunk may be stale')
  })

  it('throws when the export is not a valid React component', async () => {
    const LazyComp = safeLazy(
      () => Promise.resolve({ BadExport: 42 }),
      'BadExport',
    )

    const resultPromise = getLoader(LazyComp)()
    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(1000)

    await expect(resultPromise).rejects.toThrow(
      /Export "BadExport" is not a React component/,
    )
  })

  it('retries on import error with exponential backoff', async () => {
    const FakeComponent = () => null
    const importFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValue({ MyComponent: FakeComponent })

    const LazyComp = safeLazy(importFn, 'MyComponent')
    const resultPromise = getLoader(LazyComp)()

    // First retry delay: 500ms (base * 2^0)
    await vi.advanceTimersByTimeAsync(500)
    // Second retry delay: 1000ms (base * 2^1)
    await vi.advanceTimersByTimeAsync(1000)

    const result = await resultPromise
    expect(result.default).toBe(FakeComponent)
    // Initial attempt + 2 retries = 3 calls
    expect(importFn).toHaveBeenCalledTimes(3)
  })

  it('re-throws after all retries are exhausted', async () => {
    const importFn = vi.fn().mockRejectedValue(new Error('Network failure'))

    const LazyComp = safeLazy(importFn, 'Component')
    const resultPromise = getLoader(LazyComp)()

    // Advance past retry delays (500ms + 1000ms)
    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(1000)

    await expect(resultPromise).rejects.toThrow('Network failure')
    // Initial attempt + 2 retries = 3 total calls
    expect(importFn).toHaveBeenCalledTimes(3)
  })

  // Regression for #6098: a hung dynamic import (e.g. during a backend
  // restart) must not leave the Suspense fallback stuck on a spinner.
  it('rejects when the dynamic import hangs past the per-attempt timeout', async () => {
    const importFn = vi.fn().mockImplementation(
      () => new Promise(() => { /* never resolves */ }),
    )

    const LazyComp = safeLazy(importFn, 'HungComponent')
    const resultPromise = getLoader(LazyComp)()

    // Advance past timeout (5s) + retry delays for each attempt
    // Attempt 1: 5s timeout → reject → 500ms delay
    await vi.advanceTimersByTimeAsync(5_000)
    await vi.advanceTimersByTimeAsync(500)
    // Attempt 2: 5s timeout → reject → 1000ms delay
    await vi.advanceTimersByTimeAsync(5_000)
    await vi.advanceTimersByTimeAsync(1_000)
    // Attempt 3: 5s timeout → reject (no more retries)
    await vi.advanceTimersByTimeAsync(5_000)

    await expect(resultPromise).rejects.toThrow(/timed out after 5000ms/)
  })

  it('logs a console.warn on each retry attempt', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const FakeComponent = () => null
    const importFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('chunk load error'))
      .mockResolvedValue({ MyComponent: FakeComponent })

    const LazyComp = safeLazy(importFn, 'MyComponent')
    const resultPromise = getLoader(LazyComp)()

    // Advance past first retry delay
    await vi.advanceTimersByTimeAsync(500)
    await resultPromise

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[safeLazy] Import failed for "MyComponent"'),
    )
  })
})
