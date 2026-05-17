/**
 * Alerts Context
 *
 * Category: domain state.
 * Owns alert rules, evaluated alert instances, and notification workflows.
 */
import { useState, useEffect, useCallback, useRef, useMemo, Suspense, type ReactNode } from 'react'
import { safeLazy } from '@/lib/safeLazy'
import { settledWithConcurrency } from '../lib/utils/concurrency'
import { useMissions } from '../hooks/useMissions'
import { useDemoMode } from '../hooks/useDemoMode'
import type { Alert, AlertRule, AlertStats, AlertChannel } from '../types/alerts'
import type { GPUHealthCheckResult } from '../hooks/mcp/types'
import type { NightlyGuideStatus } from '../lib/llmd/nightlyE2EDemoData'
import type { AlertsMCPData } from './AlertsDataFetcher'
import type { AlertsContextValue, AlertNotificationBatch, MutationAccumulator } from './AlertsContext.types'
import { INITIAL_FETCH_DELAY_MS, POLL_INTERVAL_SLOW_MS, SECONDARY_FETCH_DELAY_MS, NIGHTLY_E2E_POLL_INTERVAL_MS } from '../lib/constants/network'
import { PRESET_ALERT_RULES } from '../types/alerts'
import { safeGet } from '../lib/safeLocalStorage'
import {
  ALERTS_KEY,
  loadNotifiedAlertKeys,
  saveNotifiedAlertKeys,
  loadFromStorage,
  saveToStorage,
  saveAlerts,
} from './alertStorage'
import { STORAGE_KEY_AUTH_TOKEN } from '../lib/constants/storage'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import {
  shouldDispatchBrowserNotification,
  type BrowserNotificationParams,
  sendNotifications,
  sendBatchedNotifications,
} from './notifications'
import { sendNotificationWithDeepLink } from '../hooks/useDeepLink'
import { findRunbookForCondition } from '../lib/runbooks/builtins'
import { executeRunbook } from '../lib/runbooks/executor'
import { alertDedupKey, deduplicateAlerts } from './alerts/deduplication'
import { createStateContext } from './createStateContext'
import { applyMutations, createAlertRulesEngine, generateId, shallowEqualRecords } from './alertRulesEngine'

const AlertsDataFetcher = safeLazy(() => import('./AlertsDataFetcher'), 'default')
const MCP_UPDATE_BATCH_FRAME_FALLBACK_MS = 16
const ALERT_RULES_KEY = 'kc_alert_rules'
const LOADING_TIMEOUT_MS = 30_000
const INITIAL_EVALUATION_DELAY_MS = 1000
const EVALUATION_INTERVAL_MS = 30000

const {
  Context: AlertsContext,
  useRequiredStateContext: useAlertsContext,
} = createStateContext<AlertsContextValue>({
  name: 'Alerts',
  hookName: 'useAlertsContext',
  providerLabel: 'an AlertsProvider',
})

export { AlertsContext, useAlertsContext }

