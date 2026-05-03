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

/**
 * Default maximum number of concurrent requests across clusters.
 *
 * Browsers limit HTTP/1.1 connections to ~6 per origin. Setting this
 * higher than 4 causes cluster fetches to exhaust the connection pool,
 * blocking lazy chunk downloads, navigation, and SSE streams.
 * Keep at 4 to leave headroom for page navigation and static assets.
 */
export const DEFAULT_CLUSTER_CONCURRENCY = 4

/** Minimum allowed concurrency — at least one worker must run (#6851). */
const MIN_CONCURRENCY = 1

/** Callback invoked each time a task settles, enabling progressive rendering */
export type OnTaskSettled<T> = (result: PromiseSettledResult<T>, index: number) => void

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
 * @param onSettled - Optional callback invoked each time a single task
 *   settles (fulfilled or rejected). This enables progressive rendering:
 *   callers can push partial results to the UI as each cluster responds
 *   instead of waiting for all clusters (including unreachable ones with
 *   long timeouts) to complete.
 * @returns PromiseSettledResult array in the same order as `tasks`
 */
export async function settledWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number = DEFAULT_CLUSTER_CONCURRENCY,
  onSettled?: OnTaskSettled<T>,
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
        } catch (reason: unknown) {
          results[idx] = { status: 'rejected', reason }
        }
        // Notify caller immediately so the UI can render partial data
        // while remaining tasks (especially unreachable cluster timeouts)
        // are still in-flight.
        onSettled?.(results[idx], idx)
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
  onSettled?: OnTaskSettled<TResult>,
): Promise<PromiseSettledResult<TResult>[]> {
  return settledWithConcurrency(
    items.map((item, index) => () => fn(item, index)),
    concurrency,
    onSettled,
  )
}
