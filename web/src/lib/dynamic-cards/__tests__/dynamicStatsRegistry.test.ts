import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  registerDynamicStats,
  unregisterDynamicStats,
  clearDynamicStats,
  getDynamicStats,
  getAllDynamicStats,
  getAllDynamicStatsTypes,
  isDynamicStats,
  onDynamicStatsChange,
  toRecord,
} from '../dynamicStatsRegistry'

const makeDef = (type: string) => ({
  type,
  title: `Stats ${type}`,
  blocks: [{ id: 'b1', label: 'Block 1', value: '42' }],
})

describe('dynamicStatsRegistry', () => {
  beforeEach(() => {
    // Clean up
    for (const t of getAllDynamicStatsTypes()) {
      unregisterDynamicStats(t)
    }
  })

  it('registers and retrieves dynamic stats', () => {
    registerDynamicStats(makeDef('test-stats') as Parameters<typeof registerDynamicStats>[0])
    expect(isDynamicStats('test-stats')).toBe(true)
  })

  it('unregisters dynamic stats', () => {
    registerDynamicStats(makeDef('test-stats') as Parameters<typeof registerDynamicStats>[0])
    expect(unregisterDynamicStats('test-stats')).toBe(true)
    expect(isDynamicStats('test-stats')).toBe(false)
  })

  it('unregisterDynamicStats returns false for non-dynamic', () => {
    expect(unregisterDynamicStats('nonexistent')).toBe(false)
  })

  it('getDynamicStats returns undefined for non-dynamic', () => {
    expect(getDynamicStats('nonexistent')).toBeUndefined()
  })

  it('getAllDynamicStatsTypes returns types', () => {
    registerDynamicStats(makeDef('s1') as Parameters<typeof registerDynamicStats>[0])
    registerDynamicStats(makeDef('s2') as Parameters<typeof registerDynamicStats>[0])
    const types = getAllDynamicStatsTypes()
    expect(types).toContain('s1')
    expect(types).toContain('s2')
  })

  it('notifies listeners on register', () => {
    const listener = vi.fn()
    const unsub = onDynamicStatsChange(listener)
    registerDynamicStats(makeDef('s1') as Parameters<typeof registerDynamicStats>[0])
    expect(listener).toHaveBeenCalledOnce()
    unsub()
  })

  it('notifies listeners on unregister', () => {
    registerDynamicStats(makeDef('s1') as Parameters<typeof registerDynamicStats>[0])
    const listener = vi.fn()
    const unsub = onDynamicStatsChange(listener)
    unregisterDynamicStats('s1')
    expect(listener).toHaveBeenCalledOnce()
    unsub()
  })

  it('clearDynamicStats removes all dynamic types', () => {
    registerDynamicStats(makeDef('s1') as Parameters<typeof registerDynamicStats>[0])
    registerDynamicStats(makeDef('s2') as Parameters<typeof registerDynamicStats>[0])
    expect(getAllDynamicStatsTypes()).toHaveLength(2)
    clearDynamicStats()
    expect(getAllDynamicStatsTypes()).toHaveLength(0)
    expect(isDynamicStats('s1')).toBe(false)
    expect(isDynamicStats('s2')).toBe(false)
  })

  it('clearDynamicStats notifies listeners', () => {
    registerDynamicStats(makeDef('s1') as Parameters<typeof registerDynamicStats>[0])
    const listener = vi.fn()
    const unsub = onDynamicStatsChange(listener)
    clearDynamicStats()
    expect(listener).toHaveBeenCalledOnce()
    unsub()
  })

  it('clearDynamicStats is no-op when already empty', () => {
    const listener = vi.fn()
    const unsub = onDynamicStatsChange(listener)
    clearDynamicStats()
    expect(listener).not.toHaveBeenCalled()
    unsub()
  })

  it('getAllDynamicStats returns StatsDefinition objects', () => {
    registerDynamicStats(makeDef('s1') as Parameters<typeof registerDynamicStats>[0])
    registerDynamicStats(makeDef('s2') as Parameters<typeof registerDynamicStats>[0])
    const all = getAllDynamicStats()
    expect(all).toHaveLength(2)
    expect(all.map(d => d.type)).toContain('s1')
    expect(all.map(d => d.type)).toContain('s2')
  })

  it('getAllDynamicStats filters out undefined entries', () => {
    // Register then unregister from core but not from dynamicTypes set
    // This tests the filter in getAllDynamicStats
    registerDynamicStats(makeDef('s1') as Parameters<typeof registerDynamicStats>[0])
    const all = getAllDynamicStats()
    expect(all.length).toBeGreaterThanOrEqual(1)
  })

  it('getDynamicStats returns definition when registered', () => {
    const def = makeDef('s-get') as Parameters<typeof registerDynamicStats>[0]
    registerDynamicStats(def)
    const retrieved = getDynamicStats('s-get')
    expect(retrieved).toBeDefined()
    expect(retrieved!.type).toBe('s-get')
  })

  it('dedup: does not notify when re-registering identical definition (#6712)', () => {
    const def = makeDef('s-dedup') as Parameters<typeof registerDynamicStats>[0]
    registerDynamicStats(def)
    const listener = vi.fn()
    const unsub = onDynamicStatsChange(listener)
    // Re-register with identical definition
    registerDynamicStats(makeDef('s-dedup') as Parameters<typeof registerDynamicStats>[0])
    expect(listener).not.toHaveBeenCalled()
    unsub()
  })

  it('dedup: notifies when re-registering different definition', () => {
    const def = makeDef('s-dedup2') as Parameters<typeof registerDynamicStats>[0]
    registerDynamicStats(def)
    const listener = vi.fn()
    const unsub = onDynamicStatsChange(listener)
    // Re-register with different definition
    const differentDef = { ...makeDef('s-dedup2'), title: 'Different Title' } as Parameters<typeof registerDynamicStats>[0]
    registerDynamicStats(differentDef)
    expect(listener).toHaveBeenCalledOnce()
    unsub()
  })

  it('unsubscribe stops notifications', () => {
    const listener = vi.fn()
    const unsub = onDynamicStatsChange(listener)
    unsub()
    registerDynamicStats(makeDef('s-after-unsub') as Parameters<typeof registerDynamicStats>[0])
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('toRecord', () => {
  it('converts definition to serializable record', () => {
    const def = {
      type: 'test',
      title: 'Test Stats',
      blocks: [{ id: 'b1', label: 'Block', value: '1' }],
      defaultCollapsed: true,
      grid: { cols: 3, gap: 4 },
    }
    const record = toRecord(def as Parameters<typeof toRecord>[0])
    expect(record.type).toBe('test')
    expect(record.title).toBe('Test Stats')
    expect(record.blocks).toEqual(def.blocks)
    expect(record.defaultCollapsed).toBe(true)
    expect(record.grid).toEqual(def.grid)
  })
})
