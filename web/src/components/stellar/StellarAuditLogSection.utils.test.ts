/**
 * Unit tests for StellarAuditLogSection.utils pure functions.
 * Covers: normalizeText, deriveAuditResult, getResourceLabel, toCsvField,
 * buildCsv, getResultBadgeClassName, getResultRowClassName, exportEntries.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { StellarAuditEntry } from '../../types/stellar'
import {
  normalizeText,
  deriveAuditResult,
  getResourceLabel,
  toCsvField,
  buildCsv,
  exportEntries,
  getResultBadgeClassName,
  getResultRowClassName,
  formatTimestamp,
  AUDIT_FETCH_LIMIT,
  ONE_DAY_MS,
  DATE_RANGE_OPTIONS,
  EXPORT_FILENAME_PREFIX,
  TABLE_SORT_KEYS,
} from './StellarAuditLogSection.utils'

const MS_PER_HOUR = 60 * 60 * 1000
const HOURS_PER_DAY = 24

function makeEntry(overrides: Partial<StellarAuditEntry> = {}): StellarAuditEntry {
  return {
    id: 'audit-1',
    ts: '2026-01-01T00:00:00Z',
    userId: 'alice',
    action: 'approve',
    entityType: 'mission',
    entityId: 'mission-42',
    cluster: 'cluster-a',
    detail: 'looks good',
    ...overrides,
  }
}

describe('constants', () => {
  it('defines expected constant values', () => {
    expect(AUDIT_FETCH_LIMIT).toBe(100)
    expect(ONE_DAY_MS).toBe(HOURS_PER_DAY * MS_PER_HOUR)
    expect(EXPORT_FILENAME_PREFIX).toBe('stellar-audit-log')
    expect(TABLE_SORT_KEYS).toEqual({
      TIMESTAMP: 'ts',
      USER: 'userId',
      ACTION: 'action',
      RESOURCE: 'resource',
      RESULT: 'result',
    })
  })

  it('defines the expected date range options in order', () => {
    expect(DATE_RANGE_OPTIONS.map(o => o.value)).toEqual(['all', '24h', '7d', '30d'])
    expect(DATE_RANGE_OPTIONS[0].windowMs).toBeNull()
    expect(DATE_RANGE_OPTIONS[1].windowMs).toBe(ONE_DAY_MS)
    expect(DATE_RANGE_OPTIONS[2].windowMs).toBe(7 * ONE_DAY_MS)
    expect(DATE_RANGE_OPTIONS[3].windowMs).toBe(30 * ONE_DAY_MS)
  })
})

describe('normalizeText', () => {
  it('lowercases and trims a value', () => {
    expect(normalizeText('  Hello World  ')).toBe('hello world')
  })

  it('returns empty string for undefined input', () => {
    expect(normalizeText(undefined)).toBe('')
  })

  it('returns empty string for empty string input', () => {
    expect(normalizeText('')).toBe('')
  })
})

describe('deriveAuditResult', () => {
  it.each([
    ['fail', 'fail'],
    ['failed', 'failed'],
    ['ERROR', 'ERROR while running'],
    ['reject', 'rejected'],
    ['deny', 'access denied'],
    ['exhausted', 'quota exhausted'],
    ['rollback', 'triggered rollback'],
  ])('classifies %s text as error', (_desc, text) => {
    expect(deriveAuditResult(makeEntry({ action: 'act', detail: text }))).toBe('error')
  })

  it.each([
    ['warn', 'warn: retrying'],
    ['approval', 'pending approval'],
    ['pending', 'pending review'],
    ['review', 'in review'],
    ['snooze', 'user snoozed alert'],
    ['escalate', 'escalation triggered'],
  ])('classifies %s text as warning', (_desc, text) => {
    expect(deriveAuditResult(makeEntry({ action: 'act', detail: text }))).toBe('warning')
  })

  it('classifies neutral text as success', () => {
    expect(deriveAuditResult(makeEntry({ action: 'created', detail: 'all good' }))).toBe('success')
  })

  it('prefers error over warning when both patterns match', () => {
    expect(deriveAuditResult(makeEntry({ action: 'reject', detail: 'pending review' }))).toBe('error')
  })

  it('inspects both action and detail fields', () => {
    expect(deriveAuditResult(makeEntry({ action: 'update', detail: 'ERROR occurred' }))).toBe('error')
    expect(deriveAuditResult(makeEntry({ action: 'ROLLBACK', detail: 'ok' }))).toBe('error')
  })
})

describe('getResourceLabel', () => {
  it('joins entityType and entityId with a slash', () => {
    expect(getResourceLabel(makeEntry({ entityType: 'mission', entityId: 'm-1' }))).toBe('mission/m-1')
  })
})

describe('toCsvField', () => {
  it('wraps a plain value in quotes', () => {
    expect(toCsvField('hello')).toBe('"hello"')
  })

  it('escapes double quotes by doubling them', () => {
    expect(toCsvField('she said "hi"')).toBe('"she said ""hi"""')
  })

  it('preserves commas and newlines inside the quoted field', () => {
    expect(toCsvField('a,b\nc')).toBe('"a,b\nc"')
  })
})

describe('buildCsv', () => {
  const columns = ['Timestamp', 'User', 'Action', 'Resource', 'Result', 'Cluster', 'Detail']
  const getResultLabel = (r: string) => r.toUpperCase()

  it('emits header followed by one row per entry', () => {
    const entries = [
      makeEntry({ id: '1', userId: 'alice', action: 'approve', detail: 'ok' }),
      makeEntry({ id: '2', userId: 'bob', action: 'reject', detail: 'bad' }),
    ]
    const csv = buildCsv(entries, columns, getResultLabel)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe(columns.join(','))
    expect(lines[1]).toContain('"alice"')
    expect(lines[1]).toContain('"SUCCESS"')
    expect(lines[2]).toContain('"bob"')
    expect(lines[2]).toContain('"ERROR"')
  })

  it('returns just a header when no entries are provided', () => {
    expect(buildCsv([], columns, getResultLabel)).toBe(columns.join(','))
  })

  it('substitutes em-dash for missing cluster', () => {
    const csv = buildCsv([makeEntry({ cluster: '' })], columns, getResultLabel)
    expect(csv).toContain('"—"')
  })

  it('escapes embedded quotes in detail fields', () => {
    const csv = buildCsv(
      [makeEntry({ detail: 'contains "quotes"' })],
      columns,
      getResultLabel,
    )
    expect(csv).toContain('"contains ""quotes"""')
  })

  it('tolerates a null/undefined columns argument', () => {
    // @ts-expect-error - exercising the runtime guard `(columns || [])`
    const csv = buildCsv([makeEntry()], undefined, getResultLabel)
    expect(csv.split('\n')[0]).toBe('')
  })
})

describe('getResultBadgeClassName / getResultRowClassName', () => {
  it('returns distinct classes per result kind', () => {
    expect(getResultBadgeClassName('error')).toMatch(/red/)
    expect(getResultBadgeClassName('warning')).toMatch(/yellow/)
    expect(getResultBadgeClassName('success')).toMatch(/green/)

    expect(getResultRowClassName('error')).toMatch(/red/)
    expect(getResultRowClassName('warning')).toMatch(/yellow/)
    expect(getResultRowClassName('success')).toMatch(/green/)
  })

  it('defaults unknown result to success styling', () => {
    // @ts-expect-error - exercising fallthrough branch
    expect(getResultBadgeClassName('mystery')).toMatch(/green/)
    // @ts-expect-error - exercising fallthrough branch
    expect(getResultRowClassName('mystery')).toMatch(/green/)
  })
})

describe('formatTimestamp', () => {
  it('produces a locale-formatted string derived from the ISO input', () => {
    const iso = '2026-01-01T00:00:00Z'
    expect(formatTimestamp(iso)).toBe(new Date(iso).toLocaleString())
  })
})

describe('exportEntries', () => {
  const columns = ['Timestamp', 'User', 'Action', 'Resource', 'Result', 'Cluster', 'Detail']
  const getResultLabel = (r: string) => r

  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let click: ReturnType<typeof vi.fn>
  let createElement: ReturnType<typeof vi.spyOn>
  const anchor: { href: string; download: string; click: () => void } = {
    href: '',
    download: '',
    click: () => {},
  }

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url')
    revokeObjectURL = vi.fn()
    click = vi.fn()
    anchor.href = ''
    anchor.download = ''
    anchor.click = click
    // @ts-expect-error - happy-dom stubs
    globalThis.URL.createObjectURL = createObjectURL
    // @ts-expect-error - happy-dom stubs
    globalThis.URL.revokeObjectURL = revokeObjectURL
    createElement = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'a') return anchor as unknown as HTMLAnchorElement
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag) as unknown as HTMLElement
    }) as typeof document.createElement)
  })

  afterEach(() => {
    createElement.mockRestore()
    vi.useRealTimers()
  })

  it('creates a blob URL, triggers download, and revokes the URL', () => {
    exportEntries([makeEntry()], columns, getResultLabel)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    expect(anchor.href).toBe('blob:mock-url')
  })

  it('names the download file with the audit prefix and current date stamp', () => {
    const fixed = new Date('2026-05-15T10:20:30Z')
    vi.useFakeTimers()
    vi.setSystemTime(fixed)
    exportEntries([makeEntry()], columns, getResultLabel)
    expect(anchor.download).toBe(`${EXPORT_FILENAME_PREFIX}-2026-05-15.csv`)
  })
})
