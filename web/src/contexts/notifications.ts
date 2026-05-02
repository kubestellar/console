/**
 * Notification state machine and dispatch
 *
 * Handles:
 * - Browser notification dedup logic
 * - Notification cooldown by severity
 * - User dismissal and acknowledgment
 * - Deep link integration
 */

import type { AlertRule, Alert, AlertChannel } from '../types/alerts'
import type { DeepLinkParams } from '../hooks/useDeepLink'
import { sendNotificationWithDeepLink } from '../hooks/useDeepLink'
import {
  NOTIFICATION_COOLDOWN_BY_SEVERITY,
  DEFAULT_NOTIFICATION_COOLDOWN_MS,
} from './alertStorage'

/** Condition types that represent persistent cluster-level errors.
 *  These fire only once and suppress until the cluster recovers —
 *  no 5-minute cooldown repeat for ongoing connectivity failures. */
export const PERSISTENT_CLUSTER_CONDITIONS = new Set(['certificate_error', 'cluster_unreachable'])

/** Parameters for the centralized browser notification dispatcher */
export interface BrowserNotificationParams {
  /** The alert rule that triggered this notification */
  rule: AlertRule
  /** The notification dedup key (from alertDedupKey or custom) */
  dedupKey: string
  /** The notification title */
  title: string
  /** The notification body text */
  body: string
  /** Deep link parameters for click-through navigation */
  deepLinkParams: DeepLinkParams
}

/** Get the notification cooldown for a given severity level */
export function getNotificationCooldown(severity: string): number {
  return NOTIFICATION_COOLDOWN_BY_SEVERITY[severity] ?? DEFAULT_NOTIFICATION_COOLDOWN_MS
}

/**
 * Determine if a cluster is unreachable
 *
 * When a cluster is unreachable we cannot observe its node / disk / memory
 * state — any cached values are stale, last-known-good at best. Firing
 * per-node alerts ("Node Not Ready", "Disk Pressure", "Memory Pressure")
 * for such clusters produces misleading noise on top of the single
 * authoritative "Cluster Unreachable" alert. This helper centralizes the
 * reachability check so every node / cluster-health evaluator can skip
 * unreachable clusters uniformly. See upstream bug report for the real-world
 * "20 unreachable clusters → 40 spurious alerts" scenario.
 */
export function isClusterUnreachable(cluster: { reachable?: boolean }): boolean {
  return cluster.reachable === false
}

/**
 * Dispatch a browser notification with centralized dedup rules.
 *
 * This replaces the 6 inline dedup-check patterns that were scattered
 * across individual evaluators, each with slightly different logic.
 *
 * @returns true if the notification should be sent, false if suppressed by dedup
 */
export function shouldDispatchBrowserNotification(
  rule: AlertRule,
  dedupKey: string,
  notifiedKeys: Map<string, number>
): boolean {
  // Gate: rule must have an enabled browser channel
  const hasBrowserChannel = (rule.channels || []).some(
    ch => ch.type === 'browser' && ch.enabled
  )
  if (!hasBrowserChannel) return false

  const isPersistent = PERSISTENT_CLUSTER_CONDITIONS.has(rule.condition.type)
  const alreadyNotified = notifiedKeys.has(dedupKey)

  if (isPersistent) {
    // Persistent conditions: notify exactly once, suppress until recovery
    // clears the dedup key (see evaluateCertificateError/evaluateClusterUnreachable)
    return !alreadyNotified
  }

  // Transient conditions: use severity-tiered cooldown
  if (!alreadyNotified) return true
  const lastNotified = notifiedKeys.get(dedupKey) ?? 0
  return (Date.now() - lastNotified) > getNotificationCooldown(rule.severity)
}

/**
 * Send a browser notification with deep link integration
 *
 * Wraps sendNotificationWithDeepLink for consistent notification dispatch
 */
export function dispatchNotification(
  title: string,
  body: string,
  deepLinkParams: DeepLinkParams
): void {
  sendNotificationWithDeepLink(title, body, deepLinkParams)
}

/**
 * Send notifications to configured channels
 *
 * Supports multiple notification backends (browser, email, webhook, etc)
 * with token authentication and timeout handling
 */
export async function sendNotifications(
  alert: Alert,
  channels: AlertChannel[],
  token: string | null,
  apiBase: string,
  fetchTimeout: number
): Promise<void> {
  try {
    // Skip notification if not authenticated - notifications require login
    if (!token) return

    const response = await fetch(`${apiBase}/api/notifications/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Authorization: `Bearer ${token}` },
      body: JSON.stringify({ alert, channels }),
      signal: AbortSignal.timeout(fetchTimeout) })

    // Silently ignore auth errors - user may not be logged in
    if (response.status === 401 || response.status === 403) return

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.message || 'Failed to send notifications')
    }
  } catch (error: unknown) {
    // Silent failure - notifications are best-effort
    // Only log unexpected errors (not network issues)
    if (error instanceof Error && !error.message.includes('fetch')) {
      console.warn('Notification send failed:', error.message)
    }
  }
}

/**
 * Send batched notifications — aggregates multiple alert/channel pairs into a
 * single HTTP request instead of N concurrent requests.
 */
export async function sendBatchedNotifications(
  items: Array<{ alert: Alert; channels: AlertChannel[] }>,
  token: string | null,
  apiBase: string,
  fetchTimeout: number,
  settledWithConcurrency: <T>(tasks: (() => Promise<T>)[], concurrency: number) => Promise<PromiseSettledResult<T>[]>
): Promise<void> {
  if (items.length === 0) return
  try {
    if (!token) return

    // Send all notifications in a single request with a batch payload.
    // The backend /api/notifications/send already accepts { alert, channels };
    // for batching we send items sequentially via settledWithConcurrency to
    // avoid overwhelming the backend while still using a single React render cycle.
    /** Maximum concurrent notification requests to avoid overwhelming the backend */
    const MAX_NOTIFICATION_CONCURRENCY = 3
    await settledWithConcurrency(
      items.map(({ alert, channels }) => async () => {
        try {
          const response = await fetch(`${apiBase}/api/notifications/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
              Authorization: `Bearer ${token}` },
            body: JSON.stringify({ alert, channels }),
            signal: AbortSignal.timeout(fetchTimeout) })
          if (response.status === 401 || response.status === 403) return
          if (!response.ok) {
            const data = await response.json().catch(() => ({}))
            throw new Error(data.message || 'Failed to send notification')
          }
        } catch {
          // Silent failure - notifications are best-effort
        }
      }),
      MAX_NOTIFICATION_CONCURRENCY
    )
  } catch {
    // Silent failure - notifications are best-effort
  }
}
