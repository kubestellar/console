import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, type ReactNode } from 'react'
import { settledWithConcurrency } from '../lib/utils/concurrency'
import { useMissions } from '../hooks/useMissions'
import { useDemoMode } from '../hooks/useDemoMode'
import type {
  Alert,
  AlertRule,
  AlertStats,
  AlertChannel,
} from '../types/alerts'
import type { GPUHealthCheckResult } from '../hooks/mcp/types'
import type { NightlyGuideStatus } from '../lib/llmd/nightlyE2EDemoData'
import type { AlertsMCPData } from './AlertsDataFetcher'
import { STORAGE_KEY_AUTH_TOKEN, FETCH_DEFAULT_TIMEOUT_MS, STORAGE_KEY_NOTIFIED_ALERT_KEYS } from '../lib/constants'
import { INITIAL_FETCH_DELAY_MS, POLL_INTERVAL_SLOW_MS, SECONDARY_FETCH_DELAY_MS, NIGHTLY_E2E_POLL_INTERVAL_MS } from '../lib/constants/network'
import { PRESET_ALERT_RULES } from '../types/alerts'
import { sendNotificationWithDeepLink } from '../hooks/useDeepLink'
import { findRunbookForCondition } from '../lib/runbooks/builtins'
import { executeRunbook } from '../lib/runbooks/executor'

// Lazy-load the MCP data fetcher — keeps the 300 KB MCP hook tree out of
// the main chunk.  The provider renders immediately with empty data; once
// the fetcher chunk loads, it starts pushing live data via onData callback.
const AlertsDataFetcher = lazy(() => import('./AlertsDataFetcher'))

// Generate unique ID
function generateId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// ── Batched Mutation Types ───────────────────────────────────────────────────
// During evaluateConditions, individual evaluate* functions push mutations into
// a shared accumulator instead of calling setAlerts N times.  After all rules
// are evaluated, the accumulator is flushed in a single setAlerts call — reducing
// O(rules × alerts) state updates to O(1).

/** Represents a new alert to create */
interface CreateMutation {
  type: 'create'
  rule: AlertRule
  alert: Alert
}

/** Represents an in-place update of an existing alert's mutable fields */
interface UpdateMutation {
  type: 'update'
  dedupKey: string
  conditionType: string
  message: string
  details: Record<string, unknown>
  resource?: string
  namespace?: string
  resourceKind?: string
}

/** Represents a resolution of a firing alert */
interface ResolveMutation {
  type: 'resolve'
  ruleId: string
  cluster?: string
  /** When set, match any alert for this rule regardless of cluster */
  matchAny?: boolean
}

type AlertMutation = CreateMutation | UpdateMutation | ResolveMutation

/** Accumulator for batched mutations during an evaluation cycle */
interface MutationAccumulator {
  mutations: AlertMutation[]
  /** Notifications to send after flushing state (alert + channels pairs) */
  notifications: Array<{ alert: Alert; channels: AlertChannel[] }>
}

// Shallow-compare two detail records without relying on JSON.stringify key ordering.
// Treats null/undefined as equal to each other and unequal to any object.
function shallowEqualRecords(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined
): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every(key => a[key] === b[key])
}

// Build the dedup key for an alert.
// pod_crash alerts use (ruleId, cluster, resource) so that each crashing pod on the
// same cluster gets its own entry. All aggregate/cluster-level alert types use
// (ruleId, cluster) only, preventing dynamic resource strings from creating duplicates.
function alertDedupKey(ruleId: string, conditionType: string, cluster?: string, resource?: string): string {
  if (conditionType === 'pod_crash') {
    return `${ruleId}::${cluster ?? ''}::${resource ?? ''}`
  }
  return `${ruleId}::${cluster ?? ''}`
}

// Deduplicate an array of alerts using the per-type key, keeping the most recently fired entry.
// Used to clean up historical duplicates persisted in localStorage before this fix.
function deduplicateAlerts(alerts: Alert[], rules: AlertRule[]): Alert[] {
  const ruleTypeMap = new Map(rules.map(r => [r.id, r.condition.type]))
  const dedupMap = new Map<string, Alert>()
  for (const alert of alerts) {
    const condType = ruleTypeMap.get(alert.ruleId) ?? ''
    const key = alertDedupKey(alert.ruleId, condType, alert.cluster, alert.resource)
    const existing = dedupMap.get(key)
    if (!existing || new Date(alert.firedAt) > new Date(existing.firedAt)) {
      dedupMap.set(key, alert)
    }
  }
  return Array.from(dedupMap.values())
}

/**
 * Apply all batched mutations to the alerts array in a single pass.
 * Returns the new alerts array. This runs inside a single setAlerts updater
 * so React commits exactly one state update per evaluation cycle.
 */
function applyMutations(
  prev: Alert[],
  mutations: AlertMutation[],
  rules: AlertRule[]
): Alert[] {
  if (mutations.length === 0) return prev

  let result = [...prev]
  const resolvedAt = new Date().toISOString()

  // Build a lookup of existing alerts by dedup key for O(1) matching
  const ruleTypeMap = new Map(rules.map(r => [r.id, r.condition.type]))
  const dedupIndex = new Map<string, number>()
  for (let i = 0; i < result.length; i++) {
    const a = result[i]
    if (a.status !== 'firing') continue
    const condType = ruleTypeMap.get(a.ruleId) ?? ''
    const key = alertDedupKey(a.ruleId, condType, a.cluster, a.resource)
    // Keep the last (most recent) index for each key
    dedupIndex.set(key, i)
  }

  for (const mut of mutations) {
    switch (mut.type) {
      case 'create': {
        const condType = ruleTypeMap.get(mut.alert.ruleId) ?? ''
        const key = alertDedupKey(mut.alert.ruleId, condType, mut.alert.cluster, mut.alert.resource)
        const existingIdx = dedupIndex.get(key)
        if (existingIdx !== undefined) {
          // Alert already exists — skip (dedup handled by update mutations)
          break
        }
        result = [mut.alert, ...result]
        // Update the index for the newly created alert (index 0 after prepend)
        // Shift all existing indices by 1 since we prepended
        const newIndex = new Map<string, number>()
        newIndex.set(key, 0)
        for (const [k, v] of dedupIndex) {
          newIndex.set(k, v + 1)
        }
        dedupIndex.clear()
        for (const [k, v] of newIndex) {
          dedupIndex.set(k, v)
        }
        break
      }
      case 'update': {
        const idx = dedupIndex.get(mut.dedupKey)
        if (idx !== undefined) {
          const existing = result[idx]
          // Skip update if nothing changed (avoids unnecessary object allocation)
          if (
            existing.message === mut.message &&
            existing.resource === mut.resource &&
            existing.namespace === mut.namespace &&
            existing.resourceKind === mut.resourceKind &&
            shallowEqualRecords(existing.details, mut.details)
          ) {
            break
          }
          result[idx] = {
            ...existing,
            message: mut.message,
            details: mut.details,
            resource: mut.resource,
            namespace: mut.namespace,
            resourceKind: mut.resourceKind,
          }
        }
        break
      }
      case 'resolve': {
        if (mut.matchAny) {
          // Resolve any firing alert for this rule (weather, DNS batch resolve, etc.)
          for (let i = 0; i < result.length; i++) {
            if (result[i].ruleId === mut.ruleId && result[i].status === 'firing') {
              result[i] = { ...result[i], status: 'resolved', resolvedAt }
            }
          }
        } else if (mut.cluster) {
          for (let i = 0; i < result.length; i++) {
            if (
              result[i].ruleId === mut.ruleId &&
              result[i].status === 'firing' &&
              result[i].cluster === mut.cluster
            ) {
              result[i] = { ...result[i], status: 'resolved', resolvedAt }
            }
          }
        }
        break
      }
    }
  }

  // Enforce the global cap: keep all firing and trim resolved by recency
  if (result.length > MAX_ALERTS) {
    const firing = result.filter(a => a.status === 'firing')
    const resolved = result
      .filter(a => a.status === 'resolved')
      .sort((a, b) => new Date(b.resolvedAt ?? b.firedAt).getTime() - new Date(a.resolvedAt ?? a.firedAt).getTime())
      .slice(0, Math.max(0, MAX_ALERTS - firing.length))
    result = [...firing, ...resolved]
  }

  return result
}

