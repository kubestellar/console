import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  registerDynamicStats,
  unregisterDynamicStats,
  getDynamicStats,
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
