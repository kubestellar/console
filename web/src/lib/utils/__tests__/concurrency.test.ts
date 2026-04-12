/**
 * Concurrent mutation safety tests for settledWithConcurrency.
 *
 * Verifies that the worker-pool implementation in concurrency.ts:
 * - Preserves result ordering regardless of task completion times
 * - Collects all results from a shared accumulator without data loss
 * - Isolates errors so one failing task does not corrupt others
 * - Respects the concurrency limit (never exceeds N simultaneous tasks)
 * - Handles edge cases (empty input, single task, all failures)
 */

import { describe, it, expect } from 'vitest'
import {
  settledWithConcurrency,
  mapSettledWithConcurrency,
  DEFAULT_CLUSTER_CONCURRENCY,
} from '../concurrency'

// ── Named constants (no magic numbers) ─────────────────────────────────────

/** Number of tasks for ordering / accumulation tests */
const TASK_COUNT = 20

/** Maximum simulated delay in ms for variable-duration tasks */
const MAX_SIMULATED_DELAY_MS = 50

/** Concurrency limit used in most tests */
const TEST_CONCURRENCY = 3

/** Concurrency limit of 1 forces sequential execution */
const SEQUENTIAL_CONCURRENCY = 1

/** Small delay to let the event loop tick between task starts */
const TICK_DELAY_MS = 5

/** Number of tasks for the concurrency-limit stress test */
const CONCURRENCY_STRESS_TASK_COUNT = 30

/** Expected default concurrency from the module */
const EXPECTED_DEFAULT_CONCURRENCY = 8

/** Sentinel value returned by successful tasks */
const SUCCESS_SENTINEL = 'ok'

/** Error message used by intentionally failing tasks */
const DELIBERATE_ERROR_MSG = 'deliberate failure'

/** Index of the task that fails in mixed-result tests */
const FAILING_TASK_INDEX = 2

/** Number of tasks in mixed-result tests (some succeed, one fails) */
const MIXED_TASK_COUNT = 5

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Create a task that resolves after `ms` milliseconds with `value`. */
function delayedTask<T>(value: T, ms: number): () => Promise<T> {
  return () => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))
}

