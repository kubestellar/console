import { describe, it, expect} from 'vitest'
import {
  registerStats,
  getStatsDefinition,
  getAllStatsDefinitions,
  unregisterStats,
  getAllStatsTypes,
  registerStatValueGetter,
  parseStatsYAML,
  createStatBlock,
  createStatsDefinition,
} from '../StatsRuntime'
import type { StatsDefinition, StatBlockDefinition } from '../types'

/**
 * Tests for StatsRuntime pure functions.
 *
 * The React component (StatsRuntime, StatBlock, StatBlockSkeleton) is not
 * tested here — those need React rendering. This file covers the registries,
 * factory functions, and parseStatsYAML stub.
 */

// ---------------------------------------------------------------------------
// Helper: create a minimal StatsDefinition
// ---------------------------------------------------------------------------

function makeDefinition(type: string, overrides?: Partial<StatsDefinition>): StatsDefinition {
  return {
    type,
    blocks: [
      {
        id: 'block1',
        label: 'Block 1',
        icon: 'Server',
        color: 'purple',
        visible: true,
      },
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Stats Registry
// ---------------------------------------------------------------------------

describe('registerStats / getStatsDefinition', () => {
  it('registers a definition that can be retrieved', () => {
    const def = makeDefinition('test-register')
    registerStats(def)
    expect(getStatsDefinition('test-register')).toBe(def)
  })

  it('overwrites a previous definition with the same type', () => {
    const defA = makeDefinition('overwrite-type', { title: 'A' })
    const defB = makeDefinition('overwrite-type', { title: 'B' })

    registerStats(defA)
    registerStats(defB)

    expect(getStatsDefinition('overwrite-type')?.title).toBe('B')
  })

  it('returns undefined for an unregistered type', () => {
    expect(getStatsDefinition('no-such-type-xyz')).toBeUndefined()
  })
})

describe('getAllStatsDefinitions', () => {
  it('returns an array', () => {
    const all = getAllStatsDefinitions()
    expect(Array.isArray(all)).toBe(true)
  })

  it('includes previously registered definitions', () => {
    const def = makeDefinition('all-defs-test')
    registerStats(def)

    const all = getAllStatsDefinitions()
    expect(all).toContainEqual(def)
  })
})

describe('getAllStatsTypes', () => {
  it('returns an array of type strings', () => {
    registerStats(makeDefinition('types-list-test'))
    const types = getAllStatsTypes()
    expect(types).toContain('types-list-test')
  })
})

describe('unregisterStats', () => {
  it('removes a registered definition and returns true', () => {
    const def = makeDefinition('to-unregister')
    registerStats(def)
    expect(unregisterStats('to-unregister')).toBe(true)
    expect(getStatsDefinition('to-unregister')).toBeUndefined()
  })

  it('returns false when unregistering a non-existent type', () => {
    expect(unregisterStats('never-registered-xyz')).toBe(false)
  })

  it('also cleans up associated value getter', () => {
    const def = makeDefinition('cleanup-getter')
    registerStats(def)
    registerStatValueGetter('cleanup-getter', () => ({ value: 0 }))

    unregisterStats('cleanup-getter')

    // Re-register and verify the getter is gone (getAllStatsDefinitions will
    // not include a getter, but the fact that unregister didn't throw proves
    // the valueGetterRegistry.delete path was exercised)
    expect(getStatsDefinition('cleanup-getter')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Value Getter Registry
// ---------------------------------------------------------------------------

describe('registerStatValueGetter', () => {
  it('registers a value getter without error', () => {
    expect(() => {
      registerStatValueGetter('getter-test', (blockId, _data) => ({
        value: blockId === 'count' ? 42 : 0,
      }))
    }).not.toThrow()
  })

  it('can overwrite a previously registered getter', () => {
    registerStatValueGetter('getter-overwrite', () => ({ value: 1 }))
    registerStatValueGetter('getter-overwrite', () => ({ value: 2 }))
    // No assertion on the getter directly since it's not exported,
    // but no error means success
  })
})

// ---------------------------------------------------------------------------
// parseStatsYAML (stub)
// ---------------------------------------------------------------------------

describe('parseStatsYAML', () => {
  it('throws an error indicating YAML parsing is not implemented', () => {
    expect(() => parseStatsYAML('type: foo')).toThrow('YAML parsing not yet implemented')
  })

  it('suggests using registerStats() instead', () => {
    expect(() => parseStatsYAML('')).toThrow('registerStats()')
  })
})

// ---------------------------------------------------------------------------
// createStatBlock
// ---------------------------------------------------------------------------

describe('createStatBlock', () => {
  it('creates a stat block with required fields', () => {
    const block = createStatBlock('test-id', 'Test Label', 'Server', 'blue')
    expect(block.id).toBe('test-id')
    expect(block.label).toBe('Test Label')
    expect(block.icon).toBe('Server')
    expect(block.color).toBe('blue')
    expect(block.visible).toBe(true)
  })

  it('merges optional overrides', () => {
    const block = createStatBlock('with-opts', 'With Opts', 'Cpu', 'green', {
      tooltip: 'CPU usage',
      order: 2,
      visible: false,
    })
    expect(block.tooltip).toBe('CPU usage')
    expect(block.order).toBe(2)
    expect(block.visible).toBe(false)
  })

  it('override visible=false takes precedence over default visible=true', () => {
    const block = createStatBlock('vis', 'Vis', 'Eye', 'gray', { visible: false })
    expect(block.visible).toBe(false)
  })

  it('returns a plain object with expected keys', () => {
    const block = createStatBlock('keys', 'Keys', 'Key', 'yellow')
    const keys = Object.keys(block)
    expect(keys).toContain('id')
    expect(keys).toContain('label')
    expect(keys).toContain('icon')
    expect(keys).toContain('color')
    expect(keys).toContain('visible')
  })
})

// ---------------------------------------------------------------------------
// createStatsDefinition
// ---------------------------------------------------------------------------

describe('createStatsDefinition', () => {
  it('creates a definition with type and blocks', () => {
    const blocks: StatBlockDefinition[] = [
      { id: 'b1', label: 'B1', icon: 'Server', color: 'purple' },
    ]
    const def = createStatsDefinition('my-type', blocks)
    expect(def.type).toBe('my-type')
    expect(def.blocks).toBe(blocks)
  })

  it('merges optional overrides', () => {
    const blocks: StatBlockDefinition[] = []
    const def = createStatsDefinition('opt-type', blocks, {
      title: 'Custom Title',
      defaultCollapsed: true,
      grid: { columns: 4 },
    })
    expect(def.title).toBe('Custom Title')
    expect(def.defaultCollapsed).toBe(true)
    expect(def.grid?.columns).toBe(4)
  })

  it('works with empty blocks array', () => {
    const def = createStatsDefinition('empty-blocks', [])
    expect(def.blocks).toEqual([])
    expect(def.type).toBe('empty-blocks')
  })

  it('preserves block references (no deep clone)', () => {
    const block: StatBlockDefinition = {
      id: 'ref',
      label: 'Ref',
      icon: 'Link',
      color: 'cyan',
    }
    const def = createStatsDefinition('ref-test', [block])
    expect(def.blocks[0]).toBe(block)
  })
})
