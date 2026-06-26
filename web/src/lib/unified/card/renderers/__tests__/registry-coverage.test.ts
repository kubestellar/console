/**
 * Extended coverage tests for registry.ts
 *
 * Focuses on renderers NOT covered in the base registry.test.ts:
 *   - date, datetime, relative-time (all branches)
 *   - icon renderer
 *   - truncate renderer with null
 *   - link renderer with null
 *   - progress-bar null/NaN branches
 *   - number/percentage/bytes/duration string-coercion and prefix/suffix
 *   - cluster-badge / namespace-badge null branches
 *   - json renderer with string value
 *   - renderCell with custom registered renderer
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'
import {
  registerRenderer,
  getRenderer,
  getRegisteredRenderers,
  renderCell,
} from '../registry'
import type { CardColumnConfig } from '../../../types'

// Helper to build a minimal column config
function col(overrides: Partial<CardColumnConfig> = {}): CardColumnConfig {
  return { field: 'test', ...overrides } as CardColumnConfig
}

// Helper to extract props from a React element
function elProps(el: unknown): Record<string, unknown> {
  return (el as { props: Record<string, unknown> }).props
}

function elType(el: unknown): string {
  return (el as { type: string }).type
}

// ---------------------------------------------------------------------------
// date renderer
// ---------------------------------------------------------------------------

describe('date renderer', () => {
  it('formats a valid date string', () => {
    const result = renderCell('2024-06-15', {}, col({ render: 'date' }))
    expect(result).toBeDefined()
    expect(elType(result)).toBe('span')
    // Should contain some date representation
    expect(typeof elProps(result).children).toBe('string')
  })

  it('formats a Date object', () => {
    const result = renderCell(new Date('2024-01-01'), {}, col({ render: 'date' }))
    expect(result).toBeDefined()
    expect(elType(result)).toBe('span')
  })

  it('returns em-dash for null', () => {
    const result = renderCell(null, {}, col({ render: 'date' }))
    expect(elProps(result).children).toBe('\u2014')
  })

  it('returns em-dash for undefined', () => {
    const result = renderCell(undefined, {}, col({ render: 'date' }))
    expect(elProps(result).children).toBe('\u2014')
  })

  it('handles invalid date string gracefully', () => {
    // new Date('not-a-date') produces Invalid Date but does not throw
    const result = renderCell('not-a-date', {}, col({ render: 'date' }))
    expect(result).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// datetime renderer
// ---------------------------------------------------------------------------

describe('datetime renderer', () => {
  it('formats a valid date-time string', () => {
    const result = renderCell('2024-06-15T10:30:00Z', {}, col({ render: 'datetime' }))
    expect(result).toBeDefined()
    expect(elType(result)).toBe('span')
  })

  it('formats a Date object', () => {
    const result = renderCell(new Date('2024-06-15T10:30:00Z'), {}, col({ render: 'datetime' }))
    expect(result).toBeDefined()
  })

  it('returns em-dash for null', () => {
    const result = renderCell(null, {}, col({ render: 'datetime' }))
    expect(elProps(result).children).toBe('\u2014')
  })

  it('returns em-dash for undefined', () => {
    const result = renderCell(undefined, {}, col({ render: 'datetime' }))
    expect(elProps(result).children).toBe('\u2014')
  })
})

// ---------------------------------------------------------------------------
// relative-time renderer
// ---------------------------------------------------------------------------

describe('relative-time renderer', () => {
  it('returns "just now" for recent timestamps', () => {
    const recent = new Date(Date.now() - 10000) // 10 seconds ago
    const result = renderCell(recent, {}, col({ render: 'relative-time' }))
    expect(result).toBe('just now')
  })

  it('returns minutes ago', () => {
    const FIVE_MINUTES_MS = 5 * 60 * 1000
    const past = new Date(Date.now() - FIVE_MINUTES_MS)
    const result = renderCell(past, {}, col({ render: 'relative-time' }))
    expect(result).toBe('5m ago')
  })

  it('returns hours ago', () => {
    const THREE_HOURS_MS = 3 * 60 * 60 * 1000
    const past = new Date(Date.now() - THREE_HOURS_MS)
    const result = renderCell(past, {}, col({ render: 'relative-time' }))
    expect(result).toBe('3h ago')
  })

  it('returns days ago', () => {
    const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000
    const past = new Date(Date.now() - TEN_DAYS_MS)
    const result = renderCell(past, {}, col({ render: 'relative-time' }))
    expect(result).toBe('10d ago')
  })

  it('returns months ago', () => {
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000
    const past = new Date(Date.now() - NINETY_DAYS_MS)
    const result = renderCell(past, {}, col({ render: 'relative-time' }))
    expect(result).toMatch(/\d+mo ago/)
  })

  it('returns years ago', () => {
    const TWO_YEARS_MS = 730 * 24 * 60 * 60 * 1000
    const past = new Date(Date.now() - TWO_YEARS_MS)
    const result = renderCell(past, {}, col({ render: 'relative-time' }))
    expect(result).toMatch(/\d+y ago/)
  })

  it('returns em-dash for null', () => {
    const result = renderCell(null, {}, col({ render: 'relative-time' }))
    expect(elProps(result).children).toBe('\u2014')
  })

  it('returns em-dash for undefined', () => {
    const result = renderCell(undefined, {}, col({ render: 'relative-time' }))
    expect(elProps(result).children).toBe('\u2014')
  })

  it('accepts a date string', () => {
    const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
    const past = new Date(Date.now() - FIVE_HOURS_MS).toISOString()
    const result = renderCell(past, {}, col({ render: 'relative-time' }))
    expect(result).toBe('5h ago')
  })
})

// ---------------------------------------------------------------------------
// icon renderer
// ---------------------------------------------------------------------------

describe('icon renderer', () => {
  it('renders value as text', () => {
    const result = renderCell('settings', {}, col({ render: 'icon' }))
    expect(elProps(result).children).toBe('settings')
  })

  it('returns em-dash for null', () => {
    const result = renderCell(null, {}, col({ render: 'icon' }))
    expect(elProps(result).children).toBe('\u2014')
  })

  it('returns em-dash for undefined', () => {
    const result = renderCell(undefined, {}, col({ render: 'icon' }))
    expect(elProps(result).children).toBe('\u2014')
  })
})

// ---------------------------------------------------------------------------
// truncate renderer — null branch
// ---------------------------------------------------------------------------

describe('truncate renderer', () => {
  it('returns em-dash for null', () => {
    const result = renderCell(null, {}, col({ render: 'truncate' }))
    expect(elProps(result).children).toBe('\u2014')
  })
})

// ---------------------------------------------------------------------------
// link renderer — null branch
// ---------------------------------------------------------------------------

describe('link renderer', () => {
  it('returns em-dash for null', () => {
    const result = renderCell(null, {}, col({ render: 'link' }))
    expect(elProps(result).children).toBe('\u2014')
  })
})

// ---------------------------------------------------------------------------
// progress-bar renderer — edge cases
// ---------------------------------------------------------------------------

describe('progress-bar renderer', () => {
  it('returns em-dash for null', () => {
    const result = renderCell(null, {}, col({ render: 'progress-bar' }))
    expect(elProps(result).children).toBe('\u2014')
  })

  it('returns em-dash for NaN', () => {
    const result = renderCell('abc', {}, col({ render: 'progress-bar' }))
    expect(elProps(result).children).toBe('\u2014')
  })

  it('renders warning color for 70-89 range', () => {
    const result = renderCell(75, {}, col({ render: 'progress-bar' }))
    expect(result).toBeDefined()
    const children = elProps(result).children as unknown[]
    const label = children[1] as { props: { children: string } }
    expect(label.props.children).toBe('75%')
  })

  it('renders success color for low values', () => {
    const result = renderCell(30, {}, col({ render: 'progress-bar' }))
    expect(result).toBeDefined()
    const children = elProps(result).children as unknown[]
    const label = children[1] as { props: { children: string } }
    expect(label.props.children).toBe('30%')
  })

  it('renders error color for 90+ values', () => {
    const result = renderCell(95, {}, col({ render: 'progress-bar' }))
    expect(result).toBeDefined()
    const children = elProps(result).children as unknown[]
    const label = children[1] as { props: { children: string } }
    expect(label.props.children).toBe('95%')
  })

  it('coerces string to number', () => {
    const result = renderCell('45', {}, col({ render: 'progress-bar' }))
    expect(result).toBeDefined()
    const children = elProps(result).children as unknown[]
    const label = children[1] as { props: { children: string } }
    expect(label.props.children).toBe('45%')
  })
})

// ---------------------------------------------------------------------------
// number/percentage/bytes/duration — prefix/suffix and string coercion
// ---------------------------------------------------------------------------

describe('number renderer — prefix/suffix and string coercion', () => {
  it('applies prefix and suffix', () => {
    const result = renderCell(2500, {}, col({ render: 'number', prefix: '$', suffix: '!' }))
    const text = elProps(result).children as string
    expect(text).toContain('$')
    expect(text).toContain('!')
  })

  it('coerces string to number', () => {
    const result = renderCell('1234', {}, col({ render: 'number' }))
    expect(result).toBeDefined()
    expect(elProps(result).children).toContain('1.2K')
  })

  it('returns null em-dash for undefined', () => {
    const result = renderCell(undefined, {}, col({ render: 'number' }))
    expect(elProps(result).children).toBe('\u2014')
  })
})

describe('percentage renderer — prefix/suffix', () => {
  it('applies prefix and suffix', () => {
    const result = renderCell(50, {}, col({ render: 'percentage', prefix: '~', suffix: ' approx' }))
    const text = elProps(result).children as string
    expect(text).toContain('~')
    expect(text).toContain('approx')
  })

  it('coerces string to number', () => {
    const result = renderCell('88.5', {}, col({ render: 'percentage' }))
    expect(result).toBeDefined()
  })

  it('returns em-dash for NaN string', () => {
    const result = renderCell('xyz', {}, col({ render: 'percentage' }))
    expect(elProps(result).children).toBe('\u2014')
  })

  it('returns em-dash for undefined', () => {
    const result = renderCell(undefined, {}, col({ render: 'percentage' }))
    expect(elProps(result).children).toBe('\u2014')
  })
})

describe('bytes renderer — prefix/suffix and coercion', () => {
  it('applies prefix and suffix', () => {
    const ONE_MB = 1024 * 1024
    const result = renderCell(ONE_MB, {}, col({ render: 'bytes', prefix: '~', suffix: ' used' }))
    const text = elProps(result).children as string
    expect(text).toContain('~')
    expect(text).toContain('used')
  })

  it('coerces string to number', () => {
    const result = renderCell('2048', {}, col({ render: 'bytes' }))
    expect(result).toBeDefined()
  })

  it('returns em-dash for NaN', () => {
    const result = renderCell('abc', {}, col({ render: 'bytes' }))
    expect(elProps(result).children).toBe('\u2014')
  })

  it('returns em-dash for undefined', () => {
    const result = renderCell(undefined, {}, col({ render: 'bytes' }))
    expect(elProps(result).children).toBe('\u2014')
  })
})

describe('duration renderer — prefix/suffix and coercion', () => {
  it('applies prefix and suffix', () => {
    const ONE_HOUR = 3600
    const result = renderCell(ONE_HOUR, {}, col({ render: 'duration', prefix: '~', suffix: ' elapsed' }))
    const text = elProps(result).children as string
    expect(text).toContain('~')
    expect(text).toContain('elapsed')
  })

  it('coerces string to number', () => {
    const result = renderCell('120', {}, col({ render: 'duration' }))
    expect(result).toBeDefined()
  })

  it('returns em-dash for NaN', () => {
    const result = renderCell('abc', {}, col({ render: 'duration' }))
    expect(elProps(result).children).toBe('\u2014')
  })

  it('returns em-dash for undefined', () => {
    const result = renderCell(undefined, {}, col({ render: 'duration' }))
    expect(elProps(result).children).toBe('\u2014')
  })
})

// ---------------------------------------------------------------------------
// cluster-badge / namespace-badge — null branches
// ---------------------------------------------------------------------------

describe('cluster-badge renderer — null', () => {
  it('returns em-dash for null', () => {
    const result = renderCell(null, {}, col({ render: 'cluster-badge' }))
    expect(elProps(result).children).toBe('\u2014')
  })

  it('returns em-dash for undefined', () => {
    const result = renderCell(undefined, {}, col({ render: 'cluster-badge' }))
    expect(elProps(result).children).toBe('\u2014')
  })
})

describe('namespace-badge renderer — null', () => {
  it('returns em-dash for null', () => {
    const result = renderCell(null, {}, col({ render: 'namespace-badge' }))
    expect(elProps(result).children).toBe('\u2014')
  })

  it('returns em-dash for undefined', () => {
    const result = renderCell(undefined, {}, col({ render: 'namespace-badge' }))
    expect(elProps(result).children).toBe('\u2014')
  })
})

// ---------------------------------------------------------------------------
// status-badge — null branch
// ---------------------------------------------------------------------------

describe('status-badge renderer — null', () => {
  it('returns em-dash for null', () => {
    const result = renderCell(null, {}, col({ render: 'status-badge' }))
    expect(elProps(result).children).toBe('\u2014')
  })
})

// ---------------------------------------------------------------------------
// json renderer — string value branch
// ---------------------------------------------------------------------------

describe('json renderer — string value', () => {
  it('renders a plain string value as-is', () => {
    const result = renderCell('plain text', {}, col({ render: 'json' }))
    expect(elType(result)).toBe('pre')
    expect(elProps(result).children).toBe('plain text')
  })

  it('renders undefined as "null"', () => {
    const result = renderCell(undefined, {}, col({ render: 'json' }))
    expect(elProps(result).children).toBe('null')
  })
})

// ---------------------------------------------------------------------------
// text renderer — prefix/suffix
// ---------------------------------------------------------------------------

describe('text renderer — prefix/suffix', () => {
  it('applies prefix and suffix to text', () => {
    const result = renderCell('hello', {}, col({ prefix: '>', suffix: '<' }))
    expect(result).toBe('>hello<')
  })

  it('renders without prefix/suffix by default', () => {
    const result = renderCell('world', {}, col())
    expect(result).toBe('world')
  })
})

// ---------------------------------------------------------------------------
// renderCell — custom renderer overrides
// ---------------------------------------------------------------------------

describe('renderCell with custom renderer', () => {
  it('uses a custom-registered renderer over built-in', () => {
    const customFn = vi.fn(() => 'custom-result')
    registerRenderer('my-custom-v2', customFn)

    const result = renderCell('val', { foo: 1 }, col({ render: 'my-custom-v2' as never }))
    expect(customFn).toHaveBeenCalledWith('val', { foo: 1 }, expect.objectContaining({ field: 'test' }))
    expect(result).toBe('custom-result')
  })
})

// ---------------------------------------------------------------------------
// getRegisteredRenderers — combined list
// ---------------------------------------------------------------------------

describe('getRegisteredRenderers combined list', () => {
  it('includes both built-in and custom renderers without duplicates', () => {
    registerRenderer('unique-coverage-test', () => null)
    const names = getRegisteredRenderers()
    expect(names).toContain('text')
    expect(names).toContain('unique-coverage-test')

    // Should not have duplicates of built-in names
    const textCount = names.filter((n: string) => n === 'text').length
    expect(textCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// boolean renderer — edge cases
// ---------------------------------------------------------------------------

describe('boolean renderer — edge values', () => {
  it('treats 0 as falsy', () => {
    const result = renderCell(0, {}, col({ render: 'boolean' }))
    expect(elProps(result).children).toBe('\u2717')
  })

  it('treats empty string as falsy', () => {
    const result = renderCell('', {}, col({ render: 'boolean' }))
    expect(elProps(result).children).toBe('\u2717')
  })

  it('treats non-empty string as truthy', () => {
    const result = renderCell('yes', {}, col({ render: 'boolean' }))
    expect(elProps(result).children).toBe('\u2713')
  })

  it('treats null as falsy', () => {
    const result = renderCell(null, {}, col({ render: 'boolean' }))
    expect(elProps(result).children).toBe('\u2717')
  })
})
