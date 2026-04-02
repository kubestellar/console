import { describe, it, expect } from 'vitest'
import {
  resolveStatValue,
  resolveFieldPath,
  resolveComputedExpression,
  resolveAggregate,
  formatValue,
  formatNumber,
  formatBytes,
  formatCurrency,
  formatDuration,
} from '../valueResolvers'

describe('resolveFieldPath', () => {
  it('resolves simple path', () => {
    expect(resolveFieldPath({ name: 'foo' }, 'name')).toBe('foo')
  })

  it('resolves nested path', () => {
    expect(resolveFieldPath({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42)
  })

  it('returns undefined for missing path', () => {
    expect(resolveFieldPath({ a: 1 }, 'b')).toBeUndefined()
  })

  it('returns undefined for null data', () => {
    expect(resolveFieldPath(null, 'a')).toBeUndefined()
  })

  it('returns data when path is empty', () => {
    expect(resolveFieldPath({ a: 1 }, '')).toEqual({ a: 1 })
  })

  it('resolves array access', () => {
    expect(resolveFieldPath({ items: [10, 20, 30] }, 'items[1]')).toBe(20)
  })

  it('returns undefined for non-array access', () => {
    expect(resolveFieldPath({ items: 'not-array' }, 'items[0]')).toBeUndefined()
  })

  it('returns undefined when intermediate is null', () => {
    expect(resolveFieldPath({ a: null }, 'a.b')).toBeUndefined()
  })
})

describe('resolveComputedExpression', () => {
  const items = [
    { value: 10, status: 'healthy' },
    { value: 20, status: 'unhealthy' },
    { value: 30, status: 'healthy' },
  ]

  it('counts array items', () => {
    expect(resolveComputedExpression(items, 'count')).toBe(3)
  })

  it('sums a field', () => {
    expect(resolveComputedExpression(items, 'sum:value')).toBe(60)
  })

  it('averages a field', () => {
    expect(resolveComputedExpression(items, 'avg:value')).toBe(20)
  })

  it('finds minimum', () => {
    expect(resolveComputedExpression(items, 'min:value')).toBe(10)
  })

  it('finds maximum', () => {
    expect(resolveComputedExpression(items, 'max:value')).toBe(30)
  })

  it('gets latest item field', () => {
    expect(resolveComputedExpression(items, 'latest:status')).toBe('healthy')
  })

  it('gets first item field', () => {
    expect(resolveComputedExpression(items, 'first:value')).toBe(10)
  })

  it('filters then counts', () => {
    expect(resolveComputedExpression(items, 'filter:status=healthy|count')).toBe(2)
  })

  it('filters with negation', () => {
    expect(resolveComputedExpression(items, 'filter:status!=healthy|count')).toBe(1)
  })

  it('filters truthy values', () => {
    const data = [{ active: true }, { active: false }, { active: true }]
    expect(resolveComputedExpression(data, 'filter:active|count')).toBe(2)
  })

  it('returns undefined for non-array non-object', () => {
    expect(resolveComputedExpression('not-an-array', 'count')).toBeUndefined()
  })

  it('extracts array from object with items field', () => {
    expect(resolveComputedExpression({ items: [1, 2, 3] }, 'count')).toBe(3)
  })

  it('returns 0 for empty array aggregates', () => {
    expect(resolveComputedExpression([], 'avg:value')).toBe(0)
    expect(resolveComputedExpression([], 'min:value')).toBe(0)
    expect(resolveComputedExpression([], 'max:value')).toBe(0)
  })

  it('returns undefined for empty array latest/first', () => {
    expect(resolveComputedExpression([], 'latest:value')).toBeUndefined()
    expect(resolveComputedExpression([], 'first:value')).toBeUndefined()
  })
})

describe('resolveAggregate', () => {
  const items = [
    { count: 5, status: 'ok' },
    { count: 10, status: 'ok' },
    { count: 3, status: 'error' },
  ]

  it('counts items', () => {
    expect(resolveAggregate(items, 'count', 'count')).toBe(3)
  })

  it('sums a field', () => {
    expect(resolveAggregate(items, 'sum', 'count')).toBe(18)
  })

  it('averages a field', () => {
    expect(resolveAggregate(items, 'avg', 'count')).toBe(6)
  })

  it('finds min', () => {
    expect(resolveAggregate(items, 'min', 'count')).toBe(3)
  })

  it('finds max', () => {
    expect(resolveAggregate(items, 'max', 'count')).toBe(10)
  })

  it('applies filter', () => {
    expect(resolveAggregate(items, 'sum', 'count', 'status=ok')).toBe(15)
  })

  it('returns 0 for non-array data', () => {
    expect(resolveAggregate('not-array', 'count', 'field')).toBe(0)
  })

  it('returns 0 for empty arrays', () => {
    expect(resolveAggregate([], 'avg', 'field')).toBe(0)
  })
})

describe('formatValue', () => {
  it('returns dash for null', () => {
    expect(formatValue(null)).toBe('-')
  })

  it('returns dash for undefined', () => {
    expect(formatValue(undefined)).toBe('-')
  })

  it('formats as percentage', () => {
    expect(formatValue(85.7, 'percentage')).toBe('86%')
  })

  it('formats as bytes', () => {
    const result = formatValue(1048576, 'bytes')
    expect(result).toContain('MB')
  })

  it('formats as currency', () => {
    expect(formatValue(1500, 'currency')).toBe('$1.5K')
  })

  it('formats as duration', () => {
    expect(formatValue(90, 'duration')).toBe('2m')
  })

  it('formats as number', () => {
    expect(formatValue(5000, 'number')).toBe('5.0K')
  })

  it('returns string for non-numeric value', () => {
    expect(formatValue('hello')).toBe('hello')
  })
})

describe('formatNumber', () => {
  it('returns number for small values', () => {
    expect(formatNumber(42)).toBe(42)
  })

  it('formats thousands with K', () => {
    expect(formatNumber(5000)).toBe('5.0K')
  })

  it('formats millions with M', () => {
    expect(formatNumber(2500000)).toBe('2.5M')
  })

  it('formats billions with B', () => {
    expect(formatNumber(3000000000)).toBe('3.0B')
  })
})

describe('formatBytes', () => {
  it('returns 0 B for zero', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('formats GB', () => {
    expect(formatBytes(1073741824)).toContain('GB')
  })
})

describe('formatCurrency', () => {
  it('formats small amounts', () => {
    expect(formatCurrency(42.5)).toBe('$42.50')
  })

  it('formats thousands', () => {
    expect(formatCurrency(5000)).toBe('$5.0K')
  })

  it('formats millions', () => {
    expect(formatCurrency(2000000)).toBe('$2.0M')
  })
})

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(30)).toBe('30s')
  })

  it('formats minutes', () => {
    expect(formatDuration(120)).toBe('2m')
  })

  it('formats hours', () => {
    expect(formatDuration(7200)).toBe('2.0h')
  })

  it('formats days', () => {
    expect(formatDuration(172800)).toBe('2.0d')
  })

  it('formats exactly 60 seconds as minutes', () => {
    expect(formatDuration(60)).toBe('1m')
  })

  it('formats exactly 3600 seconds as hours', () => {
    expect(formatDuration(3600)).toBe('1.0h')
  })

  it('formats exactly 86400 seconds as days', () => {
    expect(formatDuration(86400)).toBe('1.0d')
  })

  it('formats zero seconds', () => {
    expect(formatDuration(0)).toBe('0s')
  })
})

