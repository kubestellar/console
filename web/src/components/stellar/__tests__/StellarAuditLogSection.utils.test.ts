import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { StellarAuditEntry } from '../../../types/stellar'
import {
  formatTimestamp,
  normalizeText,
  deriveAuditResult,
  getResourceLabel,
  toCsvField,
  buildCsv,
  exportEntries,
  getResultBadgeClassName,
  getResultRowClassName,
  AUDIT_FETCH_LIMIT,
  ONE_DAY_MS,
  DATE_RANGE_OPTIONS,
  EXPORT_FILENAME_PREFIX,
  TABLE_SORT_KEYS,
} from '../StellarAuditLogSection.utils'

function entry(overrides: Partial<StellarAuditEntry> = {}): StellarAuditEntry {
  return {
    id: overrides.id ?? 'e1',
    ts: overrides.ts ?? '2026-05-01T12:00:00Z',
    userId: overrides.userId ?? 'alice',
    action: overrides.action ?? 'update',
    entityType: overrides.entityType ?? 'deployment',
    entityId: overrides.entityId ?? 'nginx',
    cluster: overrides.cluster ?? 'prod',
    detail: overrides.detail ?? '',
    ...overrides,
  }
}

// ─── constants ───────────────────────────────────────────────────────────────

describe('StellarAuditLogSection.utils constants', () => {
  it('exposes numeric AUDIT_FETCH_LIMIT and ONE_DAY_MS', () => {
    expect(AUDIT_FETCH_LIMIT).toBe(100)
    expect(ONE_DAY_MS).toBe(86_400_000)
  })

  it('lists date-range options with correct window sizes', () => {
    expect(DATE_RANGE_OPTIONS.map((o) => o.value)).toEqual(['all', '24h', '7d', '30d'])
    expect(DATE_RANGE_OPTIONS.find((o) => o.value === 'all')!.windowMs).toBeNull()
    expect(DATE_RANGE_OPTIONS.find((o) => o.value === '24h')!.windowMs).toBe(ONE_DAY_MS)
    expect(DATE_RANGE_OPTIONS.find((o) => o.value === '7d')!.windowMs).toBe(7 * ONE_DAY_MS)
    expect(DATE_RANGE_OPTIONS.find((o) => o.value === '30d')!.windowMs).toBe(30 * ONE_DAY_MS)
  })

  it('exposes EXPORT_FILENAME_PREFIX and TABLE_SORT_KEYS', () => {
    expect(EXPORT_FILENAME_PREFIX).toBe('stellar-audit-log')
    expect(TABLE_SORT_KEYS).toEqual({
      TIMESTAMP: 'ts',
      USER: 'userId',
      ACTION: 'action',
      RESOURCE: 'resource',
      RESULT: 'result',
    })
  })
})

// ─── formatTimestamp / normalizeText ─────────────────────────────────────────

describe('formatTimestamp', () => {
  it('formats a valid ISO date via toLocaleString', () => {
    const expected = new Date('2026-05-01T12:00:00Z').toLocaleString()
    expect(formatTimestamp('2026-05-01T12:00:00Z')).toBe(expected)
  })

  it('returns "Invalid Date" (via Date behavior) for garbage input', () => {
    // Date parsing failure results in Invalid Date; toLocaleString returns this
    // consistent sentinel across engines.
    expect(formatTimestamp('not-a-date')).toBe(new Date('not-a-date').toLocaleString())
  })
})

describe('normalizeText', () => {
  it('lowercases and trims', () => {
    expect(normalizeText('  Hello World  ')).toBe('hello world')
  })
  it('returns empty string for undefined/empty', () => {
    expect(normalizeText(undefined)).toBe('')
    expect(normalizeText('')).toBe('')
  })
})

// ─── deriveAuditResult ───────────────────────────────────────────────────────

describe('deriveAuditResult', () => {
  it.each([
    ['fail', 'error'],
    ['error', 'error'],
    ['reject', 'error'],
    ['deny', 'error'],
    ['denied', 'error'],
    ['exhausted', 'error'],
    ['rollback', 'error'],
  ])('detects error keyword "%s"', (keyword, expected) => {
    expect(deriveAuditResult(entry({ action: keyword, detail: '' }))).toBe(expected)
    expect(deriveAuditResult(entry({ action: 'update', detail: `something ${keyword}` }))).toBe(expected)
  })

  it.each([
    ['warn',    'warning'],
    ['approval','warning'],
    ['pending', 'warning'],
    ['review',  'warning'],
    ['snooze',  'warning'],
    ['escalated','warning'],
  ])('detects warning keyword "%s"', (keyword, expected) => {
    expect(deriveAuditResult(entry({ detail: keyword }))).toBe(expected)
  })

  it('returns success when no error/warning keyword matches', () => {
    expect(deriveAuditResult(entry({ action: 'apply', detail: 'all good' }))).toBe('success')
  })

  it('gives error precedence over warning when both keywords appear', () => {
    // "failed after approval" contains both "fail" (error) and "approval" (warning).
    expect(deriveAuditResult(entry({ action: 'update', detail: 'failed after approval' }))).toBe('error')
  })

  it('is case-insensitive on the combined action+detail text', () => {
    expect(deriveAuditResult(entry({ action: 'ROLLBACK', detail: '' }))).toBe('error')
    expect(deriveAuditResult(entry({ action: 'update', detail: 'WARN: threshold hit' }))).toBe('warning')
  })
})

// ─── getResourceLabel ────────────────────────────────────────────────────────