// Local storage keys
const ALERT_RULES_KEY = 'kc_alert_rules'
const ALERTS_KEY = 'kc_alerts'

/** Maximum number of alerts to retain in memory and storage at any time. */
const MAX_ALERTS = 500

/** Maximum number of resolved alerts to keep after a quota-exceeded prune. */
const MAX_RESOLVED_ALERTS_AFTER_PRUNE = 50

/** Minimum time (ms) between repeat notifications for the same alert */
const NOTIFICATION_COOLDOWN_MS = 300_000 // 5 minutes

/** Condition types that represent persistent cluster-level errors.
 *  These fire only once and suppress until the cluster recovers —
 *  no 5-minute cooldown repeat for ongoing connectivity failures. */
const PERSISTENT_CLUSTER_CONDITIONS = new Set(['certificate_error', 'cluster_unreachable'])

/** Maximum age (ms) for dedup entries — evict stale entries older than this */
const NOTIFICATION_DEDUP_MAX_AGE_MS = 86_400_000 // 24 hours

/** Load persisted notification dedup map from localStorage (key → timestamp) */
function loadNotifiedAlertKeys(): Map<string, number> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_NOTIFIED_ALERT_KEYS)
    if (stored) {
      return new Map(JSON.parse(stored) as [string, number][])
    }
  } catch {
    // Ignore corrupt data
  }
  return new Map()
}

/** Persist notification dedup map to localStorage, pruning entries older than NOTIFICATION_DEDUP_MAX_AGE_MS */
function saveNotifiedAlertKeys(keys: Map<string, number>): void {
  try {
    const now = Date.now()
    for (const [key, ts] of keys) {
      if (now - ts > NOTIFICATION_DEDUP_MAX_AGE_MS) keys.delete(key)
    }
    localStorage.setItem(STORAGE_KEY_NOTIFIED_ALERT_KEYS, JSON.stringify([...keys.entries()]))
  } catch {
    // localStorage full or unavailable
  }
}

// Load from localStorage
function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error(`Failed to load ${key} from localStorage:`, e)
  }
  return defaultValue
}

// Save to localStorage
function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.error(`Failed to save ${key} to localStorage:`, e)
  }
}

// Save alerts to localStorage with a hard cap and quota-exceeded handling.
// Keeps all firing alerts and trims resolved alerts by recency when the cap is hit.
function saveAlerts(alerts: Alert[]): void {
  // Enforce a global cap before every write: keep all firing alerts and trim resolved by recency.
  let toSave = alerts
  if (toSave.length > MAX_ALERTS) {
    const firing = toSave.filter(a => a.status === 'firing')
    const resolved = toSave
      .filter(a => a.status === 'resolved')
      .sort((a, b) => new Date(b.resolvedAt ?? b.firedAt).getTime() - new Date(a.resolvedAt ?? a.firedAt).getTime())
      .slice(0, Math.max(0, MAX_ALERTS - firing.length))
    toSave = [...firing, ...resolved]
  }

  try {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(toSave))
  } catch (e) {
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
      } catch (retryError) {
        console.error('[Alerts] localStorage still full after pruning, clearing alerts', retryError)
        localStorage.removeItem(ALERTS_KEY)
      }
    } else {
      console.error(`Failed to save ${ALERTS_KEY} to localStorage:`, e)
    }
  }
}

interface AlertsContextValue {
  alerts: Alert[]
  activeAlerts: Alert[]
  acknowledgedAlerts: Alert[]
  stats: AlertStats
  rules: AlertRule[]
  isEvaluating: boolean
  isLoadingData: boolean
  dataError: string | null
  acknowledgeAlert: (alertId: string, acknowledgedBy?: string) => void
  acknowledgeAlerts: (alertIds: string[], acknowledgedBy?: string) => void
  resolveAlert: (alertId: string) => void
  deleteAlert: (alertId: string) => void
  runAIDiagnosis: (alertId: string) => string | null
  evaluateConditions: () => void
  createRule: (rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>) => AlertRule
  updateRule: (id: string, updates: Partial<AlertRule>) => void
  deleteRule: (id: string) => void
  toggleRule: (id: string) => void
}

export const AlertsContext = createContext<AlertsContextValue | null>(null)

