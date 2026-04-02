import { describe, it, expect } from 'vitest'
import {
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
})