describe('getResourceLabel', () => {
  it('formats as entityType/entityId', () => {
    expect(getResourceLabel(entry({ entityType: 'pod', entityId: 'nginx-abc' }))).toBe('pod/nginx-abc')
  })
})

// ─── toCsvField ──────────────────────────────────────────────────────────────

describe('toCsvField', () => {
  it('wraps values in double-quotes', () => {
    expect(toCsvField('hello')).toBe('"hello"')
  })
  it('escapes embedded double-quotes by doubling them', () => {
    expect(toCsvField('a "quoted" b')).toBe('"a ""quoted"" b"')
  })
  it('preserves commas and newlines inside the quoted field', () => {
    expect(toCsvField('a,b\nc')).toBe('"a,b\nc"')
  })
  it('handles empty string', () => {
    expect(toCsvField('')).toBe('""')
  })
})

// ─── buildCsv ────────────────────────────────────────────────────────────────

describe('buildCsv', () => {
  const getResultLabel = (r: 'success' | 'warning' | 'error') => r.toUpperCase()

  it('emits header row and one data row per entry', () => {
    const columns = ['Timestamp', 'User', 'Action', 'Resource', 'Result', 'Cluster', 'Detail']
    const csv = buildCsv(
      [entry({ id: 'a', ts: '2026-01-01T00:00:00Z', userId: 'u', action: 'apply', entityType: 'dep', entityId: 'x', cluster: 'c1', detail: 'ok' })],
      columns,
      getResultLabel,
    )
    const lines = csv.split('\n')
    expect(lines[0]).toBe(columns.join(','))
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('"u"')
    expect(lines[1]).toContain('"apply"')
    expect(lines[1]).toContain('"dep/x"')
    expect(lines[1]).toContain('"SUCCESS"')
    expect(lines[1]).toContain('"c1"')
    expect(lines[1]).toContain('"ok"')
  })

  it('renders em-dash for missing cluster', () => {
    const csv = buildCsv(
      [entry({ cluster: '' })],
      ['col'],
      getResultLabel,
    )
    // The em-dash placeholder appears as a quoted field somewhere in the row
    expect(csv).toContain('"—"')
  })

  it('escapes double-quotes in detail via toCsvField', () => {
    const csv = buildCsv(
      [entry({ detail: 'said "hi"' })],
      ['col'],
      getResultLabel,
    )
    expect(csv).toContain('"said ""hi"""')
  })

  it('yields only a header row for an empty entries array', () => {
    const csv = buildCsv([], ['A', 'B'], getResultLabel)
    expect(csv).toBe('A,B')
  })

  it('tolerates a null columns argument (defaults to empty header)', () => {
    const csv = buildCsv([], null as unknown as readonly string[], getResultLabel)
    expect(csv).toBe('')
  })
})

// ─── exportEntries ───────────────────────────────────────────────────────────

describe('exportEntries', () => {
  const getResultLabel = (r: 'success' | 'warning' | 'error') => r

  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let clickSpy: ReturnType<typeof vi.fn>
  let originalCreateElement: typeof document.createElement

  beforeEach(() => {
    createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    revokeObjectURL = vi.fn()
    // JSDOM lacks URL.createObjectURL / revokeObjectURL by default
    Object.assign(URL, { createObjectURL, revokeObjectURL })

    clickSpy = vi.fn()
    originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag) as HTMLAnchorElement
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: clickSpy })
      }
      return el
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // @ts-expect-error runtime cleanup
    delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL
    // @ts-expect-error runtime cleanup
    delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL
  })

  it('creates a blob, triggers a download, and revokes the URL', () => {
    exportEntries([entry()], ['A'], getResultLabel)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('names the file with the EXPORT_FILENAME_PREFIX and a YYYY-MM-DD stamp', () => {
    let capturedAnchor: HTMLAnchorElement | null = null
    ;(document.createElement as ReturnType<typeof vi.spyOn>).mockImplementation(
      (tag: string) => {
        const el = originalCreateElement(tag) as HTMLAnchorElement
        if (tag === 'a') {
          Object.defineProperty(el, 'click', { value: clickSpy })
          capturedAnchor = el
        }
        return el
      },
    )
    exportEntries([entry()], ['A'], getResultLabel)
    expect(capturedAnchor).not.toBeNull()
    expect(capturedAnchor!.download).toMatch(
      new RegExp(`^${EXPORT_FILENAME_PREFIX}-\\d{4}-\\d{2}-\\d{2}\\.csv$`),
    )
  })
})

// ─── getResultBadgeClassName / getResultRowClassName ─────────────────────────

describe('getResultBadgeClassName', () => {
  it('returns distinct classes for each result', () => {
    const err = getResultBadgeClassName('error')
    const warn = getResultBadgeClassName('warning')
    const ok = getResultBadgeClassName('success')
    expect(err).toContain('red')
    expect(warn).toContain('yellow')
    expect(ok).toContain('green')
    expect(new Set([err, warn, ok]).size).toBe(3)
  })

  it('falls back to success classes for unknown result', () => {
    expect(getResultBadgeClassName('bogus' as 'success')).toBe(getResultBadgeClassName('success'))
  })
})

describe('getResultRowClassName', () => {
  it('returns distinct row classes per result', () => {
    expect(getResultRowClassName('error')).toContain('red')
    expect(getResultRowClassName('warning')).toContain('yellow')
    expect(getResultRowClassName('success')).toContain('green')
  })

  it('falls back to success row class for unknown result', () => {
    expect(getResultRowClassName('bogus' as 'success')).toBe(getResultRowClassName('success'))
  })
})