export function AlertsProvider({ children }: { children: ReactNode }) {
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
  const [alerts, setAlerts] = useState<Alert[]>(() => loadFromStorage<Alert[]>(ALERTS_KEY, []))
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [mcpData, setMCPData] = useState<AlertsMCPData>({
    gpuNodes: [],
    podIssues: [],
    clusters: [],
    isLoading: true,
    error: null,
  })
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)

  const pendingMCPDataRef = useRef<AlertsMCPData | null>(null)
  const mcpFlushHandleRef = useRef<number | ReturnType<typeof setTimeout> | null>(null)

  const { startMission, missions: allMissions } = useMissions()
  const { isDemoMode } = useDemoMode()

  const previousDemoMode = useRef(isDemoMode)
  const mutationAccRef = useRef<MutationAccumulator | null>(null)
  const notifiedAlertKeysRef = useRef<Map<string, number>>(loadNotifiedAlertKeys())
  const cronJobResultsRef = useRef<Record<string, GPUHealthCheckResult[]>>({})
  const nightlyE2ERef = useRef<NightlyGuideStatus[]>([])
  const nightlyAlertedRunsRef = useRef<Set<number>>(new Set())
  const isEvaluatingRef = useRef(false)
  const diagnosisInFlightRef = useRef<Set<string>>(new Set())

  const gpuNodesRef = useRef(mcpData.gpuNodes)
  gpuNodesRef.current = mcpData.gpuNodes
  const podIssuesRef = useRef(mcpData.podIssues)
  podIssuesRef.current = mcpData.podIssues
  const clustersRef = useRef(mcpData.clusters)
  clustersRef.current = mcpData.clusters
  const rulesRef = useRef(rules)
  rulesRef.current = rules
  const alertsRef = useRef(alerts)
  alertsRef.current = alerts
  const startMissionRef = useRef(startMission)
  startMissionRef.current = startMission

  const flushPendingMCPData = useCallback(() => {
    mcpFlushHandleRef.current = null
    const pendingMCPData = pendingMCPDataRef.current
    if (!pendingMCPData) return

    pendingMCPDataRef.current = null
    setMCPData(pendingMCPData)
  }, [])

  const enqueueMCPData = useCallback((nextMCPData: AlertsMCPData) => {
    pendingMCPDataRef.current = nextMCPData
    if (mcpFlushHandleRef.current !== null) return

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      mcpFlushHandleRef.current = window.requestAnimationFrame(() => {
        flushPendingMCPData()
      })
      return
    }

    mcpFlushHandleRef.current = globalThis.setTimeout(() => {
      flushPendingMCPData()
    }, MCP_UPDATE_BATCH_FRAME_FALLBACK_MS)
  }, [flushPendingMCPData])

  const setNotifiedKey = useCallback((key: string, timestamp: number) => {
    notifiedAlertKeysRef.current.set(key, timestamp)
    saveNotifiedAlertKeys(notifiedAlertKeysRef.current)
  }, [])

  const deleteNotifiedKey = useCallback((key: string) => {
    notifiedAlertKeysRef.current.delete(key)
    saveNotifiedAlertKeys(notifiedAlertKeysRef.current)
  }, [])

  const persistNotifiedAlertKeys = useCallback(() => {
    saveNotifiedAlertKeys(notifiedAlertKeysRef.current)
  }, [])

  useEffect(() => {
    let unmounted = false
    const fetchCronJobResults = async () => {
      const token = safeGet(STORAGE_KEY_AUTH_TOKEN)
      if (!token || unmounted) return
      const currentClusters = clustersRef.current
      if (!currentClusters.length) return

      const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
      const settled = await settledWithConcurrency(
        currentClusters.map(cluster => async () => {
          try {
            const resp = await fetch(
              `${API_BASE}/api/mcp/gpu-nodes/health/cronjob/results?cluster=${encodeURIComponent(cluster.name)}`,
              { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) }
            )
            if (resp.ok) {
              const data = await resp.json().catch(() => null)
              if (data?.results && data.results.length > 0) {
                return { cluster: cluster.name, data: data.results as GPUHealthCheckResult[] }
              }
            }
          } catch {
            // Silent — CronJob may not be installed on this cluster
          }
          return null
        })
      )

      const results: Record<string, GPUHealthCheckResult[]> = {}
      for (const result of settled) {
        if (result.status === 'fulfilled' && result.value) {
          results[result.value.cluster] = result.value.data
        }
      }

      if (!unmounted) {
        cronJobResultsRef.current = results
      }
    }

    const timer = setTimeout(fetchCronJobResults, INITIAL_FETCH_DELAY_MS)
    const interval = setInterval(fetchCronJobResults, POLL_INTERVAL_SLOW_MS)
    return () => {
      unmounted = true
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    let unmounted = false
    const fetchNightlyE2E = async () => {
      if (unmounted) return
      try {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
        const resp = await fetch(`${API_BASE}/api/public/nightly-e2e/runs`, {
          signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
        })
        if (resp.ok && !unmounted) {
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
      unmounted = true
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    setRules(prev => {
      const existingTypes = new Set(prev.map(rule => rule.condition.type))
      const missing = PRESET_ALERT_RULES.filter(preset => !existingTypes.has(preset.condition.type))
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

  useEffect(() => {
    if (!mcpData.isLoading) return
    const timer = setTimeout(() => {
      setLoadingTimedOut(true)
    }, LOADING_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [mcpData.isLoading])

  useEffect(() => {
    if (!mcpData.isLoading) {
      setLoadingTimedOut(false)
    }
  }, [mcpData.isLoading])

  useEffect(() => () => {
    if (mcpFlushHandleRef.current === null) return

    if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(mcpFlushHandleRef.current as number)
      return
    }

    globalThis.clearTimeout(mcpFlushHandleRef.current)
  }, [])

  useEffect(() => {
    saveToStorage(ALERT_RULES_KEY, rules)
  }, [rules])

  useEffect(() => {
    saveAlerts(alerts)
  }, [alerts])

  useEffect(() => {
    if (previousDemoMode.current && !isDemoMode) {
      setAlerts(prev => prev.filter(alert => !alert.isDemo))
    }
    previousDemoMode.current = isDemoMode
  }, [isDemoMode])

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

  const deduplicatedAlerts = useMemo(() => deduplicateAlerts(alerts, rules), [alerts, rules])

  const stats: AlertStats = useMemo(() => {
    const unacknowledgedFiring = deduplicatedAlerts.filter(alert => alert.status === 'firing' && !alert.acknowledgedAt)
    return {
      total: deduplicatedAlerts.length,
      firing: unacknowledgedFiring.length,
      resolved: deduplicatedAlerts.filter(alert => alert.status === 'resolved').length,
      critical: unacknowledgedFiring.filter(alert => alert.severity === 'critical').length,
      warning: unacknowledgedFiring.filter(alert => alert.severity === 'warning').length,
      info: unacknowledgedFiring.filter(alert => alert.severity === 'info').length,
      acknowledged: deduplicatedAlerts.filter(alert => alert.acknowledgedAt && alert.status === 'firing').length,
    }
  }, [deduplicatedAlerts])

  const activeAlerts = useMemo(() => {
    const firing = alerts.filter(alert => alert.status === 'firing' && !alert.acknowledgedAt)
    return deduplicateAlerts(firing, rules)
  }, [alerts, rules])

  const acknowledgedAlerts = useMemo(() => {
    const acknowledged = alerts.filter(alert => alert.status === 'firing' && alert.acknowledgedAt)
    return deduplicateAlerts(acknowledged, rules)
  }, [alerts, rules])

  const acknowledgeAlert = useCallback((alertId: string, acknowledgedBy?: string) => {
    setAlerts(prev =>
      prev.map(alert =>
        alert.id === alertId
          ? { ...alert, acknowledgedAt: new Date().toISOString(), acknowledgedBy, signalType: 'acknowledged' as const }
          : alert
      )
    )
  }, [])

  const acknowledgeAlerts = useCallback((alertIds: string[], acknowledgedBy?: string) => {
    const now = new Date().toISOString()
    setAlerts(prev =>
      prev.map(alert =>
        alertIds.includes(alert.id)
          ? { ...alert, acknowledgedAt: now, acknowledgedBy, signalType: 'acknowledged' as const }
          : alert
      )
    )
  }, [])

  const localSendNotifications = useCallback(async (alert: Alert, channels: AlertChannel[]) => {
    const token = safeGet(STORAGE_KEY_AUTH_TOKEN)
    const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
    return sendNotifications(alert, channels, token, API_BASE, FETCH_DEFAULT_TIMEOUT_MS)
  }, [])

  const queueBatchedAlertNotifications = useCallback((notifications: AlertNotificationBatch[]) => {
    queueMicrotask(() => {
      const token = safeGet(STORAGE_KEY_AUTH_TOKEN)
      const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
      sendBatchedNotifications(notifications, token, API_BASE, FETCH_DEFAULT_TIMEOUT_MS, settledWithConcurrency).catch(() => {
        // Silent failure - notifications are best-effort
      })
    })
  }, [])

  const resolveAlert = useCallback((alertId: string) => {
    const resolvedAt = new Date().toISOString()
    const alertToResolve = alertsRef.current.find(alert => alert.id === alertId)
    setAlerts(prev =>
      prev.map(alert =>
        alert.id === alertId
          ? { ...alert, status: 'resolved' as const, resolvedAt }
          : alert
      )
    )
    if (alertToResolve) {
      const rule = rulesRef.current.find(candidate => candidate.id === alertToResolve.ruleId)
      queueMicrotask(() => {
        if (rule) {
          const enabledChannels = (rule.channels || []).filter(channel => channel.enabled)
          if (enabledChannels.length > 0) {
            const resolvedAlert: Alert = { ...alertToResolve, status: 'resolved', resolvedAt }
            localSendNotifications(resolvedAlert, enabledChannels).catch((error) => {
              console.warn('[AlertsContext] resolved notification send failed:', error)
            })
          }
        }
      })
    }
  }, [localSendNotifications])

  const deleteAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId))
  }, [])

  const dispatchBrowserNotification = useCallback((params: BrowserNotificationParams) => {
    const { rule, dedupKey, title, body, deepLinkParams } = params
    if (!shouldDispatchBrowserNotification(rule, dedupKey, notifiedAlertKeysRef.current)) {
      return
    }
    setNotifiedKey(dedupKey, Date.now())
    sendNotificationWithDeepLink(title, body, deepLinkParams)
  }, [setNotifiedKey])

  const runAIDiagnosis = useCallback(async (alertId: string) => {
    const alert = alertsRef.current.find(candidate => candidate.id === alertId)
    if (!alert) return null

    if (diagnosisInFlightRef.current.has(alertId)) return null
    diagnosisInFlightRef.current.add(alertId)

    try {
      const rule = rulesRef.current.find(candidate => candidate.id === alert.ruleId)
      const conditionType = rule?.condition.type
      const runbook = conditionType ? findRunbookForCondition(conditionType) : undefined

      const basePrompt = `Please analyze this alert and provide diagnosis with suggestions:

Alert: ${alert.ruleName}
Severity: ${alert.severity}
Message: ${alert.message}
Cluster: ${alert.cluster || 'N/A'}
Resource: ${alert.resource || 'N/A'}
Details: ${JSON.stringify(alert.details, null, 2)}`

      let runbookEvidence = ''
      if (runbook) {
        try {
          const result = await executeRunbook(runbook, {
            cluster: alert.cluster,
            namespace: alert.namespace,
            resource: alert.resource,
            resourceKind: alert.resourceKind,
            alertMessage: alert.message,
          })
          if (result.enrichedPrompt) {
            runbookEvidence = `\n\n--- Runbook Evidence (${runbook.title}) ---\n${result.enrichedPrompt}`
            console.debug(`Runbook "${runbook.title}" gathered ${result.stepResults.length} evidence steps`)
          }
        } catch {
          // Silent failure - runbook is best-effort enhancement
        }
      }

      const initialPrompt = `${basePrompt}${runbookEvidence}

Please provide:
1. A summary of the issue
2. The likely root cause
3. Suggested actions to resolve this alert`

      const missionId = startMissionRef.current({
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
        prev.map(existing =>
          existing.id === alertId
            ? {
                ...existing,
                aiDiagnosis: {
                  summary: 'AI is analyzing this alert...',
                  rootCause: '',
                  suggestions: [],
                  missionId,
                  analyzedAt: new Date().toISOString(),
                },
              }
            : existing
        )
      )

      return missionId
    } finally {
      diagnosisInFlightRef.current.delete(alertId)
    }
  }, [])

  useEffect(() => {
    setAlerts(prev => {
      let changed = false
      const updated = prev.map(alert => {
        if (!alert.aiDiagnosis?.missionId) return alert
        const mission = allMissions.find(candidate => candidate.id === alert.aiDiagnosis!.missionId)
        if (!mission || mission.status !== 'completed') return alert
        const lastAssistant = [...mission.messages].reverse().find(message => message.role === 'assistant')
        if (!lastAssistant || alert.aiDiagnosis.summary !== 'AI is analyzing this alert...') return alert
        changed = true
        return {
          ...alert,
          aiDiagnosis: {
            ...alert.aiDiagnosis,
            summary: lastAssistant.content.slice(0, 500),
            analyzedAt: new Date().toISOString(),
          },
        }
      })
      return changed ? updated : prev
    })
  }, [allMissions])

  const { evaluateConditions } = createAlertRulesEngine({
    alertsRef,
    gpuNodesRef,
    podIssuesRef,
    clustersRef,
    rulesRef,
    mutationAccRef,
    cronJobResultsRef,
    nightlyE2ERef,
    nightlyAlertedRunsRef,
    isEvaluatingRef,
    isDemoMode,
    setAlerts,
    setIsEvaluating,
    localSendNotifications,
    queueBatchedNotifications: queueBatchedAlertNotifications,
    dispatchBrowserNotification,
    deleteNotifiedKey,
    persistNotifiedAlertKeys,
  })

  const evaluateConditionsRef = useRef(evaluateConditions)
  evaluateConditionsRef.current = evaluateConditions

  const stableEvaluateConditions = useCallback(() => {
    evaluateConditionsRef.current()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      evaluateConditionsRef.current()
    }, INITIAL_EVALUATION_DELAY_MS)

    const interval = setInterval(() => {
      evaluateConditionsRef.current()
    }, EVALUATION_INTERVAL_MS)

    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [])

  const isLoadingData = mcpData.isLoading && !loadingTimedOut
  const dataError = loadingTimedOut && mcpData.isLoading
    ? (mcpData.error || 'MCP data fetch timed out')
    : mcpData.error

  const value = useMemo<AlertsContextValue>(() => ({
    alerts,
    deduplicatedAlerts,
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
    evaluateConditions: stableEvaluateConditions,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
  }), [
    alerts,
    deduplicatedAlerts,
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
    stableEvaluateConditions,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
  ])

  return (
    <AlertsContext.Provider value={value}>
      <Suspense fallback={null}>
        <AlertsDataFetcher onData={enqueueMCPData} />
      </Suspense>
      {children}
    </AlertsContext.Provider>
  )
}

export const __alertsTestables = {
  shallowEqualRecords,
  alertDedupKey,
  deduplicateAlerts,
  applyMutations,
}