/** Create a task that rejects after `ms` milliseconds with `reason`. */
function failingTask(reason: string, ms: number): () => Promise<never> {
  return () =>
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(reason)), ms))
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('settledWithConcurrency', () => {
  describe('result ordering', () => {
    it('results maintain correct index ordering with varying task durations', async () => {
      // Tasks complete in reverse order (last task finishes first)
      const tasks = Array.from({ length: TASK_COUNT }, (_, i) =>
        delayedTask(i, MAX_SIMULATED_DELAY_MS - i),
      )

      const results = await settledWithConcurrency(tasks, TEST_CONCURRENCY)

      expect(results).toHaveLength(TASK_COUNT)
      for (let i = 0; i < TASK_COUNT; i++) {
        expect(results[i].status).toBe('fulfilled')
        if (results[i].status === 'fulfilled') {
          expect((results[i] as PromiseSettledResult<number> & { status: 'fulfilled' }).value).toBe(i)
        }
      }
    })

    it('preserves order when concurrency equals task count (all concurrent)', async () => {
      const tasks = Array.from({ length: TASK_COUNT }, (_, i) =>
        delayedTask(`result-${i}`, Math.random() * MAX_SIMULATED_DELAY_MS),
      )

      const results = await settledWithConcurrency(tasks, TASK_COUNT)

      for (let i = 0; i < TASK_COUNT; i++) {
        expect(results[i].status).toBe('fulfilled')
        if (results[i].status === 'fulfilled') {
          expect(
            (results[i] as PromiseSettledResult<string> & { status: 'fulfilled' }).value,
          ).toBe(`result-${i}`)
        }
      }
    })
  })

  describe('shared accumulator integrity', () => {
    it('collects all results without data loss', async () => {
      const tasks = Array.from({ length: TASK_COUNT }, (_, i) =>
        delayedTask(i * i, TICK_DELAY_MS),
      )

      const results = await settledWithConcurrency(tasks, TEST_CONCURRENCY)

      expect(results).toHaveLength(TASK_COUNT)

      const values = results
        .filter((r): r is PromiseSettledResult<number> & { status: 'fulfilled' } => r.status === 'fulfilled')
        .map((r) => r.value)

      // Every expected value should be present exactly once
      for (let i = 0; i < TASK_COUNT; i++) {
        expect(values).toContain(i * i)
      }
      // No duplicates
      expect(new Set(values).size).toBe(TASK_COUNT)
    })

    it('accumulates results correctly with sequential concurrency (limit=1)', async () => {
      const tasks = Array.from({ length: TASK_COUNT }, (_, i) =>
        delayedTask(i, TICK_DELAY_MS),
      )

      const results = await settledWithConcurrency(tasks, SEQUENTIAL_CONCURRENCY)

      expect(results).toHaveLength(TASK_COUNT)
      for (let i = 0; i < TASK_COUNT; i++) {
        const r = results[i]
        expect(r.status).toBe('fulfilled')
        if (r.status === 'fulfilled') {
          expect((r as PromiseSettledResult<number> & { status: 'fulfilled' }).value).toBe(i)
        }
      }
    })
  })

  describe('error isolation', () => {
    it('error in one task does not corrupt results of other tasks', async () => {
      const tasks: Array<() => Promise<string>> = Array.from(
        { length: MIXED_TASK_COUNT },
        (_, i) =>
          i === FAILING_TASK_INDEX
            ? failingTask(DELIBERATE_ERROR_MSG, TICK_DELAY_MS)
            : delayedTask(`${SUCCESS_SENTINEL}-${i}`, TICK_DELAY_MS),
      )

      const results = await settledWithConcurrency(tasks, TEST_CONCURRENCY)

      expect(results).toHaveLength(MIXED_TASK_COUNT)

      // The failing task should be rejected
      expect(results[FAILING_TASK_INDEX].status).toBe('rejected')
      const rejected = results[FAILING_TASK_INDEX] as PromiseSettledResult<string> & { status: 'rejected' }
      expect(rejected.reason).toBeInstanceOf(Error)
      expect((rejected.reason as Error).message).toBe(DELIBERATE_ERROR_MSG)

      // All other tasks should be fulfilled with correct values
      for (let i = 0; i < MIXED_TASK_COUNT; i++) {
        if (i === FAILING_TASK_INDEX) continue
        expect(results[i].status).toBe('fulfilled')
        const fulfilled = results[i] as PromiseSettledResult<string> & { status: 'fulfilled' }
        expect(fulfilled.value).toBe(`${SUCCESS_SENTINEL}-${i}`)
      }
    })

    it('handles all tasks failing without throwing', async () => {
      const tasks = Array.from({ length: TEST_CONCURRENCY }, (_, i) =>
        failingTask(`error-${i}`, TICK_DELAY_MS),
      )

      const results = await settledWithConcurrency(tasks, TEST_CONCURRENCY)

      expect(results).toHaveLength(TEST_CONCURRENCY)
      for (const r of results) {
        expect(r.status).toBe('rejected')
      }
    })
  })

  describe('concurrency limit enforcement', () => {
    it('never exceeds the specified concurrency limit', async () => {
      let activeTasks = 0
      let peakConcurrency = 0

      const tasks = Array.from(
        { length: CONCURRENCY_STRESS_TASK_COUNT },
        () => async () => {
          activeTasks++
          if (activeTasks > peakConcurrency) {
            peakConcurrency = activeTasks
          }
          // Yield to the event loop so other workers can start
          await new Promise<void>((resolve) => setTimeout(resolve, TICK_DELAY_MS))
          activeTasks--
          return SUCCESS_SENTINEL
        },
      )

      const results = await settledWithConcurrency(tasks, TEST_CONCURRENCY)

      expect(peakConcurrency).toBeLessThanOrEqual(TEST_CONCURRENCY)
      expect(peakConcurrency).toBeGreaterThan(0)
      expect(results).toHaveLength(CONCURRENCY_STRESS_TASK_COUNT)
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
    })

    it('with concurrency=1, tasks run sequentially (peak=1)', async () => {
      let activeTasks = 0
      let peakConcurrency = 0

      const tasks = Array.from({ length: MIXED_TASK_COUNT }, () => async () => {
        activeTasks++
        if (activeTasks > peakConcurrency) {
          peakConcurrency = activeTasks
        }
        await new Promise<void>((resolve) => setTimeout(resolve, TICK_DELAY_MS))
        activeTasks--
        return SUCCESS_SENTINEL
      })

      await settledWithConcurrency(tasks, SEQUENTIAL_CONCURRENCY)

      expect(peakConcurrency).toBe(SEQUENTIAL_CONCURRENCY)
    })
  })

  describe('edge cases', () => {
    it('empty input array returns empty results', async () => {
      const results = await settledWithConcurrency([], TEST_CONCURRENCY)
      expect(results).toEqual([])
    })

    it('single task returns single result', async () => {
      const tasks = [delayedTask(SUCCESS_SENTINEL, TICK_DELAY_MS)]
      const results = await settledWithConcurrency(tasks, TEST_CONCURRENCY)

      expect(results).toHaveLength(1)
      expect(results[0].status).toBe('fulfilled')
      if (results[0].status === 'fulfilled') {
        expect(
          (results[0] as PromiseSettledResult<string> & { status: 'fulfilled' }).value,
        ).toBe(SUCCESS_SENTINEL)
      }
    })

    it('uses DEFAULT_CLUSTER_CONCURRENCY when no concurrency param given', () => {
      expect(DEFAULT_CLUSTER_CONCURRENCY).toBe(EXPECTED_DEFAULT_CONCURRENCY)
    })
  })

  describe('invalid concurrency inputs (#6851, #6852)', () => {
    it('concurrency=0 still processes all tasks', async () => {
      const tasks = Array.from({ length: MIXED_TASK_COUNT }, (_, i) =>
        delayedTask(i, TICK_DELAY_MS),
      )

      const results = await settledWithConcurrency(tasks, 0)

      expect(results).toHaveLength(MIXED_TASK_COUNT)
      for (let i = 0; i < MIXED_TASK_COUNT; i++) {
        expect(results[i].status).toBe('fulfilled')
        if (results[i].status === 'fulfilled') {
          expect(
            (results[i] as PromiseSettledResult<number> & { status: 'fulfilled' }).value,
          ).toBe(i)
        }
      }
    })

    it('negative concurrency still processes all tasks', async () => {
      const tasks = Array.from({ length: MIXED_TASK_COUNT }, (_, i) =>
        delayedTask(i, TICK_DELAY_MS),
      )

      const results = await settledWithConcurrency(tasks, -5)

      expect(results).toHaveLength(MIXED_TASK_COUNT)
      for (const r of results) {
        expect(r.status).toBe('fulfilled')
      }
    })

    it('NaN concurrency still processes all tasks', async () => {
      const tasks = Array.from({ length: MIXED_TASK_COUNT }, (_, i) =>
        delayedTask(i, TICK_DELAY_MS),
      )

      const results = await settledWithConcurrency(tasks, NaN)

      expect(results).toHaveLength(MIXED_TASK_COUNT)
      for (const r of results) {
        expect(r.status).toBe('fulfilled')
      }
    })

    it('Infinity concurrency still processes all tasks', async () => {
      const tasks = Array.from({ length: MIXED_TASK_COUNT }, (_, i) =>
        delayedTask(i, TICK_DELAY_MS),
      )

      const results = await settledWithConcurrency(tasks, Infinity)

      expect(results).toHaveLength(MIXED_TASK_COUNT)
      for (const r of results) {
        expect(r.status).toBe('fulfilled')
      }
    })

    it('fractional concurrency (0.5) is clamped to 1 and processes tasks', async () => {
      const tasks = Array.from({ length: MIXED_TASK_COUNT }, (_, i) =>
        delayedTask(i, TICK_DELAY_MS),
      )

      const results = await settledWithConcurrency(tasks, 0.5)

      expect(results).toHaveLength(MIXED_TASK_COUNT)
      for (const r of results) {
        expect(r.status).toBe('fulfilled')
      }
    })
  })
})

