/**
 * Marks a promise as "observed" so it does not trigger an unhandled-rejection
 * warning when it settles during fake-timer advancement, while still returning
 * the same promise so callers can assert on it later (e.g. via
 * `expect(promise).rejects.toThrow(...)`).
 *
 * ## Why this exists
 *
 * Vitest tests that use `vi.useFakeTimers()` frequently need to advance timers
 * (via `vi.runAllTimersAsync()`, `vi.advanceTimersByTimeAsync()`, or a
 * `flushRetries()`-style helper) **before** attaching a rejection assertion
 * like `await expect(promise).rejects.toThrow(...)`. Node's unhandled-rejection
 * tracking checks at each tick boundary, so a promise that rejects during
 * timer advancement but isn't "observed" until several ticks later gets
 * flagged as an unhandled rejection — a false positive, because the real
 * assertion further down always awaits it.
 *
 * Attaching a no-op `.catch` synchronously at creation time marks the promise
 * as handled without affecting the later assertion (multiple `.catch`/`.then`
 * handlers may be attached to the same promise).
 *
 * ## Usage
 *
 * ```ts
 * import { expectEventualRejection } from '@/test-utils/expectEventualRejection'
 *
 * const resultPromise = expectEventualRejection(loader())
 * await vi.runAllTimersAsync()
 * await expect(resultPromise).rejects.toThrow('boom')
 * ```
 *
 * ## History
 *
 * First introduced inline in `src/lib/__tests__/safeLazy.test.ts` (PR #22024,
 * fixing #22004). Rediscovered independently in
 * `netlify/functions/__tests__/fetch-with-retry.test.ts` (PR #22320) — the
 * second rediscovery motivated extracting it into this shared helper so new
 * fake-timer tests can import it directly instead of re-implementing the
 * `.catch(() => {})` guard. See #22327.
 */
export function expectEventualRejection<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => {
    /* observed above; real assertion happens later */
  })
  return promise
}
