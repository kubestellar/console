import { describe, it, expect } from 'vitest'
import type { StellarNotification, StellarSolve } from '../../../types/stellar'
import {
  severityColor,
  statusLabel,
  extractResourceName,
  formatAbsoluteUtc,
  formatRelative,
  buildInvestigatePrompt,
  matchesSolve,
  getErrorMessage,
  RELATED_EVENT_LIMIT,
  TIMELINE_ENTRY_LIMIT,
  INVESTIGATION_ACTIVITY_LIMIT,
  INVESTIGATION_TEXTAREA_ROWS,
  CONFIRMATION_TEXTAREA_ROWS,
} from '../EventModal.utils'

function notification(overrides: Partial<StellarNotification> = {}): StellarNotification {
  return {
    id: overrides.id ?? 'n1',
    type: overrides.type ?? 'event',
    severity: overrides.severity ?? 'info',
    title: overrides.title ?? 'Untitled',
    body: overrides.body ?? '',
    read: overrides.read ?? false,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
    ...overrides,
  } as StellarNotification
}

function solve(overrides: Partial<StellarSolve> = {}): StellarSolve {
  return {
    id: overrides.id ?? 's1',
    eventId: overrides.eventId ?? 'e1',
    userId: overrides.userId ?? 'u1',
    cluster: overrides.cluster ?? 'c1',
    namespace: overrides.namespace ?? 'ns1',
    workload: overrides.workload ?? 'w1',
    status: overrides.status ?? 'running',
    actionsTaken: overrides.actionsTaken ?? 0,
    summary: overrides.summary ?? '',
    startedAt: overrides.startedAt ?? '2026-01-01T00:00:00Z',
    ...overrides,
  } as StellarSolve
}

// ─── constants ───────────────────────────────────────────────────────────────

describe('EventModal.utils constants', () => {
  it('exposes expected numeric limits', () => {
    expect(RELATED_EVENT_LIMIT).toBe(6)
    expect(TIMELINE_ENTRY_LIMIT).toBe(8)
    expect(INVESTIGATION_ACTIVITY_LIMIT).toBe(6)
    expect(INVESTIGATION_TEXTAREA_ROWS).toBe(3)
    expect(CONFIRMATION_TEXTAREA_ROWS).toBe(4)
  })
})

// ─── severityColor ───────────────────────────────────────────────────────────

describe('severityColor', () => {
  it('returns critical color for critical severity', () => {
    expect(severityColor('critical')).toBe('var(--s-critical)')
  })
  it('returns warning color for warning severity', () => {
    expect(severityColor('warning')).toBe('var(--s-warning)')
  })
  it('falls back to info color for info severity', () => {
    expect(severityColor('info')).toBe('var(--s-info)')
  })
  it('falls back to info color for unknown severity', () => {
    expect(severityColor('unknown-value')).toBe('var(--s-info)')
    expect(severityColor('')).toBe('var(--s-info)')
  })
})

// ─── statusLabel ─────────────────────────────────────────────────────────────

describe('statusLabel', () => {
  it.each([
    ['investigating', 'Investigating'],
    ['resolved', 'Resolved'],
    ['dismissed', 'Removed'],
    ['exhausted', 'Paused'],
    ['open', 'Open'],
    ['escalated', 'Escalated'],
  ])('maps %s to %s', (input, expected) => {
    expect(statusLabel(input)).toBe(expected)
  })

  it('defaults to Escalated for unknown status', () => {
    expect(statusLabel('bogus')).toBe('Escalated')
  })

  it('defaults to Escalated when status is undefined', () => {
    expect(statusLabel(undefined)).toBe('Escalated')
  })
})

// ─── extractResourceName ─────────────────────────────────────────────────────

