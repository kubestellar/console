import { describe, it, expect } from 'vitest'
import { safeLazy } from '../safeLazy'

describe('safeLazy', () => {
  it('returns a lazy component', () => {
    const LazyComp = safeLazy(
      () => Promise.resolve({ TestComp: () => null }),
      'TestComp',
    )
    expect(LazyComp).toBeDefined()
    expect(typeof LazyComp).toBe('object') // React.lazy returns an object
  })

  it('throws descriptive error when module is null', async () => {
    const LazyComp = safeLazy(
      () => Promise.resolve(null as unknown as Record<string, unknown>),
      'Foo',
    )

    try {
      // Access the internal loader
      const loader = (LazyComp as unknown as { _init: unknown; _payload: { _result: () => Promise<unknown> } })._payload._result
      await loader()
      expect.fail('should have thrown')
    } catch (e: unknown) {
      expect((e as Error).message).toContain('chunk may be stale')
    }
  })

  it('throws descriptive error when export is missing', async () => {
    const LazyComp = safeLazy(
      () => Promise.resolve({ OtherExport: () => null }),
      'MissingExport',
    )

    try {
      const loader = (LazyComp as unknown as { _init: unknown; _payload: { _result: () => Promise<unknown> } })._payload._result
      await loader()
      expect.fail('should have thrown')
    } catch (e: unknown) {
      expect((e as Error).message).toContain('MissingExport')
      expect((e as Error).message).toContain('chunk may be stale')
    }
  })

  // Regression for #6098: a hung dynamic import (e.g. during a backend
  // restart) must not leave the Suspense fallback stuck on a spinner.
  // Each attempt must race against a timeout so the loader eventually
  // rejects and feeds into the retry + error-boundary recovery.
  it('rejects when the dynamic import hangs past the per-attempt timeout', async () => {
    const LazyComp = safeLazy(
      () => new Promise<{ HangingComp: () => null }>(() => {
        /* never resolves — simulates a hung chunk fetch */
      }),
      'HangingComp',
    )

    const loader = (LazyComp as unknown as { _init: unknown; _payload: { _result: () => Promise<unknown> } })._payload._result
    try {
      await loader()
      expect.fail('should have rejected due to timeout')
    } catch (e: unknown) {
      expect((e as Error).message).toContain('HangingComp')
      expect((e as Error).message).toMatch(/timed out|unreachable|restarting/i)
    }
  // Retries add delay between attempts on top of the per-attempt timeout,
  // so give the test plenty of headroom before vitest's default 5s cap.
  }, 60_000)
})
