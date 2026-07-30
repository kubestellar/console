import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  registerDemoData,
  registerDemoDataBatch,
  unregisterDemoData,
  hasDemoData,
  getDemoDataEntry,
  getAllDemoDataEntries,
  getDemoDataByCategory,
  generateDemoData,
  generateDemoDataSync,
  clearDemoDataCache,
  subscribeToRegistry,
  getRegistryStats,
} from '../demoDataRegistry'
import type { DemoDataEntry } from '../types'

const makeEntry = (id: string, category = 'test'): DemoDataEntry => ({
  id,
  category: category as DemoDataEntry['category'],
  config: {
    generate: () => ({ items: [1, 2, 3] }),
  },
})

describe('registerDemoData', () => {
  beforeEach(() => {
    // Clean up test entries
    unregisterDemoData('test-1')
    unregisterDemoData('test-2')
    unregisterDemoData('test-3')
  })

  it('registers and retrieves an entry', () => {
    registerDemoData(makeEntry('test-1'))
    expect(hasDemoData('test-1')).toBe(true)
    expect(getDemoDataEntry('test-1')).toBeDefined()
  })

  it('hasDemoData returns false for unregistered', () => {
    expect(hasDemoData('nonexistent')).toBe(false)
  })

  it('getDemoDataEntry returns undefined for unregistered', () => {
    expect(getDemoDataEntry('nonexistent')).toBeUndefined()
  })
})

describe('registerDemoDataBatch', () => {
  beforeEach(() => {
    unregisterDemoData('batch-1')
    unregisterDemoData('batch-2')
  })

  it('registers multiple entries', () => {
    registerDemoDataBatch([makeEntry('batch-1'), makeEntry('batch-2')])
    expect(hasDemoData('batch-1')).toBe(true)
    expect(hasDemoData('batch-2')).toBe(true)
  })
})

describe('unregisterDemoData', () => {
  it('removes an entry', () => {
    registerDemoData(makeEntry('test-remove'))
    unregisterDemoData('test-remove')
    expect(hasDemoData('test-remove')).toBe(false)
  })
})

describe('getAllDemoDataEntries', () => {
  it('returns an array', () => {
    const entries = getAllDemoDataEntries()
    expect(Array.isArray(entries)).toBe(true)
  })
})

describe('getDemoDataByCategory', () => {
  beforeEach(() => {
    unregisterDemoData('cat-test')
  })

  it('filters by category', () => {
    registerDemoData(makeEntry('cat-test', 'clusters'))
    const results = getDemoDataByCategory('clusters')
    expect(results.some(e => e.id === 'cat-test')).toBe(true)
  })
})

describe('generateDemoData', () => {
  beforeEach(() => {
    clearDemoDataCache()
    unregisterDemoData('gen-test')
  })

  it('returns error state for unregistered ID', async () => {
    const state = await generateDemoData('unknown-id-xyz')
    expect(state.isDemoData).toBe(true)
    expect(state.error).toBeDefined()
  })

  it('generates data for registered entry', async () => {
    registerDemoData(makeEntry('gen-test'))
    const state = await generateDemoData('gen-test')
    expect(state.data).toEqual({ items: [1, 2, 3] })
    expect(state.isDemoData).toBe(true)
    expect(state.isLoading).toBe(false)
  })

  it('uses cache on second call', async () => {
    const entry = makeEntry('gen-test')
    const genSpy = vi.fn().mockReturnValue({ x: 1 })
    entry.config.generate = genSpy
    registerDemoData(entry)

    await generateDemoData('gen-test')
    await generateDemoData('gen-test')
    expect(genSpy).toHaveBeenCalledTimes(1) // cached
  })

  it('bypasses cache with forceRegenerate', async () => {
    const entry = makeEntry('gen-test')
    const genSpy = vi.fn().mockReturnValue({ x: 1 })
    entry.config.generate = genSpy
    registerDemoData(entry)

    await generateDemoData('gen-test')
    await generateDemoData('gen-test', true)
    expect(genSpy).toHaveBeenCalledTimes(2)
  })

  it('handles generator errors', async () => {
    const entry = makeEntry('gen-test')
    entry.config.generate = () => { throw new Error('gen fail') }
    registerDemoData(entry)

    const state = await generateDemoData('gen-test')
    expect(state.error?.message).toBe('gen fail')
  })
})

describe('generateDemoDataSync', () => {
  beforeEach(() => {
    clearDemoDataCache()
    unregisterDemoData('sync-test')
  })

  it('returns error for unregistered ID', () => {
    const state = generateDemoDataSync('unknown-sync')
    expect(state.error).toBeDefined()
  })

  it('generates data synchronously', () => {
    registerDemoData(makeEntry('sync-test'))
    const state = generateDemoDataSync('sync-test')
    expect(state.data).toEqual({ items: [1, 2, 3] })
  })

  it('handles errors', () => {
    const entry = makeEntry('sync-test')
    entry.config.generate = () => { throw new Error('sync fail') }
    registerDemoData(entry)

    const state = generateDemoDataSync('sync-test')
    expect(state.error?.message).toBe('sync fail')
  })
})

describe('clearDemoDataCache', () => {
  it('clears specific entry', async () => {
    registerDemoData(makeEntry('cache-test'))
    await generateDemoData('cache-test')
    clearDemoDataCache('cache-test')
    // After clearing, next call will regenerate
  })

  it('clears all entries', () => {
    clearDemoDataCache()
    // Should not throw
  })
})

describe('subscribeToRegistry', () => {
  it('notifies on registration', () => {
    const listener = vi.fn()
    const unsub = subscribeToRegistry(listener)

    registerDemoData(makeEntry('sub-test'))
    expect(listener).toHaveBeenCalled()

    unsub()
    unregisterDemoData('sub-test')
  })

  it('unsubscribes correctly', () => {
    const listener = vi.fn()
    const unsub = subscribeToRegistry(listener)
    unsub()

    listener.mockClear()
    registerDemoData(makeEntry('sub-test-2'))
    expect(listener).not.toHaveBeenCalled()
    unregisterDemoData('sub-test-2')
  })
})

describe('getRegistryStats', () => {
  it('returns stats object', () => {
    const stats = getRegistryStats()
    expect(typeof stats.total).toBe('number')
    expect(typeof stats.byCategory).toBe('object')
  })
})