describe('mapSettledWithConcurrency', () => {
  it('maps items with correct index and preserves order', async () => {
    const items = Array.from({ length: TASK_COUNT }, (_, i) => i)

    const results = await mapSettledWithConcurrency(
      items,
      async (item, index) => {
        await new Promise<void>((resolve) => setTimeout(resolve, TICK_DELAY_MS))
        // Verify the index parameter matches the item position
        expect(index).toBe(item)
        return item * item
      },
      TEST_CONCURRENCY,
    )

    expect(results).toHaveLength(TASK_COUNT)
    for (let i = 0; i < TASK_COUNT; i++) {
      const r = results[i]
      expect(r.status).toBe('fulfilled')
      if (r.status === 'fulfilled') {
        expect((r as PromiseSettledResult<number> & { status: 'fulfilled' }).value).toBe(i * i)
      }
    }
  })

  it('isolates errors in map function the same as settledWithConcurrency', async () => {
    const items = Array.from({ length: MIXED_TASK_COUNT }, (_, i) => i)

    const results = await mapSettledWithConcurrency(
      items,
      async (item) => {
        if (item === FAILING_TASK_INDEX) {
          throw new Error(DELIBERATE_ERROR_MSG)
        }
        return `${SUCCESS_SENTINEL}-${item}`
      },
      TEST_CONCURRENCY,
    )

    expect(results[FAILING_TASK_INDEX].status).toBe('rejected')

    for (let i = 0; i < MIXED_TASK_COUNT; i++) {
      if (i === FAILING_TASK_INDEX) continue
      expect(results[i].status).toBe('fulfilled')
    }
  })
})