export function AlertsProvider({ children }: { children: ReactNode }) {
  // Alert Rules State
  const [rules, setRules] = useState<AlertRule[]>(() => {
    const stored = loadFromStorage<AlertRule[]>(ALERT_RULES_KEY, [])
    if (stored.length === 0) {
      const now = new Date().toISOString()
      const presetRules: AlertRule[] = (PRESET_ALERT_RULES as Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>[]).map(preset => ({
        ...preset,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      }))
      saveToStorage(ALERT_RULES_KEY, presetRules)
      return presetRules
    }
    return stored
  })

  // Alerts State
  const [alerts, setAlerts] = useState<Alert[]>(() =>
    loadFromStorage<Alert[]>(ALERTS_KEY, [])
  )
  const [isEvaluating, setIsEvaluating] = useState(false)

  // MCP data arrives from the lazy-loaded AlertsDataFetcher bridge.
  // Until the fetcher chunk loads, we start with empty arrays (same as
  // hook loading state).
  const [mcpData, setMCPData] = useState<AlertsMCPData>({
    gpuNodes: [],
    podIssues: [],
    clusters: [],
    isLoading: true,
    error: null,
  })

  const { startMission } = useMissions()
  const { isDemoMode } = useDemoMode()
  const previousDemoMode = useRef(isDemoMode)

  // Refs for polling data — lets evaluateConditions read latest data
  // without being recreated on every poll cycle
  const gpuNodesRef = useRef(mcpData.gpuNodes)
  gpuNodesRef.current = mcpData.gpuNodes
  const podIssuesRef = useRef(mcpData.podIssues)
  podIssuesRef.current = mcpData.podIssues
  const clustersRef = useRef(mcpData.clusters)
  clustersRef.current = mcpData.clusters
  const rulesRef = useRef(rules)
  rulesRef.current = rules

  // Stable ref for current alerts — lets evaluate* functions read without closure capture
  const alertsRef = useRef(alerts)
  alertsRef.current = alerts

  // Mutation accumulator — populated by evaluate* functions during an evaluation
  // cycle, then flushed in a single setAlerts call at the end of evaluateConditions.
  // Null when not inside an evaluation cycle (direct createAlert calls still work).
  const mutationAccRef = useRef<MutationAccumulator | null>(null)

  // Track which alert dedup keys have already triggered a browser notification.
  // Maps dedup key → timestamp (ms) of last notification. Prevents the same alert
  // from sending repeated macOS notifications on every evaluation cycle.
  // Keys are NOT cleared on resolve — a cooldown period prevents re-notification
  // when clusters flap between reachable/unreachable states.
  const notifiedAlertKeysRef = useRef<Map<string, number>>(loadNotifiedAlertKeys())

  // CronJob health results cache — fetched async, read synchronously by evaluator
  const cronJobResultsRef = useRef<Record<string, GPUHealthCheckResult[]>>({})

  // Nightly E2E data cache — fetched async, read synchronously by evaluator
  const nightlyE2ERef = useRef<NightlyGuideStatus[]>([])
  const nightlyAlertedRunsRef = useRef<Set<number>>(new Set())

  // Fetch CronJob results for all clusters periodically
  useEffect(() => {
    const fetchCronJobResults = async () => {
      const token = localStorage.getItem(STORAGE_KEY_AUTH_TOKEN)
      if (!token) return
      const currentClusters = clustersRef.current
      if (!currentClusters.length) return

      const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
      const results: Record<string, GPUHealthCheckResult[]> = {}

      await settledWithConcurrency(
        currentClusters.map((cluster) => async () => {
          try {
            const resp = await fetch(
              `${API_BASE}/api/mcp/gpu-nodes/health/cronjob/results?cluster=${encodeURIComponent(cluster.name)}`,
              { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) }
            )
            if (resp.ok) {
              // Use .catch() on .json() to prevent Firefox from firing unhandledrejection
              // before the outer try/catch processes the rejection (microtask timing issue).
              const data = await resp.json().catch(() => null)
              if (data?.results && data.results.length > 0) {
                results[cluster.name] = data.results
              }
            }
          } catch {
            // Silent — CronJob may not be installed on this cluster
          }
        })
      )

      cronJobResultsRef.current = results
    }

    // Initial fetch after short delay
    const timer = setTimeout(fetchCronJobResults, INITIAL_FETCH_DELAY_MS)
    // Refresh every 60 seconds
    const interval = setInterval(fetchCronJobResults, POLL_INTERVAL_SLOW_MS)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [])

  // Fetch nightly E2E run data periodically (public endpoint, no auth needed)
  useEffect(() => {
    const fetchNightlyE2E = async () => {
      try {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
        const resp = await fetch(`${API_BASE}/api/public/nightly-e2e/runs`, {
          signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
        })
        if (resp.ok) {
          // Use .catch() on .json() to prevent Firefox from firing unhandledrejection
          // before the outer try/catch processes the rejection (microtask timing issue).
          const data = await resp.json().catch(() => null)
          if (Array.isArray(data)) {
            nightlyE2ERef.current = data
          }
        }
      } catch {
        // Silent — nightly E2E data is optional
      }
    }

    const timer = setTimeout(fetchNightlyE2E, SECONDARY_FETCH_DELAY_MS)
    const interval = setInterval(fetchNightlyE2E, NIGHTLY_E2E_POLL_INTERVAL_MS)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [])

  // Request browser notification permission on mount
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Migrate preset rules: inject any new presets missing from stored rules
  useEffect(() => {
    setRules(prev => {
      const existingTypes = new Set(prev.map(r => r.condition.type))
      const missing = PRESET_ALERT_RULES.filter(p => !existingTypes.has(p.condition.type))
      if (missing.length === 0) return prev
      const now = new Date().toISOString()
      const newRules = missing.map(preset => ({
        ...preset,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      }))
      return [...prev, ...newRules]
    })
  }, [])

  // Aggregate loading and error states from the lazy MCP data bridge.
  // Safety net: if the lazy-loaded AlertsDataFetcher never resolves (e.g.,
  // chunk load failure), force isLoadingData to false after a timeout so the
  // UI doesn't get stuck in a permanent loading state (#4864).
  /** Maximum time (ms) to wait for MCP data before force-clearing loading state */
  const LOADING_TIMEOUT_MS = 30_000
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)
  useEffect(() => {
    if (!mcpData.isLoading) return
    const timer = setTimeout(() => {
      setLoadingTimedOut(true)
    }, LOADING_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [mcpData.isLoading])
  // Reset timeout flag when fresh data arrives
  useEffect(() => {
    if (!mcpData.isLoading) {
      setLoadingTimedOut(false)
    }
  }, [mcpData.isLoading])

  const isLoadingData = mcpData.isLoading && !loadingTimedOut
  const dataError = loadingTimedOut && mcpData.isLoading
    ? (mcpData.error || 'MCP data fetch timed out')
    : mcpData.error

  // Save rules whenever they change
  useEffect(() => {
    saveToStorage(ALERT_RULES_KEY, rules)
  }, [rules])

  // Save alerts whenever they change
  useEffect(() => {
    saveAlerts(alerts)
  }, [alerts])

  // Clear demo-generated alerts when demo mode is turned off
  useEffect(() => {
    if (previousDemoMode.current && !isDemoMode) {
      // Remove all alerts that were generated during demo mode
      setAlerts(prev => prev.filter(a => !a.isDemo))
    }
    previousDemoMode.current = isDemoMode
  }, [isDemoMode])

  // Rule management
  const createRule = useCallback((rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString()
    const newRule: AlertRule = {
      ...rule,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }
    setRules(prev => [...prev, newRule])
    return newRule
  }, [])

  const updateRule = useCallback((id: string, updates: Partial<AlertRule>) => {
    setRules(prev =>
      prev.map(rule =>
        rule.id === id
          ? { ...rule, ...updates, updatedAt: new Date().toISOString() }
          : rule
      )
    )
  }, [])

  const deleteRule = useCallback((id: string) => {
    setRules(prev => prev.filter(rule => rule.id !== id))
  }, [])

  const toggleRule = useCallback((id: string) => {
    setRules(prev =>
      prev.map(rule =>
        rule.id === id
          ? { ...rule, enabled: !rule.enabled, updatedAt: new Date().toISOString() }
          : rule
      )
    )
  }, [])

  // Calculate alert statistics
  const stats: AlertStats = useMemo(() => {
    const unacknowledgedFiring = alerts.filter(a => a.status === 'firing' && !a.acknowledgedAt)
    return {
      total: alerts.length,
      firing: unacknowledgedFiring.length,
      resolved: alerts.filter(a => a.status === 'resolved').length,
      critical: unacknowledgedFiring.filter(a => a.severity === 'critical').length,
      warning: unacknowledgedFiring.filter(a => a.severity === 'warning').length,
      info: unacknowledgedFiring.filter(a => a.severity === 'info').length,
      acknowledged: alerts.filter(a => a.acknowledgedAt && a.status === 'firing').length,
    }
  }, [alerts])

  // Get active (firing) alerts - exclude acknowledged alerts. Deduplicated via shared helper.
  const activeAlerts = useMemo(() => {
    const firing = alerts.filter(a => a.status === 'firing' && !a.acknowledgedAt)
    return deduplicateAlerts(firing, rules)
  }, [alerts, rules])

  // Get acknowledged alerts that are still firing. Deduplicated via shared helper.
  const acknowledgedAlerts = useMemo(() => {
    const acked = alerts.filter(a => a.status === 'firing' && a.acknowledgedAt)
    return deduplicateAlerts(acked, rules)
  }, [alerts, rules])

  // Acknowledge an alert
  const acknowledgeAlert = useCallback((alertId: string, acknowledgedBy?: string) => {
    setAlerts(prev =>
      prev.map(alert =>
        alert.id === alertId
          ? { ...alert, acknowledgedAt: new Date().toISOString(), acknowledgedBy }
          : alert
      )
    )
  }, [])

  // Acknowledge multiple alerts at once
  const acknowledgeAlerts = useCallback((alertIds: string[], acknowledgedBy?: string) => {
    const now = new Date().toISOString()
    setAlerts(prev =>
      prev.map(alert =>
        alertIds.includes(alert.id)
          ? { ...alert, acknowledgedAt: now, acknowledgedBy }
          : alert
      )
    )
  }, [])

  // Resolve an alert
  const resolveAlert = useCallback((alertId: string) => {
    const resolvedAt = new Date().toISOString()
    // Find the alert BEFORE the state updater to avoid capturing mutable
    // variables inside the updater (which React may replay in Strict Mode /
    // concurrent rendering). This prevents duplicate notification side effects.
    const alertToResolve = alertsRef.current.find(a => a.id === alertId)
    setAlerts(prev =>
      prev.map(alert =>
        alert.id === alertId
          ? { ...alert, status: 'resolved' as const, resolvedAt }
          : alert
      )
    )
    // Send resolution notifications outside the state updater.
    // Because we read alertToResolve from the ref before the updater,
    // this is safe even if React replays the updater function.
    if (alertToResolve) {
      queueMicrotask(() => {
        const rule = rules.find(r => r.id === alertToResolve.ruleId)
        if (rule) {
          const enabledChannels = rule.channels.filter(ch => ch.enabled)
          if (enabledChannels.length > 0) {
            sendNotifications(alertToResolve, enabledChannels).catch(() => {})
          }
        }
      })
    }
  }, [rules])

  // Delete an alert
  const deleteAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId))
  }, [])

  // Create a new alert — batching-aware.
  // When called during an evaluateConditions cycle (mutationAccRef.current is non-null),
  // mutations are collected into the accumulator and flushed in a single setAlerts call.
  // When called outside an evaluation cycle (e.g., manual trigger), falls back to a
  // direct setAlerts call so the alert appears immediately.
  const createAlert = useCallback(
    (
      rule: AlertRule,
      message: string,
      details: Record<string, unknown>,
      cluster?: string,
      namespace?: string,
      resource?: string,
      resourceKind?: string
    ) => {
      const acc = mutationAccRef.current
      const dedupKey = alertDedupKey(rule.id, rule.condition.type, cluster, resource)

      if (acc) {
        // ── Batched path: collect mutations, flush later ──────────────
        // Check existing alerts AND previously-queued create mutations for dedup
        const currentAlerts = alertsRef.current
        const existingAlert = currentAlerts.find(
          a =>
            a.ruleId === rule.id &&
            a.status === 'firing' &&
            alertDedupKey(a.ruleId, rule.condition.type, a.cluster, a.resource) === dedupKey
        )
        // Also check if a create mutation for this key is already queued
        const alreadyQueued = acc.mutations.some(
          m => m.type === 'create' &&
            alertDedupKey(m.alert.ruleId, m.rule.condition.type, m.alert.cluster, m.alert.resource) === dedupKey
        )

        if (existingAlert) {
          // Push an update mutation instead of a create
          acc.mutations.push({
            type: 'update',
            dedupKey,
            conditionType: rule.condition.type,
            message,
            details,
            resource,
            namespace,
            resourceKind,
          })
        } else if (!alreadyQueued) {
          const alert: Alert = {
            id: generateId(),
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            status: 'firing',
            message,
            details,
            cluster,
            namespace,
            resource,
            resourceKind,
            firedAt: new Date().toISOString(),
            isDemo: isDemoMode,
          }
          acc.mutations.push({ type: 'create', rule, alert })

          // Queue notification for after the flush
          if (rule.channels && rule.channels.length > 0) {
            const enabledChannels = rule.channels.filter(ch => ch.enabled)
            if (enabledChannels.length > 0) {
              acc.notifications.push({ alert, channels: enabledChannels })
            }
          }
        }
        return
      }

      // ── Unbatched path: direct setAlerts (outside evaluation cycle) ──
      // Check for existing alert BEFORE the state updater to avoid capturing
      // mutable variables inside the updater (React may replay it in Strict
      // Mode / concurrent rendering, causing duplicate notifications).
      const alertId = generateId()
      const firedAt = new Date().toISOString()
      const currentAlerts = alertsRef.current
      const existingAlertForDedup = currentAlerts.find(
        a =>
          a.ruleId === rule.id &&
          a.status === 'firing' &&
          alertDedupKey(a.ruleId, rule.condition.type, a.cluster, a.resource) === dedupKey
      )
      // Determine upfront whether this will be a new alert (for notification purposes)
      const isNewAlert = !existingAlertForDedup
      const newAlertObj: Alert = {
        id: alertId,
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        status: 'firing',
        message,
        details,
        cluster,
        namespace,
        resource,
        resourceKind,
        firedAt,
        isDemo: isDemoMode,
      }

      setAlerts(prev => {
        const existingAlert = prev.find(
          a =>
            a.ruleId === rule.id &&
            a.status === 'firing' &&
            alertDedupKey(a.ruleId, rule.condition.type, a.cluster, a.resource) === dedupKey
        )

        if (existingAlert) {
          if (
            existingAlert.message === message &&
            existingAlert.resource === resource &&
            existingAlert.namespace === namespace &&
            existingAlert.resourceKind === resourceKind &&
            shallowEqualRecords(existingAlert.details, details)
          ) {
            return prev
          }
          return prev.map(a =>
            a.id === existingAlert.id
              ? { ...a, message, details, resource, namespace, resourceKind }
              : a
          )
        }

        const alert = newAlertObj

        const newAlerts = [alert, ...prev]
        if (newAlerts.length <= MAX_ALERTS) return newAlerts
        const firingAlerts = newAlerts.filter(a => a.status === 'firing')
        const resolvedAlerts = newAlerts
          .filter(a => a.status === 'resolved')
          .sort((a, b) => new Date(b.resolvedAt ?? b.firedAt).getTime() - new Date(a.resolvedAt ?? a.firedAt).getTime())
          .slice(0, Math.max(0, MAX_ALERTS - firingAlerts.length))
        return [...firingAlerts, ...resolvedAlerts]
      })

      // Send notifications outside the state updater using pre-computed values
      // to avoid duplicate side effects if React replays the updater.
      if (isNewAlert) {
        queueMicrotask(() => {
          if (rule.channels && rule.channels.length > 0) {
            const enabledChannels = rule.channels.filter(ch => ch.enabled)
            if (enabledChannels.length > 0) {
              sendNotifications(newAlertObj, enabledChannels).catch(() => {})
            }
          }
        })
      }
    },
    [isDemoMode]
  )

  // Helper: queue an auto-resolve mutation — batching-aware.
  // During evaluation cycles, pushes to the accumulator; outside, calls setAlerts directly.
  const queueAutoResolve = useCallback(
    (ruleId: string, cluster?: string, matchAny?: boolean) => {
      const acc = mutationAccRef.current
      if (acc) {
        acc.mutations.push({ type: 'resolve', ruleId, cluster, matchAny })
        return
      }
      // Unbatched fallback
      setAlerts(prev => {
        const firingAlert = prev.find(
          a =>
            a.ruleId === ruleId &&
            a.status === 'firing' &&
            (matchAny || a.cluster === cluster)
        )
        if (firingAlert) {
          return prev.map(a =>
            a.id === firingAlert.id
              ? { ...a, status: 'resolved' as const, resolvedAt: new Date().toISOString() }
              : a
          )
        }
        return prev
      })
    },
    []
  )

  // Send notifications for an alert (best-effort, silent on auth failures)
  const sendNotifications = async (alert: Alert, channels: AlertChannel[]) => {
    try {
      const token = localStorage.getItem(STORAGE_KEY_AUTH_TOKEN)
      // Skip notification if not authenticated - notifications require login
      if (!token) return

      const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

      const response = await fetch(`${API_BASE}/api/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ alert, channels }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      // Silently ignore auth errors - user may not be logged in
      if (response.status === 401 || response.status === 403) return

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || 'Failed to send notifications')
      }
    } catch (error) {
      // Silent failure - notifications are best-effort
      // Only log unexpected errors (not network issues)
      if (error instanceof Error && !error.message.includes('fetch')) {
        console.warn('Notification send failed:', error.message)
      }
    }
  }

  // Send batched notifications — aggregates multiple alert/channel pairs into a
  // single HTTP request instead of N concurrent requests.
  const sendBatchedNotifications = async (items: Array<{ alert: Alert; channels: AlertChannel[] }>) => {
    if (items.length === 0) return
    try {
      const token = localStorage.getItem(STORAGE_KEY_AUTH_TOKEN)
      if (!token) return

      const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

      // Send all notifications in a single request with a batch payload.
      // The backend /api/notifications/send already accepts { alert, channels };
      // for batching we send items sequentially via settledWithConcurrency to
      // avoid overwhelming the backend while still using a single React render cycle.
      /** Maximum concurrent notification requests to avoid overwhelming the backend */
      const MAX_NOTIFICATION_CONCURRENCY = 3
      await settledWithConcurrency(
        items.map(({ alert, channels }) => async () => {
          try {
            const response = await fetch(`${API_BASE}/api/notifications/send`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ alert, channels }),
              signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
            })
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

  // Run AI diagnosis on an alert
  const runAIDiagnosis = useCallback(
    (alertId: string) => {
      const alert = alerts.find(a => a.id === alertId)
      if (!alert) return null

      // Look up matching runbook for this alert condition type
      const rule = rules.find(r => r.id === alert.ruleId)
      const conditionType = rule?.condition.type
      const runbook = conditionType ? findRunbookForCondition(conditionType) : undefined

      // If a runbook matches, execute it in the background to gather evidence
      // and build an enriched prompt. Fall back to the default prompt otherwise.
      const initialPrompt = `Please analyze this alert and provide diagnosis with suggestions:

Alert: ${alert.ruleName}
Severity: ${alert.severity}
Message: ${alert.message}
Cluster: ${alert.cluster || 'N/A'}
Resource: ${alert.resource || 'N/A'}
Details: ${JSON.stringify(alert.details, null, 2)}

Please provide:
1. A summary of the issue
2. The likely root cause
3. Suggested actions to resolve this alert`

      if (runbook) {
        // Fire-and-forget: runbook evidence will enrich the AI prompt asynchronously
        executeRunbook(runbook, {
          cluster: alert.cluster,
          namespace: alert.namespace,
          resource: alert.resource,
          resourceKind: alert.resourceKind,
          alertMessage: alert.message,
        }).then(result => {
          if (result.enrichedPrompt) {
            // The mission has already started; the enriched prompt will be
            // available for subsequent AI interactions in the mission context.
            console.debug(`Runbook "${runbook.title}" gathered ${result.stepResults.length} evidence steps`)
          }
        }).catch(() => {
          // Silent failure - runbook is best-effort enhancement
        })
      }

      const missionId = startMission({
        title: `Diagnose: ${alert.ruleName}`,
        description: `Analyzing alert on ${alert.cluster || 'cluster'}`,
        type: 'troubleshoot',
        cluster: alert.cluster,
        initialPrompt,
        context: {
          alertId,
          alertType: alert.ruleName,
          details: alert.details,
          runbookId: runbook?.id,
        },
      })

      setAlerts(prev =>
        prev.map(a =>
          a.id === alertId
            ? {
                ...a,
                aiDiagnosis: {
                  summary: 'AI is analyzing this alert...',
                  rootCause: '',
                  suggestions: [],
                  missionId,
                  analyzedAt: new Date().toISOString(),
                },
              }
            : a
        )
      )

      return missionId
    },
    [alerts, rules, startMission]
  )

  // Evaluate GPU usage condition — reads from refs for stable identity
  const evaluateGPUUsage = useCallback(
    (rule: AlertRule) => {
      const threshold = rule.condition.threshold || 90
      const currentClusters = clustersRef.current
      const currentGPUNodes = gpuNodesRef.current
      const relevantClusters = rule.condition.clusters?.length
        ? currentClusters.filter(c => rule.condition.clusters!.includes(c.name))
        : currentClusters

      for (const cluster of relevantClusters) {
        const clusterGPUNodes = currentGPUNodes.filter(n => n.cluster.startsWith(cluster.name))
        const totalGPUs = clusterGPUNodes.reduce((sum, n) => sum + n.gpuCount, 0)
        const allocatedGPUs = clusterGPUNodes.reduce((sum, n) => sum + n.gpuAllocated, 0)

        if (totalGPUs === 0) continue

        const usagePercent = (allocatedGPUs / totalGPUs) * 100

        if (usagePercent > threshold) {
          createAlert(
            rule,
            `GPU usage is ${usagePercent.toFixed(1)}% (${allocatedGPUs}/${totalGPUs} GPUs allocated)`,
            {
              usagePercent,
              allocatedGPUs,
              totalGPUs,
              threshold,
            },
            cluster.name,
            undefined,
            'nvidia.com/gpu',
            'Resource'
          )
        } else {
          queueAutoResolve(rule.id, cluster.name)
        }
      }
    },
    [createAlert, queueAutoResolve]
  )

  // Evaluate node ready condition — reads from refs for stable identity
  const evaluateNodeReady = useCallback(
    (rule: AlertRule) => {
      const currentClusters = clustersRef.current
      const relevantClusters = rule.condition.clusters?.length
        ? currentClusters.filter(c => rule.condition.clusters!.includes(c.name))
        : currentClusters

      for (const cluster of relevantClusters) {
        if (cluster.healthy === false) {
          createAlert(
            rule,
            `Cluster ${cluster.name} has nodes not in Ready state`,
            {
              clusterHealthy: cluster.healthy,
              nodeCount: cluster.nodeCount,
            },
            cluster.name,
            undefined,
            cluster.name,
            'Cluster'
          )
        } else {
          queueAutoResolve(rule.id, cluster.name)
        }
      }
    },
    [createAlert, queueAutoResolve]
  )

  // Evaluate pod crash condition — reads from refs for stable identity
  const evaluatePodCrash = useCallback(
    (rule: AlertRule) => {
      const threshold = rule.condition.threshold || 5

      for (const issue of podIssuesRef.current) {
        if (issue.restarts && issue.restarts >= threshold) {
          const clusterMatch =
            !rule.condition.clusters?.length ||
            rule.condition.clusters.includes(issue.cluster || '')
          const namespaceMatch =
            !rule.condition.namespaces?.length ||
            rule.condition.namespaces.includes(issue.namespace || '')

          if (clusterMatch && namespaceMatch) {
            createAlert(
              rule,
              `Pod ${issue.name} has restarted ${issue.restarts} times (${issue.status})`,
              {
                restarts: issue.restarts,
                status: issue.status,
                reason: issue.reason,
              },
              issue.cluster,
              issue.namespace,
              issue.name,
              'Pod'
            )
          }
        }
      }
    },
    [createAlert]
  )

  // Evaluate weather alerts condition - mock implementation for demo purposes
  // This is intentionally a demo feature to showcase conditional alerting capabilities
  // Production deployments should disable weather alerts or replace with actual weather API
  const evaluateWeatherAlerts = useCallback(
    (rule: AlertRule) => {
      // Mock weather data evaluation
      // In production, this would integrate with a weather API
      const mockWeatherCondition = rule.condition.weatherCondition || 'severe_storm'
      
      // Randomly trigger alerts for demo purposes (10% chance)
      const shouldAlert = Math.random() < 0.1

      if (shouldAlert) {
        let message = ''
        const details: Record<string, unknown> = {
          weatherCondition: mockWeatherCondition,
        }

        switch (mockWeatherCondition) {
          case 'severe_storm':
            message = 'Severe storm warning in effect'
            details.description = 'Thunderstorm with possible hail and strong winds'
            break
          case 'extreme_heat': {
            const temp = rule.condition.temperatureThreshold || 100
            message = `Extreme heat alert - Temperature expected to exceed ${temp}°F`
            details.temperature = temp + 5
            details.threshold = temp
            break
          }
          case 'heavy_rain':
            message = 'Heavy rain warning - Flooding possible'
            details.rainfall = '2-3 inches'
            break
          case 'snow':
            message = 'Winter storm warning - Heavy snow expected'
            details.snowfall = '6-12 inches'
            break
          case 'high_wind': {
            const windSpeed = rule.condition.windSpeedThreshold || 40
            message = `High wind warning - Gusts up to ${windSpeed + 10} mph expected`
            details.windSpeed = windSpeed + 10
            details.threshold = windSpeed
            break
          }
        }

        createAlert(
          rule,
          message,
          details,
          undefined,
          undefined,
          'Weather',
          'WeatherCondition'
        )
      } else {
        // Auto-resolve if condition clears
        queueAutoResolve(rule.id, undefined, true)
      }
    },
    [createAlert, queueAutoResolve]
  )

  // Evaluate GPU Health CronJob — reads cached results from ref
  const evaluateGPUHealthCronJob = useCallback(
    (rule: AlertRule) => {
      const cachedResults = cronJobResultsRef.current
      const currentClusters = clustersRef.current
      const relevantClusters = rule.condition.clusters?.length
        ? currentClusters.filter(c => rule.condition.clusters!.includes(c.name))
        : currentClusters

      for (const cluster of relevantClusters) {
        const results = cachedResults[cluster.name]
        if (!results || results.length === 0) continue

        // Find nodes with failed checks
        const failedNodes = results.filter(
          r => r.status === 'unhealthy' || r.status === 'degraded'
        )

        if (failedNodes.length > 0) {
          const totalIssues = failedNodes.reduce(
            (sum, n) => sum + (n.issues?.length || 0),
            0
          )
          const nodeNames = failedNodes.map(n => n.nodeName).join(', ')

          createAlert(
            rule,
            `GPU health check found ${totalIssues} issue(s) on ${failedNodes.length} node(s): ${nodeNames}`,
            {
              failedNodes: failedNodes.length,
              totalIssues,
              nodeNames,
              checks: failedNodes.flatMap(n =>
                (n.checks || []).filter(c => !c.passed).map(c => ({
                  node: n.nodeName,
                  check: c.name,
                  message: c.message,
                }))
              ),
            },
            cluster.name,
            undefined,
            nodeNames,
            'Node'
          )

          // Send browser notification only once per alert (not on every evaluation cycle)
          const notifKey = alertDedupKey(rule.id, rule.condition.type, cluster.name)
          if (
            rule.channels?.some(ch => ch.type === 'browser' && ch.enabled) &&
            (!notifiedAlertKeysRef.current.has(notifKey) || (Date.now() - (notifiedAlertKeysRef.current.get(notifKey) ?? 0)) > NOTIFICATION_COOLDOWN_MS)
          ) {
            notifiedAlertKeysRef.current.set(notifKey, Date.now())
            const firstNode = failedNodes[0]
            sendNotificationWithDeepLink(
              `GPU Health Alert: ${cluster.name}`,
              `${totalIssues} issue(s) on ${failedNodes.length} GPU node(s)`,
              {
                drilldown: 'node',
                cluster: cluster.name,
                node: firstNode.nodeName,
              }
            )
          }
        } else {
          // Auto-resolve if all nodes are healthy
          queueAutoResolve(rule.id, cluster.name)
        }
      }
    },
    [createAlert, queueAutoResolve]
  )

  // Evaluate disk pressure condition — checks for DiskPressure in cluster issues
  const evaluateDiskPressure = useCallback(
    (rule: AlertRule) => {
      const currentClusters = clustersRef.current
      const relevantClusters = rule.condition.clusters?.length
        ? currentClusters.filter(c => rule.condition.clusters!.includes(c.name))
        : currentClusters

      for (const cluster of relevantClusters) {
        const diskPressureIssue = (cluster.issues || []).find(issue =>
          typeof issue === 'string' && issue.includes('DiskPressure')
        )

        if (diskPressureIssue) {
          // Extract node name from issue string (format: "DiskPressure on node-name")
          const nodeMatch = diskPressureIssue.match(/on\s+(\S+)/)
          const affectedNode = nodeMatch?.[1]

          createAlert(
            rule,
            `${cluster.name}: ${diskPressureIssue}`,
            {
              clusterName: cluster.name,
              issue: diskPressureIssue,
              nodeCount: cluster.nodeCount,
              affectedNode,
            },
            cluster.name,
            undefined,
            cluster.name,
            'Cluster'
          )

          // Send browser notification only once per alert (not on every evaluation cycle).
          // notifiedAlertKeysRef tracks which (ruleId, cluster) combos already sent a notification.
          const notifKey = alertDedupKey(rule.id, rule.condition.type, cluster.name)
          if (
            rule.channels?.some(ch => ch.type === 'browser' && ch.enabled) &&
            (!notifiedAlertKeysRef.current.has(notifKey) || (Date.now() - (notifiedAlertKeysRef.current.get(notifKey) ?? 0)) > NOTIFICATION_COOLDOWN_MS)
          ) {
            notifiedAlertKeysRef.current.set(notifKey, Date.now())
            sendNotificationWithDeepLink(
              `Disk Pressure: ${cluster.name}`,
              diskPressureIssue,
              // Deep link to the affected node drilldown (not cluster_health card)
              affectedNode
                ? { drilldown: 'node', cluster: cluster.name, node: affectedNode, issue: 'DiskPressure' }
                : { drilldown: 'cluster', cluster: cluster.name, issue: 'DiskPressure' }
            )
          }
        } else {
          // Auto-resolve if DiskPressure clears — also clear the notification dedup key
          queueAutoResolve(rule.id, cluster.name)
        }
      }
    },
    [createAlert, queueAutoResolve]
  )

  // Evaluate memory pressure condition — checks for MemoryPressure in cluster issues
  const evaluateMemoryPressure = useCallback(
    (rule: AlertRule) => {
      const currentClusters = clustersRef.current
      const relevantClusters = rule.condition.clusters?.length
        ? currentClusters.filter(c => rule.condition.clusters!.includes(c.name))
        : currentClusters

      for (const cluster of relevantClusters) {
        const memPressureIssue = (cluster.issues || []).find(issue =>
          typeof issue === 'string' && issue.includes('MemoryPressure')
        )

        if (memPressureIssue) {
          createAlert(
            rule,
            `${cluster.name}: ${memPressureIssue}`,
            {
              clusterName: cluster.name,
              issue: memPressureIssue,
              nodeCount: cluster.nodeCount,
            },
            cluster.name,
            undefined,
            cluster.name,
            'Cluster'
          )
        } else {
          queueAutoResolve(rule.id, cluster.name)
        }
      }
    },
    [createAlert, queueAutoResolve]
  )

  // Evaluate DNS failures — checks for CoreDNS pods crashing or not ready
  const evaluateDNSFailure = useCallback(
    (rule: AlertRule) => {
      const currentPodIssues = podIssuesRef.current
      const relevantClusters = rule.condition.clusters?.length
        ? rule.condition.clusters
        : undefined

      // Find CoreDNS pods with issues (coredns, dns-default on OpenShift)
      const dnsIssues = (currentPodIssues || []).filter(pod => {
        const isDNSPod = pod.name.includes('coredns') || pod.name.includes('dns-default')
        const matchesCluster = !relevantClusters || relevantClusters.includes(pod.cluster || '')
        return isDNSPod && matchesCluster
      })

      // Group by cluster
      const clusterDNSIssues = new Map<string, typeof dnsIssues>()
      for (const pod of dnsIssues) {
        const cluster = pod.cluster || 'unknown'
        const existing = clusterDNSIssues.get(cluster) || []
        existing.push(pod)
        clusterDNSIssues.set(cluster, existing)
      }

      for (const [cluster, pods] of clusterDNSIssues) {
        const podNames = pods.map(p => p.name).join(', ')
        const issues = pods.flatMap(p => p.issues || []).join('; ')
        createAlert(
          rule,
          `${cluster}: DNS failure — ${pods.length} CoreDNS pod(s) unhealthy`,
          { clusterName: cluster, podNames, issues, podCount: pods.length },
          cluster,
          'kube-system',
          podNames,
          'Pod'
        )

        const notifKey = alertDedupKey(rule.id, rule.condition.type, cluster)
        if (
          rule.channels?.some(ch => ch.type === 'browser' && ch.enabled) &&
          (!notifiedAlertKeysRef.current.has(notifKey) || (Date.now() - (notifiedAlertKeysRef.current.get(notifKey) ?? 0)) > NOTIFICATION_COOLDOWN_MS)
        ) {
          notifiedAlertKeysRef.current.set(notifKey, Date.now())
          sendNotificationWithDeepLink(
            `DNS Failure: ${cluster}`,
            `${pods.length} CoreDNS pod(s) unhealthy — ${issues || 'check pod status'}`,
            { drilldown: 'pod', cluster, namespace: pods[0].namespace, pod: pods[0].name }
          )
        }
      }

      // Auto-resolve clusters that no longer have DNS issues
      const clustersWithIssues = new Set(clusterDNSIssues.keys())
      const currentAlerts = alertsRef.current
      for (const a of currentAlerts) {
        if (a.ruleId === rule.id && a.status === 'firing' && a.cluster && !clustersWithIssues.has(a.cluster)) {
          queueAutoResolve(rule.id, a.cluster)
        }
      }
    },
    [createAlert, queueAutoResolve]
  )

  // Evaluate certificate errors — checks for clusters with certificate connection failures
  const evaluateCertificateError = useCallback(
    (rule: AlertRule) => {
      const currentClusters = clustersRef.current
      const relevantClusters = rule.condition.clusters?.length
        ? currentClusters.filter(c => rule.condition.clusters!.includes(c.name))
        : currentClusters

      for (const cluster of relevantClusters) {
        if (cluster.errorType === 'certificate') {
          createAlert(
            rule,
            `${cluster.name}: Certificate error — ${cluster.errorMessage || 'TLS handshake failed'}`,
            {
              clusterName: cluster.name,
              errorType: cluster.errorType,
              errorMessage: cluster.errorMessage,
              server: cluster.server,
            },
            cluster.name,
            undefined,
            cluster.name,
            'Cluster'
          )

          const notifKey = alertDedupKey(rule.id, rule.condition.type, cluster.name)
          const isPersistent = PERSISTENT_CLUSTER_CONDITIONS.has(rule.condition.type)
          const alreadyNotified = notifiedAlertKeysRef.current.has(notifKey)
          const cooldownExpired = !alreadyNotified || (Date.now() - (notifiedAlertKeysRef.current.get(notifKey) ?? 0)) > NOTIFICATION_COOLDOWN_MS
          // Persistent cluster errors: notify once, suppress until recovery.
          // Transient alerts: use the standard 5-minute cooldown.
          const shouldNotify = isPersistent ? !alreadyNotified : cooldownExpired
          if (
            rule.channels?.some(ch => ch.type === 'browser' && ch.enabled) && shouldNotify
          ) {
            notifiedAlertKeysRef.current.set(notifKey, Date.now())
            sendNotificationWithDeepLink(
              `Certificate Error: ${cluster.name}`,
              cluster.errorMessage || 'TLS certificate validation failed',
              { drilldown: 'cluster', cluster: cluster.name, issue: 'certificate' }
            )
          }
        } else {
          // Auto-resolve if cert error clears — also clear dedup so next failure re-notifies
          const notifKey = alertDedupKey(rule.id, rule.condition.type, cluster.name)
          notifiedAlertKeysRef.current.delete(notifKey)
          queueAutoResolve(rule.id, cluster.name)
        }
      }
    },
    [createAlert, queueAutoResolve]
  )

  // Evaluate cluster unreachable — checks for clusters with network/auth/timeout failures
  const evaluateClusterUnreachable = useCallback(
    (rule: AlertRule) => {
      const currentClusters = clustersRef.current
      const relevantClusters = rule.condition.clusters?.length
        ? currentClusters.filter(c => rule.condition.clusters!.includes(c.name))
        : currentClusters

      for (const cluster of relevantClusters) {
        if (cluster.reachable === false && cluster.errorType !== 'certificate') {
          const errorLabel = cluster.errorType === 'timeout' ? 'connection timed out'
            : cluster.errorType === 'auth' ? 'authentication failed'
            : cluster.errorType === 'network' ? 'network unreachable'
            : 'connection failed'

          createAlert(
            rule,
            `${cluster.name}: Cluster unreachable — ${errorLabel}`,
            {
              clusterName: cluster.name,
              errorType: cluster.errorType,
              errorMessage: cluster.errorMessage,
              server: cluster.server,
              lastSeen: cluster.lastSeen,
            },
            cluster.name,
            undefined,
            cluster.name,
            'Cluster'
          )

          const notifKey = alertDedupKey(rule.id, rule.condition.type, cluster.name)
          const isPersistent = PERSISTENT_CLUSTER_CONDITIONS.has(rule.condition.type)
          const alreadyNotified = notifiedAlertKeysRef.current.has(notifKey)
          const cooldownExpired = !alreadyNotified || (Date.now() - (notifiedAlertKeysRef.current.get(notifKey) ?? 0)) > NOTIFICATION_COOLDOWN_MS
          const shouldNotify = isPersistent ? !alreadyNotified : cooldownExpired
          if (
            rule.channels?.some(ch => ch.type === 'browser' && ch.enabled) && shouldNotify
          ) {
            notifiedAlertKeysRef.current.set(notifKey, Date.now())
            sendNotificationWithDeepLink(
              `Cluster Unreachable: ${cluster.name}`,
              `${errorLabel}${cluster.lastSeen ? ` — last seen ${cluster.lastSeen}` : ''}`,
              { drilldown: 'cluster', cluster: cluster.name, issue: 'unreachable' }
            )
          }
        } else if (cluster.reachable !== false) {
          // Auto-resolve when cluster becomes reachable — clear dedup so next failure re-notifies
          const notifKey = alertDedupKey(rule.id, rule.condition.type, cluster.name)
          notifiedAlertKeysRef.current.delete(notifKey)
          queueAutoResolve(rule.id, cluster.name)
        }
      }
    },
    [createAlert, queueAutoResolve]
  )

  // Evaluate nightly E2E failures — reads cached run data from ref
  const evaluateNightlyE2EFailure = useCallback(
    (rule: AlertRule) => {
      const guides = nightlyE2ERef.current
      if (!guides.length) return

      const currentRunIds = new Set<number>()

      for (const guide of guides) {
        for (const run of guide.runs) {
          currentRunIds.add(run.id)

          // Only alert on completed failures not already alerted
          if (
            run.status !== 'completed' ||
            run.conclusion !== 'failure' ||
            nightlyAlertedRunsRef.current.has(run.id)
          ) {
            continue
          }

          nightlyAlertedRunsRef.current.add(run.id)

          const message = `Nightly E2E failed: ${guide.guide} (${guide.acronym}) on ${guide.platform} — Run #${run.runNumber}`

          createAlert(
            rule,
            message,
            {
              guide: guide.guide,
              acronym: guide.acronym,
              platform: guide.platform,
              repo: guide.repo,
              workflowFile: guide.workflowFile,
              runNumber: run.runNumber,
              runId: run.id,
              htmlUrl: run.htmlUrl,
              failureReason: run.failureReason || 'unknown',
              model: run.model,
              gpuType: run.gpuType,
              gpuCount: run.gpuCount,
            },
            guide.platform,
            undefined,
            `${guide.acronym}-run-${run.runNumber}`,
            'WorkflowRun'
          )

          // Send browser notification only once per failed run (not on every evaluation cycle)
          const notifKey = `${rule.id}::${guide.acronym}::${run.runNumber}`
          if (
            rule.channels?.some(ch => ch.type === 'browser' && ch.enabled) &&
            (!notifiedAlertKeysRef.current.has(notifKey) || (Date.now() - (notifiedAlertKeysRef.current.get(notifKey) ?? 0)) > NOTIFICATION_COOLDOWN_MS)
          ) {
            notifiedAlertKeysRef.current.set(notifKey, Date.now())
            sendNotificationWithDeepLink(
              `Nightly E2E Failed: ${guide.acronym} (${guide.platform})`,
              `Run #${run.runNumber} failed — ${guide.guide}`,
              { card: 'nightly_e2e_status' }
            )
          }
        }
      }

      // Prune alerted runs that are no longer in the current data
      for (const id of nightlyAlertedRunsRef.current) {
        if (!currentRunIds.has(id)) {
          nightlyAlertedRunsRef.current.delete(id)
        }
      }
    },
    [createAlert]
  )

  // Evaluate alert conditions — uses refs so callback identity is stable.
  // All evaluate* functions push mutations into the accumulator; we flush
  // them in a single setAlerts call at the end, reducing O(rules × alerts)
  // state updates to O(1).
  //
  // The heavy evaluation work is deferred to the next frame via setTimeout(0)
  // so React can render the isEvaluating=true state before the synchronous
  // evaluation blocks the main thread (#4868).
  const isEvaluatingRef = useRef(false)
  const evaluateConditions = useCallback(() => {
    if (isEvaluatingRef.current) return
    isEvaluatingRef.current = true
    setIsEvaluating(true)

    // Initialize the batched mutation accumulator
    const acc: MutationAccumulator = { mutations: [], notifications: [] }
    mutationAccRef.current = acc

    try {
      const enabledRules = rulesRef.current.filter(r => r.enabled)

      for (const rule of enabledRules) {
        switch (rule.condition.type) {
          case 'gpu_usage':
            evaluateGPUUsage(rule)
            break
          case 'gpu_health_cronjob':
            evaluateGPUHealthCronJob(rule)
            break
          case 'node_not_ready':
            evaluateNodeReady(rule)
            break
          case 'pod_crash':
            evaluatePodCrash(rule)
            break
          case 'disk_pressure':
            evaluateDiskPressure(rule)
            break
          case 'memory_pressure':
            evaluateMemoryPressure(rule)
            break
          case 'weather_alerts':
            evaluateWeatherAlerts(rule)
            break
          case 'nightly_e2e_failure':
            evaluateNightlyE2EFailure(rule)
            break
          case 'dns_failure':
            evaluateDNSFailure(rule)
            break
          case 'certificate_error':
            evaluateCertificateError(rule)
            break
          case 'cluster_unreachable':
            evaluateClusterUnreachable(rule)
            break
          default:
            break
        }
      }
    } finally {
      // Clear accumulator before flushing so any createAlert calls from
      // outside this cycle fall back to unbatched path
      mutationAccRef.current = null

      // Flush all mutations in a single setAlerts call
      if (acc.mutations.length > 0) {
        const currentRules = rulesRef.current
        setAlerts(prev => applyMutations(prev, acc.mutations, currentRules))
      }

      // Send batched notifications after state flush (fire-and-forget)
      if (acc.notifications.length > 0) {
        queueMicrotask(() => {
          sendBatchedNotifications(acc.notifications).catch(() => {
            // Silent failure - notifications are best-effort
          })
        })
      }

      saveNotifiedAlertKeys(notifiedAlertKeysRef.current)
      isEvaluatingRef.current = false
      setIsEvaluating(false)
    }
  }, [evaluateGPUUsage, evaluateGPUHealthCronJob, evaluateNodeReady, evaluatePodCrash, evaluateDiskPressure, evaluateMemoryPressure, evaluateWeatherAlerts, evaluateNightlyE2EFailure, evaluateDNSFailure, evaluateCertificateError, evaluateClusterUnreachable])

  // Stable ref for evaluateConditions so the interval never resets
  const evaluateConditionsRef = useRef(evaluateConditions)
  evaluateConditionsRef.current = evaluateConditions

  // Periodic evaluation (every 30 seconds) — stable, never re-creates timers
  useEffect(() => {
    const timer = setTimeout(() => {
      evaluateConditionsRef.current()
    }, 1000)

    const interval = setInterval(() => {
      evaluateConditionsRef.current()
    }, 30000)

    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [])

  const value: AlertsContextValue = useMemo(() => ({
    alerts,
    activeAlerts,
    acknowledgedAlerts,
    stats,
    rules,
    isEvaluating,
    isLoadingData,
    dataError,
    acknowledgeAlert,
    acknowledgeAlerts,
    resolveAlert,
    deleteAlert,
    runAIDiagnosis,
    evaluateConditions,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
  }), [alerts, activeAlerts, acknowledgedAlerts, stats, rules, isEvaluating, isLoadingData, dataError, acknowledgeAlert, acknowledgeAlerts, resolveAlert, deleteAlert, runAIDiagnosis, evaluateConditions, createRule, updateRule, deleteRule, toggleRule])

  return (
    <AlertsContext.Provider value={value}>
      <Suspense fallback={null}>
        <AlertsDataFetcher onData={setMCPData} />
      </Suspense>
      {children}
    </AlertsContext.Provider>
  )
}

export function useAlertsContext() {
  const context = useContext(AlertsContext)
  if (!context) {
    throw new Error('useAlertsContext must be used within an AlertsProvider')
  }
  return context
}