// ============================================================================
// resolveStatValue (main orchestrator)
// ============================================================================

describe('resolveStatValue', () => {
  it('resolves a field-type source', () => {
    const source = { type: 'field' as const, path: 'count' }
    const data = { count: 42 }
    const result = resolveStatValue(source, data)
    expect(result.value).toBe(42)
    expect(result.isDemo).toBe(false)
  })

  it('resolves a nested field-type source', () => {
    const source = { type: 'field' as const, path: 'summary.healthy' }
    const data = { summary: { healthy: 7 } }
    const result = resolveStatValue(source, data)
    expect(result.value).toBe(7)
  })

  it('resolves a computed-type source with count', () => {
    const source = { type: 'computed' as const, expression: 'count' }
    const data = [{ a: 1 }, { a: 2 }, { a: 3 }]
    const result = resolveStatValue(source, data)
    expect(result.value).toBe(3)
  })

  it('resolves a computed-type source with sum', () => {
    const source = { type: 'computed' as const, expression: 'sum:score' }
    const data = [{ score: 10 }, { score: 20 }]
    const result = resolveStatValue(source, data)
    expect(result.value).toBe(30)
  })

  it('resolves a hook-type source as undefined (placeholder)', () => {
    const source = { type: 'hook' as const, hookName: 'useFoo', field: 'bar' }
    const result = resolveStatValue(source, null)
    expect(result.value).toBe('-')
  })

  it('resolves an aggregate-type source', () => {
    const source = {
      type: 'aggregate' as const,
      aggregation: 'sum' as const,
      field: 'cpu',
      filter: undefined,
    }
    const data = [{ cpu: 4 }, { cpu: 8 }]
    const result = resolveStatValue(source, data)
    expect(result.value).toBe(12)
  })

  it('applies format to resolved value', () => {
    const source = { type: 'field' as const, path: 'usage' }
    const data = { usage: 75.3 }
    const result = resolveStatValue(source, data, 'percentage')
    expect(result.value).toBe('75%')
  })

  it('returns dash for unknown source type', () => {
    const source = { type: 'unknown' as const } as never
    const result = resolveStatValue(source, {})
    expect(result.value).toBe('-')
  })

  it('formats aggregate result as bytes', () => {
    const source = {
      type: 'aggregate' as const,
      aggregation: 'sum' as const,
      field: 'mem',
      filter: undefined,
    }
    const data = [{ mem: 1073741824 }] // 1 GB
    const result = resolveStatValue(source, data, 'bytes')
    expect(String(result.value)).toContain('GB')
  })

  it('formats field result as currency', () => {
    const source = { type: 'field' as const, path: 'cost' }
    const data = { cost: 2500 }
    const result = resolveStatValue(source, data, 'currency')
    expect(result.value).toBe('$2.5K')
  })
})

