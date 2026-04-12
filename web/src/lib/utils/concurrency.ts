/**
 * Concurrency-limited replacement for Promise.allSettled.
 *
 * In multi-cluster environments (50–150 clusters) the browser limits
 * concurrent connections per origin (~6 in most browsers).  Firing all
 * fetches at once causes heavy request queuing, degraded performance,
 * and potential HTTP 429 (rate-limit) errors from backends.
 *
 * This module provides a drop-in concurrency limiter that caps the
 * number of in-flight promises so the browser connection pool is not
 * overwhelmed.
 */

/** Default maximum number of concurrent requests across clusters */
export const DEFAULT_CLUSTER_CONCURRENCY = 8

/** Minimum allowed concurrency — at least one worker must run (#6851). */
const MIN_CONCURRENCY = 1

/**
 * Execute an array of async tasks with bounded concurrency, returning
 * results in the same format as `Promise.allSettled`.
 *
 * Uses a worker-pool pattern: `concurrency` workers pull from a shared
 * queue, so fast-completing tasks do not leave workers idle.
 *
 * @param tasks   - Array of zero-arg async functions to execute
 * @param concurrency - Max tasks running at one time (default 8).
 *   Values less than 1, NaN, or non-finite are clamped to 1 (#6851).
 * @returns PromiseSettledResult array in the same order as `tasks`
 */
export async function settledWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number = DEFAULT_CLUSTER_CONCURRENCY,
): Promise<PromiseSettledResult<T>[]> {
  if (tasks.length === 0) return []

  // Clamp invalid concurrency to a safe minimum so workers are always
  // created and every task slot is populated (#6851).
  const safeConcurrency = Number.isFinite(concurrency) && concurrency >= MIN_CONCURRENCY
    ? Math.floor(concurrency)
    : MIN_CONCURRENCY

  const results: PromiseSettledResult<T>[] = new Array(tasks.length)
  let cursor = 0

  const workers = Array.from(
    { length: Math.min(safeConcurrency, tasks.length) },
    async () => {
      while (cursor < tasks.length) {
        const idx = cursor++
        try {
          const value = await tasks[idx]()
          results[idx] = { status: 'fulfilled', value }
        } catch (reason) {
          results[idx] = { status: 'rejected', reason }
        }
      }
    },
  )

  await Promise.all(workers)
  return results
}

/**
 * Convenience wrapper: run `fn` over each item in `items` with bounded
 * concurrency, settling all results.
 *
 * Equivalent to `Promise.allSettled(items.map(fn))` but with a cap on
 * the number of concurrent invocations.
 */
export async function mapSettledWithConcurrency<TItem, TResult>(
  items: TItem[],
  fn: (item: TItem, index: number) => Promise<TResult>,
  concurrency: number = DEFAULT_CLUSTER_CONCURRENCY,
): Promise<PromiseSettledResult<TResult>[]> {
  return settledWithConcurrency(
    items.map((item, index) => () => fn(item, index)),
    concurrency,
  )
}
