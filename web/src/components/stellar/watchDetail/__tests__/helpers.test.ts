import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { StellarNotification, StellarWatch } from '../../../../types/stellar'
import {
  EVENT_TIMELINE_LIMIT,
  STALE_THRESHOLD_MS,
  RECURRING_EVENT_THRESHOLD,
  FREQUENCY_WINDOW_HOURS,
  WATCH_TIMELINE_TIMESTAMP_STYLE,
  severityColor,
  deploymentNameFromPodName,
  formatRelative,
  formatDuration,
  matchesWatch,
  footerBtn,
} from '../helpers'

describe('watchDetail/helpers — constants', () => {
  it('exposes stable constant values', () => {
    expect(EVENT_TIMELINE_LIMIT).toBe(10)
    expect(STALE_THRESHOLD_MS).toBe(10 * 60 * 1000)
    expect(RECURRING_EVENT_THRESHOLD).toBe(3)
    expect(FREQUENCY_WINDOW_HOURS).toBe(24)
  })

  it('exposes a readonly timestamp style with expected keys', () => {
    expect(WATCH_TIMELINE_TIMESTAMP_STYLE).toEqual({
      fontFamily: 'var(--s-mono)',
      color: 'var(--s-text-muted)',
      minWidth: 70,
    })
  })
})

describe('watchDetail/helpers — severityColor', () => {
  it('returns critical color for "critical"', () => {
    expect(severityColor('critical')).toBe('var(--s-critical)')
  })

  it('returns warning color for "warning"', () => {
    expect(severityColor('warning')).toBe('var(--s-warning)')
  })

  it('returns info color for "info"', () => {
    expect(severityColor('info')).toBe('var(--s-info)')
  })

  it('defaults to info color for unknown severities', () => {
    expect(severityColor('unknown')).toBe('var(--s-info)')
    expect(severityColor('')).toBe('var(--s-info)')
    expect(severityColor('CRITICAL')).toBe('var(--s-info)')
  })
})

describe('watchDetail/helpers — deploymentNameFromPodName', () => {
  it('strips the ReplicaSet hash and pod suffix from a standard Deployment pod name', () => {
    expect(deploymentNameFromPodName('my-app-7d9c8b8f4d-abcde')).toBe('my-app')
  })

  it('handles multi-segment deployment names', () => {
    expect(deploymentNameFromPodName('my-cool-service-abc12-xyz45')).toBe('my-cool-service')
  })

  it('returns the original name when it has fewer than three dash-separated parts', () => {
    expect(deploymentNameFromPodName('foo')).toBe('foo')
    expect(deploymentNameFromPodName('foo-bar')).toBe('foo-bar')
  })

  it('returns the original name when the previous segment does not look like a ReplicaSet hash', () => {
    // "ab" is too short to be a ReplicaSet hash (5-10 lowercase alnum chars)
    expect(deploymentNameFromPodName('my-app-ab-abcde')).toBe('my-app-ab-abcde')
  })

  it('returns the original name when the last segment does not look like a pod suffix', () => {
    // "toolongsuffix" exceeds pod suffix length bounds (4-6)
    expect(deploymentNameFromPodName('my-app-abcdefg12-toolongsuffix')).toBe(
      'my-app-abcdefg12-toolongsuffix',
    )
    // Too short (< 4)
    expect(deploymentNameFromPodName('my-app-abcdefg12-abc')).toBe('my-app-abcdefg12-abc')
  })

  it('returns the original name when segments contain uppercase or invalid chars', () => {
    expect(deploymentNameFromPodName('my-app-ABCDE12345-abcde')).toBe('my-app-ABCDE12345-abcde')
    expect(deploymentNameFromPodName('my-app-abcde12345-ABCDE')).toBe('my-app-abcde12345-ABCDE')
  })
})

describe('watchDetail/helpers — formatRelative', () => {
  const NOW = new Date('2026-01-15T12:00:00Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for times under a minute ago', () => {
    expect(formatRelative(new Date(NOW - 30 * 1000).toISOString())).toBe('just now')
    expect(formatRelative(new Date(NOW).toISOString())).toBe('just now')
  })

  it('returns minutes for times under an hour ago', () => {
    expect(formatRelative(new Date(NOW - 60 * 1000).toISOString())).toBe('1m ago')
    expect(formatRelative(new Date(NOW - 45 * 60 * 1000).toISOString())).toBe('45m ago')
    expect(formatRelative(new Date(NOW - 59 * 60 * 1000).toISOString())).toBe('59m ago')
  })

  it('returns hours for times under a day ago', () => {
    expect(formatRelative(new Date(NOW - 60 * 60 * 1000).toISOString())).toBe('1h ago')
    expect(formatRelative(new Date(NOW - 23 * 60 * 60 * 1000).toISOString())).toBe('23h ago')
  })

  it('returns days for times a day or more ago', () => {
    expect(formatRelative(new Date(NOW - 24 * 60 * 60 * 1000).toISOString())).toBe('1d ago')
    expect(formatRelative(new Date(NOW - 5 * 24 * 60 * 60 * 1000).toISOString())).toBe('5d ago')
  })
})

