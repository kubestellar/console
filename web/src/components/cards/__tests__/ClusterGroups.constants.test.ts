/**
 * Unit tests for ClusterGroups.constants — GROUP_COLORS palette invariants,
 * getGroupColor lookup, and formatFilter rendering across text/numeric fields.
 */
import { describe, it, expect } from 'vitest'
import {
  GROUP_COLORS,
  FILTER_FIELDS,
  TEXT_OPERATORS,
  NUM_OPERATORS,
  MAX_INLINE_BADGES,
  getGroupColor,
  formatFilter,
} from '../ClusterGroups.constants'
import type { ClusterFilter } from '../../../hooks/useClusterGroups'

describe('ClusterGroups.constants — palette invariants', () => {
  it('exposes at least 6 distinct group colors', () => {
    expect(GROUP_COLORS.length).toBeGreaterThanOrEqual(6)
    const names = GROUP_COLORS.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('gives every palette entry the expected tailwind class fields', () => {
    for (const color of GROUP_COLORS) {
      expect(color.name).toBeTruthy()
      expect(color.bg).toMatch(/^bg-.+\/20$/)
      expect(color.border).toMatch(/^border-.+\/40$/)
      expect(color.text).toMatch(/^text-.+-400$/)
      expect(color.dot).toMatch(/^bg-.+-500$/)
    }
  })

  it('MAX_INLINE_BADGES is a small positive integer', () => {
    expect(Number.isInteger(MAX_INLINE_BADGES)).toBe(true)
    expect(MAX_INLINE_BADGES).toBeGreaterThan(0)
    expect(MAX_INLINE_BADGES).toBeLessThanOrEqual(GROUP_COLORS.length)
  })
})

describe('getGroupColor', () => {
  it('returns the matching palette entry by name', () => {
    const green = getGroupColor('green')
    expect(green.name).toBe('green')
    expect(green).toBe(GROUP_COLORS.find((c) => c.name === 'green'))
  })

  it('falls back to the first palette entry when the color is unknown', () => {
    expect(getGroupColor('chartreuse')).toBe(GROUP_COLORS[0])
  })

  it('falls back to the first palette entry when the color is undefined', () => {
    expect(getGroupColor(undefined)).toBe(GROUP_COLORS[0])
  })

  it('does not treat empty string as a match', () => {
    expect(getGroupColor('')).toBe(GROUP_COLORS[0])
  })
})

describe('FILTER_FIELDS + operator tables', () => {
  it('declares only known filter types', () => {
    for (const f of FILTER_FIELDS) {
      expect(['bool', 'number', 'text']).toContain(f.type)
      expect(f.field).toBeTruthy()
      expect(f.label).toBeTruthy()
    }
  })

  it('provides operator entries with value+label for both operator groups', () => {
    for (const op of [...TEXT_OPERATORS, ...NUM_OPERATORS]) {
      expect(op.value).toBeTruthy()
      expect(op.label).toBeTruthy()
    }
  })

  it('has unique operator values within each operator group', () => {
    const textVals = TEXT_OPERATORS.map((o) => o.value)
    expect(new Set(textVals).size).toBe(textVals.length)
    const numVals = NUM_OPERATORS.map((o) => o.value)
    expect(new Set(numVals).size).toBe(numVals.length)
  })
})

describe('formatFilter', () => {
  it('uses field label + quoted value + operator label for text fields', () => {
    const f: ClusterFilter = { field: 'gpuType', operator: 'contains', value: 'A100' }
    expect(formatFilter(f)).toBe('GPU Type contains "A100"')
  })

  it('uses field label + numeric operator symbol for numeric fields', () => {
    const f: ClusterFilter = { field: 'cpuCores', operator: 'gte', value: '4' }
    expect(formatFilter(f)).toBe('CPU Cores >= 4')
  })

  it('renders bool fields via the numeric operator table (no quotes)', () => {
    const f: ClusterFilter = { field: 'healthy', operator: 'eq', value: 'true' }
    expect(formatFilter(f)).toBe('Healthy = true')
  })

  it('falls back to the raw field name when the field is unknown', () => {
    const f: ClusterFilter = { field: 'someWeirdField', operator: 'gt', value: '1' }
    expect(formatFilter(f)).toBe('someWeirdField > 1')
  })

  it('falls back to the raw operator when the operator is not in the numeric table', () => {
    const f: ClusterFilter = { field: 'cpuCores', operator: 'weirdOp', value: '2' }
    expect(formatFilter(f)).toBe('CPU Cores weirdOp 2')
  })

  it('falls back to the raw operator when the operator is not in the text table', () => {
    const f: ClusterFilter = { field: 'gpuType', operator: 'weirdOp', value: 'H100' }
    expect(formatFilter(f)).toBe('GPU Type weirdOp "H100"')
  })

  it('preserves an empty value in the rendered output', () => {
    const f: ClusterFilter = { field: 'gpuType', operator: 'eq', value: '' }
    expect(formatFilter(f)).toBe('GPU Type equals ""')
  })

  it('renders every numeric operator using its symbol label', () => {
    const cases: Array<[ClusterFilter, string]> = [
      [{ field: 'nodeCount', operator: 'gt', value: '1' }, 'Nodes > 1'],
      [{ field: 'nodeCount', operator: 'gte', value: '1' }, 'Nodes >= 1'],
      [{ field: 'nodeCount', operator: 'lt', value: '1' }, 'Nodes < 1'],
      [{ field: 'nodeCount', operator: 'lte', value: '1' }, 'Nodes <= 1'],
      [{ field: 'nodeCount', operator: 'eq', value: '1' }, 'Nodes = 1'],
    ]
    for (const [f, want] of cases) {
      expect(formatFilter(f)).toBe(want)
    }
  })

  it('renders every text operator using its word label', () => {
    const cases: Array<[ClusterFilter, string]> = [
      [{ field: 'gpuType', operator: 'eq', value: 'A' }, 'GPU Type equals "A"'],
      [{ field: 'gpuType', operator: 'contains', value: 'A' }, 'GPU Type contains "A"'],
      [{ field: 'gpuType', operator: 'neq', value: 'A' }, 'GPU Type excludes "A"'],
    ]
    for (const [f, want] of cases) {
      expect(formatFilter(f)).toBe(want)
    }
  })
})