// ============================================================================
// Additional edge cases for resolveComputedExpression
// ============================================================================

describe('resolveComputedExpression (additional)', () => {
  it('extracts array from object with "data" field', () => {
    expect(resolveComputedExpression({ data: [1, 2] }, 'count')).toBe(2)
  })

  it('extracts array from object with "results" field', () => {
    expect(resolveComputedExpression({ results: [1, 2, 3, 4] }, 'count')).toBe(4)
  })

  it('extracts array from object with "list" field', () => {
    expect(resolveComputedExpression({ list: [1] }, 'count')).toBe(1)
  })

  it('returns undefined for object without recognized array fields', () => {
    expect(resolveComputedExpression({ foo: 'bar' }, 'count')).toBeUndefined()
  })

  it('handles filter then sum pipeline', () => {
    const items = [
      { value: 10, type: 'a' },
      { value: 20, type: 'b' },
      { value: 30, type: 'a' },
    ]
    expect(resolveComputedExpression(items, 'filter:type=a|sum:value')).toBe(40)
  })

  it('handles unknown operation gracefully', () => {
    const items = [{ x: 1 }, { x: 2 }]
    // Unknown op doesn't modify currentItems, falls through to return length
    expect(resolveComputedExpression(items, 'unknownOp:x')).toBe(2)
  })

  it('handles chained filter then count at the end', () => {
    const items = [
      { status: 'ok' },
      { status: 'ok' },
      { status: 'error' },
    ]
    // Filter reduces set, then falls through to return remaining length
    expect(resolveComputedExpression(items, 'filter:status=ok')).toBe(2)
  })
})

// ============================================================================
// Additional edge cases for resolveAggregate
// ============================================================================

describe('resolveAggregate (additional)', () => {
  it('returns 0 for empty array min', () => {
    expect(resolveAggregate([], 'min', 'field')).toBe(0)
  })

  it('returns 0 for empty array max', () => {
    expect(resolveAggregate([], 'max', 'field')).toBe(0)
  })

  it('handles non-numeric field values in sum (treats as 0)', () => {
    const data = [{ val: 'abc' }, { val: 10 }]
    expect(resolveAggregate(data, 'sum', 'val')).toBe(10)
  })

  it('returns 0 for unknown aggregation type', () => {
    const data = [{ v: 1 }]
    expect(resolveAggregate(data, 'unknown' as never, 'v')).toBe(0)
  })

  it('applies filter with whitespace in filter string', () => {
    const data = [
      { s: 'ok', v: 5 },
      { s: 'fail', v: 3 },
    ]
    expect(resolveAggregate(data, 'count', 'v', ' s = ok ')).toBe(1)
  })
})

// ============================================================================
// Additional edge cases for formatBytes
// ============================================================================

describe('formatBytes (additional)', () => {
  it('formats KB values', () => {
    expect(formatBytes(2048)).toContain('KB')
  })

  it('formats TB values', () => {
    const TB = Math.pow(1024, 4)
    expect(formatBytes(TB)).toContain('TB')
  })

  it('formats PB values', () => {
    const PB = Math.pow(1024, 5)
    expect(formatBytes(PB)).toContain('PB')
  })

  it('returns 0 B for negative bytes', () => {
    expect(formatBytes(-100)).toBe('0 B')
  })

  it('returns 0 B for NaN', () => {
    expect(formatBytes(NaN)).toBe('0 B')
  })

  it('returns 0 B for Infinity', () => {
    expect(formatBytes(Infinity)).toBe('0 B')
  })
})

// ============================================================================
// Additional edge cases for formatNumber
// ============================================================================

describe('formatNumber (additional)', () => {
  it('handles negative thousands', () => {
    expect(formatNumber(-5000)).toBe('-5.0K')
  })

  it('handles negative millions', () => {
    expect(formatNumber(-2500000)).toBe('-2.5M')
  })

  it('handles negative billions', () => {
    expect(formatNumber(-3000000000)).toBe('-3.0B')
  })

  it('returns small negative numbers as-is', () => {
    expect(formatNumber(-42)).toBe(-42)
  })

  it('returns zero as-is', () => {
    expect(formatNumber(0)).toBe(0)
  })
})

// ============================================================================
// Additional edge cases for formatValue
// ============================================================================

describe('formatValue (additional)', () => {
  it('returns integer as formatted number for default (no format)', () => {
    // Integer values should be formatted via formatNumber
    const result = formatValue(500)
    expect(result).toBe(500)
  })

  it('returns float as-is for default (no format)', () => {
    const result = formatValue(3.14)
    expect(result).toBe(3.14)
  })

  it('parses numeric strings', () => {
    expect(formatValue('42', 'percentage')).toBe('42%')
  })

  it('formats large integer with default format using K suffix', () => {
    const result = formatValue(5000)
    expect(result).toBe('5.0K')
  })
})
