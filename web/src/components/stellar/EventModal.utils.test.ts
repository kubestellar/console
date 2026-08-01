import { describe, expect, it, afterEach, vi } from 'vitest'
import type { StellarNotification, StellarSolve } from '../../types/stellar'
import {
  buildInvestigatePrompt,
  extractResourceName,
  formatAbsoluteUtc,
  formatRelative,
  getErrorMessage,
  matchesSolve,
  severityColor,
  statusLabel,
} from './EventModal.utils'

function makeNotification(overrides: Partial<StellarNotification> = {}): StellarNotification {
  return {
    id: 'evt-1',
    type: 'event',
    severity: 'info',
    title: 'Something happened',
    body: 'body',
    read: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeSolve(overrides: Partial<StellarSolve> = {}): StellarSolve {
  return {
    id: 'solve-1',
    eventId: 'evt-1',
    userId: 'user-1',
    cluster: 'cluster-a',
    namespace: 'ns-a',
    workload: 'nginx',
    status: 'running',
    actionsTaken: 0,
    summary: '',
    startedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('EventModal.utils', () => {
  describe('severityColor', () => {
    it('returns critical color for critical severity', () => {
      expect(severityColor('critical')).toBe('var(--s-critical)')
    })

    it('returns warning color for warning severity', () => {
      expect(severityColor('warning')).toBe('var(--s-warning)')
    })

    it('returns info color for info severity', () => {
      expect(severityColor('info')).toBe('var(--s-info)')
    })

    it('returns info color for unknown severity', () => {
      expect(severityColor('unknown-value')).toBe('var(--s-info)')
    })
  })

  describe('statusLabel', () => {
    it.each([
      ['investigating', 'Investigating'],
      ['resolved', 'Resolved'],
      ['dismissed', 'Removed'],
      ['exhausted', 'Paused'],
      ['open', 'Open'],
      ['escalated', 'Escalated'],
    ])('maps %s → %s', (input, expected) => {
      expect(statusLabel(input)).toBe(expected)
    })

    it('returns Escalated for undefined', () => {
      expect(statusLabel(undefined)).toBe('Escalated')
    })

    it('returns Escalated for unknown status', () => {
      expect(statusLabel('some-other-status')).toBe('Escalated')
    })
  })

  describe('extractResourceName', () => {
    it('returns empty string when dedupeKey is missing', () => {
      expect(extractResourceName(makeNotification())).toBe('')
    })

    it('extracts resource name when dedupeKey starts with ev prefix', () => {
      const n = makeNotification({ dedupeKey: 'ev:cluster:namespace:nginx-abc:extra' })
      expect(extractResourceName(n)).toBe('nginx-abc')
    })

    it('extracts resource name when dedupeKey has no ev prefix', () => {
      const n = makeNotification({ dedupeKey: 'cluster:namespace:nginx-xyz' })
      expect(extractResourceName(n)).toBe('nginx-xyz')
    })

    it('returns empty string when dedupeKey has too few parts', () => {
      expect(extractResourceName(makeNotification({ dedupeKey: 'ev:cluster' }))).toBe('')
      expect(extractResourceName(makeNotification({ dedupeKey: 'cluster:ns' }))).toBe('')
    })
  })

  describe('formatAbsoluteUtc', () => {
    it('returns Unavailable for undefined', () => {
      expect(formatAbsoluteUtc(undefined)).toBe('Unavailable')
    })

    it('returns Unavailable for empty string', () => {
      expect(formatAbsoluteUtc('')).toBe('Unavailable')
    })

    it('returns Unavailable for invalid date', () => {
      expect(formatAbsoluteUtc('not-a-date')).toBe('Unavailable')
    })

    it('formats valid ISO date in UTC with UTC suffix', () => {
      const result = formatAbsoluteUtc('2026-06-15T14:30:45Z')
      expect(result).toContain('UTC')
      expect(result).toContain('2026')
      expect(result).toContain('Jun')
      expect(result).toContain('15')
      expect(result).toContain('14:30:45')
    })
  })

  describe('formatRelative', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns "just now" for undefined value', () => {
      expect(formatRelative(undefined)).toBe('just now')
    })

    it('returns "just now" for value less than a minute ago', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      expect(formatRelative('2026-06-15T11:59:30Z')).toBe('just now')
    })

    it('returns minutes for value less than an hour ago', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      expect(formatRelative('2026-06-15T11:45:00Z')).toBe('15m ago')
    })

    it('returns hours for value less than a day ago', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      expect(formatRelative('2026-06-15T09:00:00Z')).toBe('3h ago')
    })

    it('returns days for value 1 day or more ago', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      expect(formatRelative('2026-06-10T12:00:00Z')).toBe('5d ago')
    })
  })

  describe('buildInvestigatePrompt', () => {
    it('includes only title when cluster and namespace are absent', () => {
      const prompt = buildInvestigatePrompt(makeNotification({ title: 'Pod crash' }))
      expect(prompt).toBe(
        'Investigate Pod crash. Pull logs, related events, retry history, and summarize the likely root cause.',
      )
    })

    it('includes cluster when present', () => {
      const prompt = buildInvestigatePrompt(
        makeNotification({ title: 'Pod crash', cluster: 'prod' }),
      )
      expect(prompt).toContain('Investigate Pod crash on cluster prod.')
    })

    it('includes namespace when present', () => {
      const prompt = buildInvestigatePrompt(
        makeNotification({ title: 'Pod crash', namespace: 'default' }),
      )
      expect(prompt).toContain('Investigate Pod crash in namespace default.')
    })

    it('includes both cluster and namespace when present', () => {
      const prompt = buildInvestigatePrompt(
        makeNotification({ title: 'Pod crash', cluster: 'prod', namespace: 'default' }),
      )
      expect(prompt).toContain('on cluster prod')
      expect(prompt).toContain('in namespace default')
    })
  })

  describe('matchesSolve', () => {
    it('returns false when clusters differ', () => {
      const n = makeNotification({ cluster: 'a', namespace: 'ns' })
      const s = makeSolve({ cluster: 'b', namespace: 'ns' })
      expect(matchesSolve(n, s)).toBe(false)
    })

    it('returns false when namespaces differ', () => {
      const n = makeNotification({ cluster: 'a', namespace: 'x' })
      const s = makeSolve({ cluster: 'a', namespace: 'y' })
      expect(matchesSolve(n, s)).toBe(false)
    })

    it('treats missing cluster/namespace on notification as empty string', () => {
      const n = makeNotification()
      const s = makeSolve({ cluster: '', namespace: '', eventId: 'evt-1' })
      expect(matchesSolve(n, s)).toBe(true)
    })

    it('falls back to id match when notification has no resource name', () => {
      const n = makeNotification({ id: 'evt-1', cluster: 'a', namespace: 'ns' })
      const s = makeSolve({ cluster: 'a', namespace: 'ns', eventId: 'evt-1' })
      expect(matchesSolve(n, s)).toBe(true)
    })

    it('returns false via id-fallback when ids do not match', () => {
      const n = makeNotification({ id: 'evt-2', cluster: 'a', namespace: 'ns' })
      const s = makeSolve({ cluster: 'a', namespace: 'ns', eventId: 'evt-1' })
      expect(matchesSolve(n, s)).toBe(false)
    })

    it('matches when resource name starts with solve workload', () => {
      const n = makeNotification({
        cluster: 'a',
        namespace: 'ns',
        dedupeKey: 'ev:a:ns:nginx-abc123',
      })
      const s = makeSolve({ cluster: 'a', namespace: 'ns', workload: 'nginx' })
      expect(matchesSolve(n, s)).toBe(true)
    })

    it('matches when solve workload equals resource name', () => {
      const n = makeNotification({
        cluster: 'a',
        namespace: 'ns',
        dedupeKey: 'ev:a:ns:nginx',
      })
      const s = makeSolve({ cluster: 'a', namespace: 'ns', workload: 'nginx' })
      expect(matchesSolve(n, s)).toBe(true)
    })

    it('returns false when resource name does not match workload', () => {
      const n = makeNotification({
        cluster: 'a',
        namespace: 'ns',
        dedupeKey: 'ev:a:ns:redis',
      })
      const s = makeSolve({ cluster: 'a', namespace: 'ns', workload: 'nginx' })
      expect(matchesSolve(n, s)).toBe(false)
    })
  })

  describe('getErrorMessage', () => {
    it('extracts response.data.error from axios-style errors', () => {
      const err = { response: { data: { error: 'API failure' } } }
      expect(getErrorMessage(err, 'fallback')).toBe('API failure')
    })

    it('returns Error.message when instance of Error', () => {
      expect(getErrorMessage(new Error('boom'), 'fallback')).toBe('boom')
    })

    it('returns fallback for null/undefined/string', () => {
      expect(getErrorMessage(null, 'fallback')).toBe('fallback')
      expect(getErrorMessage(undefined, 'fallback')).toBe('fallback')
      expect(getErrorMessage('some string', 'fallback')).toBe('fallback')
    })

    it('returns fallback when response.data.error is missing', () => {
      expect(getErrorMessage({ response: { data: {} } }, 'fallback')).toBe('fallback')
      expect(getErrorMessage({ response: {} }, 'fallback')).toBe('fallback')
    })

    it('returns fallback when Error.message is empty', () => {
      expect(getErrorMessage(new Error(''), 'fallback')).toBe('fallback')
    })
  })
})
