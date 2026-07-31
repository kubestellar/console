import React from 'react'
import '@testing-library/jest-dom/vitest'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  normalizeComplianceStatus,
  parseCount,
  severityColor,
  statusIcon,
  statusLabel,
  computeSummaryCounts,
} from './helpers'

describe('normalizeComplianceStatus', () => {
  it('maps passing → pass', () => {
    expect(normalizeComplianceStatus('passing')).toBe('pass')
  })

  it('maps failing → fail', () => {
    expect(normalizeComplianceStatus('failing')).toBe('fail')
  })

  it('maps warning and skipped → other', () => {
    expect(normalizeComplianceStatus('warning')).toBe('other')
    expect(normalizeComplianceStatus('skipped')).toBe('other')
  })

  it('passes through unknown statuses unchanged', () => {
    expect(normalizeComplianceStatus('not-applicable')).toBe('not-applicable')
    expect(normalizeComplianceStatus('custom-value')).toBe('custom-value')
  })

  it('returns empty string for undefined or empty input', () => {
    expect(normalizeComplianceStatus(undefined)).toBe('')
    expect(normalizeComplianceStatus('')).toBe('')
  })
})

describe('parseCount', () => {
  it('returns finite numbers as-is', () => {
    expect(parseCount(0)).toBe(0)
    expect(parseCount(42)).toBe(42)
    expect(parseCount(-3)).toBe(-3)
    expect(parseCount(3.14)).toBe(3.14)
  })

  it('rejects non-finite numbers', () => {
    expect(parseCount(Number.NaN)).toBeNull()
    expect(parseCount(Number.POSITIVE_INFINITY)).toBeNull()
    expect(parseCount(Number.NEGATIVE_INFINITY)).toBeNull()
  })

  it('parses numeric strings', () => {
    expect(parseCount('7')).toBe(7)
    expect(parseCount('  12  ')).toBe(12)
    expect(parseCount('-5.5')).toBe(-5.5)
  })

  it('rejects unparseable and empty strings', () => {
    expect(parseCount('')).toBeNull()
    expect(parseCount('   ')).toBeNull()
    expect(parseCount('abc')).toBeNull()
    expect(parseCount('12abc')).toBeNull()
  })

  it('rejects non-number, non-string values', () => {
    expect(parseCount(null)).toBeNull()
    expect(parseCount(undefined)).toBeNull()
    expect(parseCount({})).toBeNull()
    expect(parseCount([])).toBeNull()
    expect(parseCount(true)).toBeNull()
  })
})

describe('severityColor', () => {
  it('returns distinct classes per known severity', () => {
    const critical = severityColor('critical')
    const high = severityColor('high')
    const medium = severityColor('medium')
    const low = severityColor('low')
    expect(critical).toContain('text-red-400')
    expect(high).toContain('text-orange-400')
    expect(medium).toContain('text-yellow-400')
    expect(low).toContain('text-blue-400')
    // All classes should be unique
    expect(new Set([critical, high, medium, low]).size).toBe(4)
  })

  it('falls back to muted class for unknown/undefined severity', () => {
    expect(severityColor(undefined)).toContain('text-muted-foreground')
    expect(severityColor('bogus')).toContain('text-muted-foreground')
    expect(severityColor('')).toContain('text-muted-foreground')
  })
})

describe('statusIcon', () => {
  const renderIcon = (status: string) => {
    const { container } = render(<>{statusIcon(status)}</>)
    return container.querySelector('svg')
  }

  it('renders a green icon for pass', () => {
    const svg = renderIcon('pass')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('class') || '').toContain('text-green-400')
  })

  it('renders a red icon for fail', () => {
    const svg = renderIcon('fail')
    expect(svg?.getAttribute('class') || '').toContain('text-red-400')
  })

  it('renders a yellow icon for other', () => {
    const svg = renderIcon('other')
    expect(svg?.getAttribute('class') || '').toContain('text-yellow-400')
  })

  it('renders a muted icon for not-applicable', () => {
    const svg = renderIcon('not-applicable')
    expect(svg?.getAttribute('class') || '').toContain('text-muted-foreground')
  })

  it('renders a muted icon for unknown status', () => {
    const svg = renderIcon('mystery')
    expect(svg?.getAttribute('class') || '').toContain('text-muted-foreground')
  })
})

describe('statusLabel', () => {
  it('returns human-readable labels for known statuses', () => {
    expect(statusLabel('pass')).toBe('Pass')
    expect(statusLabel('fail')).toBe('Fail')
    expect(statusLabel('other')).toBe('Other')
    expect(statusLabel('not-applicable')).toBe('N/A')
  })

  it('returns the input verbatim for unknown statuses', () => {
    expect(statusLabel('custom')).toBe('custom')
    expect(statusLabel('')).toBe('')
  })
})

describe('computeSummaryCounts', () => {
  it('sets hasProvidedSummary=false and zeros when no fields are provided', () => {
    expect(computeSummaryCounts({})).toEqual({
      hasProvidedSummary: false,
      passing: 0,
      failing: 0,
      other: 0,
      total: 0,
    })
  })

  it('flags hasProvidedSummary=true when any recognized field is present', () => {
    expect(computeSummaryCounts({ passing: 3 }).hasProvidedSummary).toBe(true)
    expect(computeSummaryCounts({ failing: 1 }).hasProvidedSummary).toBe(true)
    expect(computeSummaryCounts({ warning: 2 }).hasProvidedSummary).toBe(true)
    expect(computeSummaryCounts({ totalChecks: 10 }).hasProvidedSummary).toBe(true)
  })

  it('derives total from passing + failing + other when totalChecks is missing', () => {
    const result = computeSummaryCounts({ passing: 3, failing: 2, warning: 1 })
    expect(result).toEqual({
      hasProvidedSummary: true,
      passing: 3,
      failing: 2,
      other: 1,
      total: 6,
    })
  })

  it('derives other from totalChecks when explicit warning is absent', () => {
    const result = computeSummaryCounts({ passing: 4, failing: 1, totalChecks: 10 })
    expect(result.other).toBe(5)
    expect(result.total).toBe(10)
  })

  it('clamps derived other at zero when the arithmetic would go negative', () => {
    const result = computeSummaryCounts({ passing: 6, failing: 6, totalChecks: 10 })
    expect(result.other).toBe(0)
    expect(result.total).toBe(10)
  })

  it('prefers explicit warning over derived value when both are present', () => {
    const result = computeSummaryCounts({
      passing: 1,
      failing: 1,
      warning: 7,
      totalChecks: 10,
    })
    expect(result.other).toBe(7)
    expect(result.total).toBe(10)
  })

  it('accepts numeric strings for all fields', () => {
    const result = computeSummaryCounts({
      passing: '3',
      failing: '2',
      warning: '1',
      totalChecks: '6',
    })
    expect(result).toEqual({
      hasProvidedSummary: true,
      passing: 3,
      failing: 2,
      other: 1,
      total: 6,
    })
  })

  it('ignores unparseable values as if absent', () => {
    const result = computeSummaryCounts({
      passing: 'nope',
      failing: null,
      warning: {},
      totalChecks: undefined,
    })
    expect(result).toEqual({
      hasProvidedSummary: false,
      passing: 0,
      failing: 0,
      other: 0,
      total: 0,
    })
  })
})