describe('extractResourceName', () => {
  it('returns empty string when dedupeKey is absent', () => {
    expect(extractResourceName(notification())).toBe('')
  })

  it('parses ev-prefixed dedupeKey (ev:cluster:ns:name)', () => {
    expect(
      extractResourceName(notification({ dedupeKey: 'ev:prod:kube-system:coredns' })),
    ).toBe('coredns')
  })

  it('parses non-ev dedupeKey (cluster:ns:name)', () => {
    expect(
      extractResourceName(notification({ dedupeKey: 'prod:kube-system:coredns' })),
    ).toBe('coredns')
  })

  it('returns empty when dedupeKey has too few segments', () => {
    expect(extractResourceName(notification({ dedupeKey: 'ev:only' }))).toBe('')
    expect(extractResourceName(notification({ dedupeKey: 'a:b' }))).toBe('')
  })
})

// ─── formatAbsoluteUtc ───────────────────────────────────────────────────────

describe('formatAbsoluteUtc', () => {
  it('returns Unavailable for undefined input', () => {
    expect(formatAbsoluteUtc(undefined)).toBe('Unavailable')
  })

  it('returns Unavailable for empty string', () => {
    expect(formatAbsoluteUtc('')).toBe('Unavailable')
  })

  it('returns Unavailable for invalid date string', () => {
    expect(formatAbsoluteUtc('not-a-date')).toBe('Unavailable')
  })

  it('formats a valid ISO date as UTC and suffixes " UTC"', () => {
    const out = formatAbsoluteUtc('2026-03-15T04:05:06Z')
    expect(out.endsWith(' UTC')).toBe(true)
    // Deterministic components (locale/CI-independent digits)
    expect(out).toMatch(/\b2026\b/)
    expect(out).toMatch(/04:05:06/)
  })
})

// ─── formatRelative ──────────────────────────────────────────────────────────

describe('formatRelative', () => {
  it('returns "just now" for undefined', () => {
    expect(formatRelative(undefined)).toBe('just now')
  })

  it('returns "just now" for a timestamp <1 minute ago', () => {
    const now = Date.now()
    expect(formatRelative(new Date(now - 30 * 1000).toISOString())).toBe('just now')
  })

  it('returns Nm ago for minutes up to 59', () => {
    const now = Date.now()
    expect(formatRelative(new Date(now - 5 * 60 * 1000 - 500).toISOString())).toBe('5m ago')
    expect(formatRelative(new Date(now - 59 * 60 * 1000 - 500).toISOString())).toBe('59m ago')
  })

  it('returns Nh ago for hours up to 23', () => {
    const now = Date.now()
    expect(formatRelative(new Date(now - 3 * 3600 * 1000 - 500).toISOString())).toBe('3h ago')
    expect(formatRelative(new Date(now - 23 * 3600 * 1000 - 500).toISOString())).toBe('23h ago')
  })

  it('returns Nd ago for anything ≥24 hours', () => {
    const now = Date.now()
    expect(formatRelative(new Date(now - 24 * 3600 * 1000 - 500).toISOString())).toBe('1d ago')
    expect(formatRelative(new Date(now - 7 * 24 * 3600 * 1000 - 500).toISOString())).toBe('7d ago')
  })
})

// ─── buildInvestigatePrompt ──────────────────────────────────────────────────

describe('buildInvestigatePrompt', () => {
  it('includes cluster and namespace when both present', () => {
    const p = buildInvestigatePrompt(
      notification({ title: 'CrashLoop', cluster: 'prod', namespace: 'default' }),
    )
    expect(p).toContain('Investigate CrashLoop')
    expect(p).toContain('on cluster prod')
    expect(p).toContain('in namespace default')
  })

  it('omits cluster suffix when cluster is missing', () => {
    const p = buildInvestigatePrompt(notification({ title: 'X', namespace: 'ns' }))
    expect(p).not.toContain('on cluster')
    expect(p).toContain('in namespace ns')
  })

  it('omits namespace suffix when namespace is missing', () => {
    const p = buildInvestigatePrompt(notification({ title: 'X', cluster: 'c' }))
    expect(p).toContain('on cluster c')
    expect(p).not.toContain('in namespace')
  })

  it('omits both suffixes when neither cluster nor namespace is set', () => {
    const p = buildInvestigatePrompt(notification({ title: 'X' }))
    expect(p.startsWith('Investigate X.')).toBe(true)
  })
})

