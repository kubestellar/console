/**
 * Tests for contexts/notifications.ts
 *
 * Covers: getNotificationCooldown, isClusterUnreachable,
 * shouldDispatchBrowserNotification, sendNotifications,
 * sendBatchedNotifications, and PERSISTENT_CLUSTER_CONDITIONS.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../hooks/useDeepLink', () => ({
  sendNotificationWithDeepLink: vi.fn(),
}))

vi.mock('../../hooks/mcp/shared', () => ({
  agentFetch: vi.fn(),
}))

import {
  getNotificationCooldown,
  isClusterUnreachable,
  shouldDispatchBrowserNotification,
  dispatchNotification,
  sendNotifications,
  sendBatchedNotifications,
  PERSISTENT_CLUSTER_CONDITIONS,
} from '../notifications'
import {
  NOTIFICATION_COOLDOWN_BY_SEVERITY,
  DEFAULT_NOTIFICATION_COOLDOWN_MS,
} from '../alertStorage'
import { sendNotificationWithDeepLink } from '../../hooks/useDeepLink'
import { agentFetch } from '../../hooks/mcp/shared'
import type { AlertRule, Alert, AlertChannel } from '../../types/alerts'

const mockSendNotification = sendNotificationWithDeepLink as ReturnType<typeof vi.fn>
const mockAgentFetch = vi.mocked(agentFetch)

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    severity: 'warning',
    enabled: true,
    condition: { type: 'node_not_ready', threshold: 1 },
    channels: [{ type: 'browser', enabled: true }],
    ...overrides,
  } as AlertRule
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'alert-1',
    ruleName: 'test-rule',
    severity: 'warning',
    message: 'Test alert',
    status: 'firing',
    firedAt: new Date().toISOString(),
    ...overrides,
  } as Alert
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAgentFetch.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// =============================================================================
// PERSISTENT_CLUSTER_CONDITIONS
// =============================================================================

describe('PERSISTENT_CLUSTER_CONDITIONS', () => {
  it('contains certificate_error and cluster_unreachable', () => {
    expect(PERSISTENT_CLUSTER_CONDITIONS.has('certificate_error')).toBe(true)
    expect(PERSISTENT_CLUSTER_CONDITIONS.has('cluster_unreachable')).toBe(true)
  })

  it('does not contain unrelated condition types', () => {
    expect(PERSISTENT_CLUSTER_CONDITIONS.has('node_not_ready')).toBe(false)
    expect(PERSISTENT_CLUSTER_CONDITIONS.has('pod_crash_loop')).toBe(false)
  })
})

// =============================================================================
// getNotificationCooldown
// =============================================================================

describe('getNotificationCooldown', () => {
  it('returns critical cooldown for critical severity', () => {
    expect(getNotificationCooldown('critical')).toBe(
      NOTIFICATION_COOLDOWN_BY_SEVERITY.critical
    )
  })

  it('returns warning cooldown for warning severity', () => {
    expect(getNotificationCooldown('warning')).toBe(
      NOTIFICATION_COOLDOWN_BY_SEVERITY.warning
    )
  })

  it('returns info cooldown for info severity', () => {
    expect(getNotificationCooldown('info')).toBe(
      NOTIFICATION_COOLDOWN_BY_SEVERITY.info
    )
  })

  it('returns default cooldown for unknown severity', () => {
    expect(getNotificationCooldown('unknown-severity')).toBe(
      DEFAULT_NOTIFICATION_COOLDOWN_MS
    )
  })
})

// =============================================================================
// isClusterUnreachable
// =============================================================================

describe('isClusterUnreachable', () => {
  it('returns true when reachable is false', () => {
    expect(isClusterUnreachable({ reachable: false })).toBe(true)
  })

  it('returns false when reachable is true', () => {
    expect(isClusterUnreachable({ reachable: true })).toBe(false)
  })

  it('returns false when reachable is undefined', () => {
    expect(isClusterUnreachable({})).toBe(false)
  })
})

// =============================================================================
// shouldDispatchBrowserNotification
// =============================================================================

describe('shouldDispatchBrowserNotification', () => {
  it('returns false when rule has no browser channel', () => {
    const rule = makeRule({
      channels: [{ type: 'email', enabled: true } as AlertChannel],
    })
    const result = shouldDispatchBrowserNotification(rule, 'key-1', new Map())
    expect(result).toBe(false)
  })

  it('returns false when browser channel is disabled', () => {
    const rule = makeRule({
      channels: [{ type: 'browser', enabled: false } as AlertChannel],
    })
    const result = shouldDispatchBrowserNotification(rule, 'key-1', new Map())
    expect(result).toBe(false)
  })

  it('returns true for first notification of transient condition', () => {
    const rule = makeRule()
    const result = shouldDispatchBrowserNotification(rule, 'key-1', new Map())
    expect(result).toBe(true)
  })

  it('returns false for transient condition within cooldown', () => {
    const rule = makeRule({ severity: 'warning' })
    const recentTimestamp = Date.now() - 1000 // 1 second ago
    const notifiedKeys = new Map([['key-1', recentTimestamp]])
    const result = shouldDispatchBrowserNotification(rule, 'key-1', notifiedKeys)
    expect(result).toBe(false)
  })

  it('returns true for transient condition past cooldown', () => {
    const rule = makeRule({ severity: 'critical' })
    // Critical cooldown is 5 minutes — set last notified 10 minutes ago
    const oldTimestamp = Date.now() - 10 * 60 * 1000
    const notifiedKeys = new Map([['key-1', oldTimestamp]])
    const result = shouldDispatchBrowserNotification(rule, 'key-1', notifiedKeys)
    expect(result).toBe(true)
  })

  it('returns true for first notification of persistent condition', () => {
    const rule = makeRule({
      condition: { type: 'certificate_error', threshold: 1 },
    })
    const result = shouldDispatchBrowserNotification(rule, 'cert-key', new Map())
    expect(result).toBe(true)
  })

  it('returns false for repeat notification of persistent condition', () => {
    const rule = makeRule({
      condition: { type: 'cluster_unreachable', threshold: 1 },
    })
    const notifiedKeys = new Map([['cluster-key', Date.now() - 1000]])
    const result = shouldDispatchBrowserNotification(rule, 'cluster-key', notifiedKeys)
    expect(result).toBe(false)
  })

  it('handles rule with empty channels array', () => {
    const rule = makeRule({ channels: [] })
    const result = shouldDispatchBrowserNotification(rule, 'key-1', new Map())
    expect(result).toBe(false)
  })

  it('handles rule with undefined channels', () => {
    const rule = makeRule({ channels: undefined as unknown as AlertChannel[] })
    const result = shouldDispatchBrowserNotification(rule, 'key-1', new Map())
    expect(result).toBe(false)
  })
})

// =============================================================================
// dispatchNotification
// =============================================================================

describe('dispatchNotification', () => {
  it('delegates to sendNotificationWithDeepLink', () => {
    const params = { view: 'alerts' as const }
    dispatchNotification('Title', 'Body', params)
    expect(mockSendNotification).toHaveBeenCalledWith('Title', 'Body', params)
  })
})

// =============================================================================
// sendNotifications
// =============================================================================

describe('sendNotifications', () => {
  it('skips when token is null', async () => {
    await sendNotifications(makeAlert(), [], null, 'http://localhost', 5000)
    expect(mockAgentFetch).not.toHaveBeenCalled()
  })

  it('sends POST request with auth token', async () => {
    const mockResponse = { ok: true, json: () => Promise.resolve({}) }
    mockAgentFetch.mockResolvedValue(mockResponse as Response)

    const alert = makeAlert()
    const channels: AlertChannel[] = [{ type: 'browser', enabled: true } as AlertChannel]
    await sendNotifications(alert, channels, 'my-token', 'http://localhost:8080', 5000)

    expect(mockAgentFetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/notifications/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer my-token',
        }),
      })
    )
  })

  it('silently ignores 401 responses', async () => {
    const mockResponse = { ok: false, status: 401, json: () => Promise.resolve({}) }
    mockAgentFetch.mockResolvedValue(mockResponse as Response)

    await sendNotifications(makeAlert(), [], 'token', 'http://localhost', 5000)
  })

  it('silently ignores 403 responses', async () => {
    const mockResponse = { ok: false, status: 403, json: () => Promise.resolve({}) }
    mockAgentFetch.mockResolvedValue(mockResponse as Response)

    await sendNotifications(makeAlert(), [], 'token', 'http://localhost', 5000)
  })

  it('warns on non-auth error response', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Internal error' }),
    }
    mockAgentFetch.mockResolvedValue(mockResponse as Response)
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await sendNotifications(makeAlert(), [], 'token', 'http://localhost', 5000)

    expect(consoleSpy).toHaveBeenCalledWith('Notification send failed:', 'Internal error')
    consoleSpy.mockRestore()
  })
})

// =============================================================================
// sendBatchedNotifications
// =============================================================================

describe('sendBatchedNotifications', () => {
  const mockSettled = async <T>(tasks: (() => Promise<T>)[], _concurrency: number) => {
    const results: PromiseSettledResult<T>[] = []
    for (const task of tasks) {
      try {
        const value = await task()
        results.push({ status: 'fulfilled', value })
      } catch (reason) {
        results.push({ status: 'rejected', reason })
      }
    }
    return results
  }

  it('returns early for empty items array', async () => {
    await sendBatchedNotifications([], 'token', 'http://localhost', 5000, mockSettled)
    expect(mockAgentFetch).not.toHaveBeenCalled()
  })

  it('returns early when token is null', async () => {
    await sendBatchedNotifications(
      [{ alert: makeAlert(), channels: [] }],
      null,
      'http://localhost',
      5000,
      mockSettled
    )
    expect(mockAgentFetch).not.toHaveBeenCalled()
  })

  it('sends notifications for each item', async () => {
    const mockResponse = { ok: true, json: () => Promise.resolve({}) }
    mockAgentFetch.mockResolvedValue(mockResponse as Response)

    const items = [
      { alert: makeAlert({ id: '1' }), channels: [{ type: 'browser', enabled: true } as AlertChannel] },
      { alert: makeAlert({ id: '2' }), channels: [{ type: 'browser', enabled: true } as AlertChannel] },
    ]
    await sendBatchedNotifications(items, 'token', 'http://localhost:8080', 5000, mockSettled)
    expect(mockAgentFetch).toHaveBeenCalledTimes(2)
  })

  it('silently handles individual item failures', async () => {
    mockAgentFetch.mockRejectedValue(new Error('network error'))

    const items = [{ alert: makeAlert(), channels: [] }]
    await sendBatchedNotifications(items, 'token', 'http://localhost', 5000, mockSettled)
  })
})
