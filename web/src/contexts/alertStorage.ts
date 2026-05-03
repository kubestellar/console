/**
 * Persistence layer for alerts
 *
 * Handles localStorage operations:
 * - Alert loading/saving with quota-exceeded handling
 * - Notification dedup key tracking
 * - Session recovery
 */

import type { Alert } from '../types/alerts'
import { safeGet, safeSet, safeRemove, safeGetJSON } from '../lib/safeLocalStorage'
import { STORAGE_KEY_AUTH_TOKEN, FETCH_DEFAULT_TIMEOUT_MS, STORAGE_KEY_NOTIFIED_ALERT_KEYS } from '../lib/constants'
import { MS_PER_MINUTE, MS_PER_HOUR } from '../lib/constants/time'

/** Storage key for alerts */
export const ALERTS_KEY = 'kc_alerts'

/** Maximum number of alerts to retain in memory and storage at any time. */
export const MAX_ALERTS = 500

/** Maximum number of resolved alerts to keep after a quota-exceeded prune. */
export const MAX_RESOLVED_ALERTS_AFTER_PRUNE = 50

/** Maximum age (ms) for dedup entries — evict stale entries older than this.
 *  30 days: persistent-condition keys (certificate_error, cluster_unreachable)
 *  must survive across sessions until the cluster recovers; 24 h was too short. */
export const NOTIFICATION_DEDUP_MAX_AGE_MS = 30 * 24 * MS_PER_HOUR // 30 days

/** Default temperature threshold for extreme-heat weather alerts (°F). */
export const DEFAULT_TEMPERATURE_THRESHOLD_F = 100
/** Default wind-speed threshold for high-wind weather alerts (mph). */
export const DEFAULT_WIND_SPEED_THRESHOLD_MPH = 40

/** Minimum time (ms) between repeat notifications for the same alert,
 *  tiered by severity so critical alerts re-notify quickly while
 *  lower-severity alerts don't spam the desktop. */
export const NOTIFICATION_COOLDOWN_BY_SEVERITY: Record<string, number> = {
  critical: 5 * MS_PER_MINUTE,    // 5 min — urgent, re-notify quickly
  warning: 30 * MS_PER_MINUTE,    // 30 min — important but not urgent
  info: 4 * MS_PER_HOUR,   // 4 hours — informational, minimal interruption
}
/** Fallback cooldown when severity is unknown */
export const DEFAULT_NOTIFICATION_COOLDOWN_MS = 30 * MS_PER_MINUTE // 30 min

/** Load persisted notification dedup map from localStorage (key → timestamp).
 *  Prunes stale entries (older than NOTIFICATION_DEDUP_MAX_AGE_MS) on load
 *  and persists the cleaned map back to localStorage. */
export function loadNotifiedAlertKeys(): Map<string, number> {
  try {
    const stored = safeGet(STORAGE_KEY_NOTIFIED_ALERT_KEYS)
    if (stored) {
      const entries = JSON.parse(stored) as [string, number][]
      const now = Date.now()
      const fresh = entries.filter(([, ts]) => now - ts <= NOTIFICATION_DEDUP_MAX_AGE_MS)
      if (fresh.length < entries.length) {
        safeSet(STORAGE_KEY_NOTIFIED_ALERT_KEYS, JSON.stringify(fresh))
      }
      return new Map(fresh)
    }
  } catch {
    // Ignore corrupt data
  }
  return new Map()
}

/** Persist notification dedup map to localStorage, pruning entries older than NOTIFICATION_DEDUP_MAX_AGE_MS */
export function saveNotifiedAlertKeys(keys: Map<string, number>): void {
  try {
    const now = Date.now()
    // Collect stale keys first to avoid mutating Map during iteration
    const staleKeys: string[] = []
    for (const [key, ts] of keys) {
      if (now - ts > NOTIFICATION_DEDUP_MAX_AGE_MS) staleKeys.push(key)
    }
    for (const key of staleKeys) keys.delete(key)
    safeSet(STORAGE_KEY_NOTIFIED_ALERT_KEYS, JSON.stringify([...keys.entries()]))
  } catch {
    // localStorage full or unavailable
  }
}

/** Load from localStorage */
export function loadFromStorage<T>(key: string, defaultValue: T): T {
  return safeGetJSON(key, defaultValue)
}

/** Save to localStorage with error logging (#7576).
 *  Uses localStorage directly instead of safeSetJSON so errors are
 *  observable rather than silently swallowed. */
export function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e: unknown) {
    console.error(`Failed to save ${key} to localStorage:`, e)
  }
}

/** Save alerts to localStorage with a hard cap and quota-exceeded handling.
 *  Keeps all firing alerts and trims resolved alerts by recency when the cap is hit. */
export function saveAlerts(alerts: Alert[]): void {
  // Enforce a global cap before every write: keep all firing alerts and trim resolved by recency.
  let toSave = alerts
  if (toSave.length > MAX_ALERTS) {
    // Sort firing alerts by recency and cap at MAX_ALERTS so that when
    // firing count alone exceeds the limit we still honour the hard cap.
    const firing = toSave
      .filter(a => a.status === 'firing')
      .sort((a, b) => new Date(b.firedAt).getTime() - new Date(a.firedAt).getTime())
      .slice(0, MAX_ALERTS)
    const resolved = toSave
      .filter(a => a.status === 'resolved')
      .sort((a, b) => new Date(b.resolvedAt ?? b.firedAt).getTime() - new Date(a.resolvedAt ?? a.firedAt).getTime())
      .slice(0, Math.max(0, MAX_ALERTS - firing.length))
    toSave = [...firing, ...resolved]
  }

  // Use localStorage.setItem directly instead of safeSet so that
  // QuotaExceededError propagates to our own catch block (#7576).
  try {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(toSave))
  } catch (e: unknown) {
    // QuotaExceededError: DOMException with name 'QuotaExceededError', or legacy
    // browsers that use numeric code 22 instead of the named exception.
    // Pattern matches useMissions/useMetricsHistory for consistency across the codebase.
    const isQuotaError = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)
    if (isQuotaError) {
      console.warn('[Alerts] localStorage quota exceeded, pruning resolved alerts')
      // Keep all firing alerts + a small number of recent resolved ones
      const firing = toSave.filter(a => a.status === 'firing')
      const resolved = toSave
        .filter(a => a.status === 'resolved')
        .sort((a, b) => new Date(b.resolvedAt ?? b.firedAt).getTime() - new Date(a.resolvedAt ?? a.firedAt).getTime())
        .slice(0, MAX_RESOLVED_ALERTS_AFTER_PRUNE)
      const pruned = [...firing, ...resolved]
      try {
        localStorage.setItem(ALERTS_KEY, JSON.stringify(pruned))
      } catch (retryError: unknown) {
        console.error('[Alerts] localStorage still full after pruning, clearing alerts', retryError)
        safeRemove(ALERTS_KEY)
      }
    } else {
      console.error(`Failed to save ${ALERTS_KEY} to localStorage:`, e)
    }
  }
}

/** Export constants used by other modules */
export { FETCH_DEFAULT_TIMEOUT_MS, STORAGE_KEY_AUTH_TOKEN }