describe('watchDetail/helpers — formatDuration', () => {
  it('formats sub-minute durations in seconds', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(999)).toBe('0s')
    expect(formatDuration(1_000)).toBe('1s')
    expect(formatDuration(59_999)).toBe('59s')
  })

  it('formats sub-hour durations in minutes', () => {
    expect(formatDuration(60_000)).toBe('1m')
    expect(formatDuration(59 * 60 * 1000)).toBe('59m')
  })

  it('formats sub-day durations in hours', () => {
    expect(formatDuration(60 * 60 * 1000)).toBe('1h')
    expect(formatDuration(23 * 60 * 60 * 1000)).toBe('23h')
  })

  it('formats day-scale durations in days', () => {
    expect(formatDuration(24 * 60 * 60 * 1000)).toBe('1d')
    expect(formatDuration(7 * 24 * 60 * 60 * 1000)).toBe('7d')
  })
})

describe('watchDetail/helpers — matchesWatch', () => {
  const baseWatch: StellarWatch = {
    id: 'w1',
    cluster: 'cluster-a',
    namespace: 'default',
    resourceKind: 'Deployment',
    resourceName: 'my-app',
    reason: 'CrashLoopBackOff',
    status: 'active',
    lastUpdate: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }

  function makeNotification(overrides: Partial<StellarNotification> = {}): StellarNotification {
    return {
      id: 'n1',
      type: 'event',
      severity: 'warning',
      title: '',
      body: '',
      read: false,
      createdAt: '2026-01-01T00:00:00Z',
      ...overrides,
    }
  }

  it('rejects notifications from a different cluster', () => {
    const n = makeNotification({ cluster: 'cluster-b', title: 'my-app crashed' })
    expect(matchesWatch(n, baseWatch, '')).toBe(false)
  })

  it('rejects notifications from a different namespace when both sides specify one', () => {
    const n = makeNotification({ namespace: 'kube-system', title: 'my-app crashed' })
    expect(matchesWatch(n, baseWatch, '')).toBe(false)
  })

  it('does not reject on namespace when the notification omits it', () => {
    const n = makeNotification({ title: 'my-app crashed' })
    expect(matchesWatch(n, baseWatch, '')).toBe(true)
  })

  it('does not reject on namespace when the watch has no namespace', () => {
    const watch = { ...baseWatch, namespace: '' }
    const n = makeNotification({ namespace: 'anywhere', title: 'my-app crashed' })
    expect(matchesWatch(n, watch, '')).toBe(true)
  })

  it('matches when the title contains the resource name (case-insensitive)', () => {
    const n = makeNotification({ title: 'Pod MY-APP-abcde12345-xyzab restarted' })
    expect(matchesWatch(n, baseWatch, '')).toBe(true)
  })

  it('matches when the title contains a distinct deployment name', () => {
    // baseWatch.resourceName ("my-app") is not in the title, but the derived
    // deploymentName ("my-service") is, so the deployment-name branch matches.
    const n = makeNotification({ title: 'Deployment my-service is degraded' })
    expect(matchesWatch(n, baseWatch, 'my-service')).toBe(true)
  })

  it('ignores the deployment-name branch when it equals the resource name', () => {
    const n = makeNotification({ title: 'unrelated event' })
    expect(matchesWatch(n, baseWatch, 'my-app')).toBe(false)
  })

  it('does not double-count when deployment name equals resource name', () => {
    const n = makeNotification({ title: 'my-app crashed' })
    expect(matchesWatch(n, baseWatch, 'my-app')).toBe(true)
  })

  it('matches on dedupeKey with "ev:" prefix', () => {
    const n = makeNotification({
      title: 'unrelated',
      dedupeKey: 'ev:cluster-a:default:my-app:CrashLoopBackOff',
    })
    expect(matchesWatch(n, baseWatch, '')).toBe(true)
  })

  it('matches on dedupeKey without "ev:" prefix', () => {
    const n = makeNotification({
      title: 'unrelated',
      dedupeKey: 'cluster-a:default:my-app:CrashLoopBackOff',
    })
    expect(matchesWatch(n, baseWatch, '')).toBe(true)
  })

  it('matches via dedupeKey when the name starts with the deployment name', () => {
    const watch = { ...baseWatch, resourceName: 'other' }
    const n = makeNotification({
      title: 'unrelated',
      dedupeKey: 'ev:cluster-a:default:my-app-abcde12345-xyzab:reason',
    })
    expect(matchesWatch(n, watch, 'my-app')).toBe(true)
  })

  it('returns false when nothing matches', () => {
    const n = makeNotification({ title: 'unrelated', dedupeKey: 'ev:cluster-a:default:other:reason' })
    expect(matchesWatch(n, baseWatch, '')).toBe(false)
  })

  it('handles dedupeKey with too few segments gracefully', () => {
    const n = makeNotification({ title: 'unrelated', dedupeKey: 'ev:cluster-a' })
    expect(matchesWatch(n, baseWatch, '')).toBe(false)
  })
})

describe('watchDetail/helpers — footerBtn', () => {
  it('returns a style object using the supplied color for border and text', () => {
    const style = footerBtn('#ff0000')
    expect(style.background).toBe('none')
    expect(style.border).toBe('1px solid #ff0000')
    expect(style.color).toBe('#ff0000')
    expect(style.borderRadius).toBe('var(--s-rs)')
    expect(style.fontSize).toBe(11)
    expect(style.cursor).toBe('pointer')
  })

  it('propagates CSS variable colors verbatim', () => {
    const style = footerBtn('var(--s-critical)')
    expect(style.border).toBe('1px solid var(--s-critical)')
    expect(style.color).toBe('var(--s-critical)')
  })
})