// ─── matchesSolve ────────────────────────────────────────────────────────────

describe('matchesSolve', () => {
  it('returns false when cluster differs', () => {
    expect(
      matchesSolve(
        notification({ cluster: 'a', namespace: 'ns', dedupeKey: 'ev:a:ns:foo' }),
        solve({ cluster: 'b', namespace: 'ns', workload: 'foo' }),
      ),
    ).toBe(false)
  })

  it('returns false when namespace differs', () => {
    expect(
      matchesSolve(
        notification({ cluster: 'a', namespace: 'ns1', dedupeKey: 'ev:a:ns1:foo' }),
        solve({ cluster: 'a', namespace: 'ns2', workload: 'foo' }),
      ),
    ).toBe(false)
  })

  it('treats missing notification.cluster/namespace as empty string', () => {
    // solve.cluster='' & solve.namespace='' should match a notification without those fields
    expect(
      matchesSolve(
        notification({ id: 'evx' }),
        solve({ cluster: '', namespace: '', workload: 'anything', eventId: 'evx' }),
      ),
    ).toBe(true)
  })

  it('falls back to id === eventId when dedupeKey does not yield a resource name', () => {
    expect(
      matchesSolve(
        notification({ id: 'ev-42', cluster: 'a', namespace: 'ns' }),
        solve({ cluster: 'a', namespace: 'ns', workload: 'ignored', eventId: 'ev-42' }),
      ),
    ).toBe(true)
    expect(
      matchesSolve(
        notification({ id: 'ev-42', cluster: 'a', namespace: 'ns' }),
        solve({ cluster: 'a', namespace: 'ns', workload: 'ignored', eventId: 'other' }),
      ),
    ).toBe(false)
  })

  it('matches when resource name starts with the workload', () => {
    expect(
      matchesSolve(
        notification({ cluster: 'a', namespace: 'ns', dedupeKey: 'ev:a:ns:myapp-abc123' }),
        solve({ cluster: 'a', namespace: 'ns', workload: 'myapp' }),
      ),
    ).toBe(true)
  })

  it('matches when workload equals the resource name exactly', () => {
    expect(
      matchesSolve(
        notification({ cluster: 'a', namespace: 'ns', dedupeKey: 'ev:a:ns:coredns' }),
        solve({ cluster: 'a', namespace: 'ns', workload: 'coredns' }),
      ),
    ).toBe(true)
  })

  it('does not match on suffix-only workload substrings', () => {
    expect(
      matchesSolve(
        notification({ cluster: 'a', namespace: 'ns', dedupeKey: 'ev:a:ns:coredns' }),
        solve({ cluster: 'a', namespace: 'ns', workload: 'dns' }),
      ),
    ).toBe(false)
  })
})

// ─── getErrorMessage ─────────────────────────────────────────────────────────

describe('getErrorMessage', () => {
  it('returns fallback for null/undefined/primitive input', () => {
    expect(getErrorMessage(null, 'fb')).toBe('fb')
    expect(getErrorMessage(undefined, 'fb')).toBe('fb')
    expect(getErrorMessage(42, 'fb')).toBe('fb')
    expect(getErrorMessage('str', 'fb')).toBe('fb')
  })

  it('extracts axios-shaped response.data.error before falling back', () => {
    const err = { response: { data: { error: 'server rejected' } } }
    expect(getErrorMessage(err, 'fb')).toBe('server rejected')
  })

  it('returns Error.message when input is an Error instance', () => {
    expect(getErrorMessage(new Error('boom'), 'fb')).toBe('boom')
  })

  it('returns fallback when Error.message is empty', () => {
    expect(getErrorMessage(new Error(''), 'fb')).toBe('fb')
  })

  it('returns fallback when response.data.error is absent', () => {
    expect(getErrorMessage({ response: { data: {} } }, 'fb')).toBe('fb')
    expect(getErrorMessage({ response: {} }, 'fb')).toBe('fb')
    expect(getErrorMessage({ notResponse: true }, 'fb')).toBe('fb')
  })
})
