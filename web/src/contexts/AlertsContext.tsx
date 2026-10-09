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
import type { Alert, AlertStats, AlertChannel } from '../types/alerts'
import type { AlertsContextValue, AlertNotificationBatch, MutationAccumulator } from './AlertsContext.types'
import { MS_PER_SECOND } from '../lib/constants/time'
import { safeGet } from '../lib/safeLocalStorage'
import {
  ALERTS_KEY,
  loadNotifiedAlertKeys,
  saveNotifiedAlertKeys,
  loadFromStorage,
  saveAlerts,
} from './alertStorage'
import { STORAGE_KEY_AUTH_TOKEN } from '../lib/constants/storage'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { logger } from '@/lib/logger'
import {
  shouldDispatchBrowserNotification,
  type BrowserNotificationParams,
  sendNotifications,
  sendBatchedNotifications,
} from './notifications'
import { sendNotificationWithDeepLink } from '../hooks/useDeepLink'
import { alertDedupKey, deduplicateAlerts } from './alerts/deduplication'
import { useBatchedMCPData } from './useBatchedMCPData'
import { useAlertsOptionalPollers } from './useAlertsOptionalPollers'
import { createStateContext } from './createStateContext'
import { applyMutations, createAlertRulesEngine, shallowEqualRecords } from './alertRulesEngine'
import { useAlertRules } from './useAlertRules'
import { useAlertAIDiagnosis } from './useAlertAIDiagnosis'

const AlertsDataFetcher = safeLazy(() => import('./AlertsDataFetcher'), 'default')
const ALERTS_LOADING_TIMEOUT_MS = 30 * MS_PER_SECOND
const INITIAL_EVALUATION_DELAY_MS = MS_PER_SECOND
const EVALUATION_INTERVAL_MS = 30 * MS_PER_SECOND

const {
  Context: AlertsContext,
  useRequiredStateContext: useAlertsContext,
} = createStateContext<AlertsContextValue>({
  name: 'Alerts',
  hookName: 'useAlertsContext',
  providerLabel: 'an AlertsProvider',
})

// eslint-disable-next-line react-refresh/only-export-components -- context + hook re-export pattern; flagged by eslint-plugin-react-refresh 0.5.6
export { AlertsContext, useAlertsContext }

export function AlertsProvider({ children }: { children: ReactNode }) {
  const { rules, createRule, updateRule, deleteRule, toggleRule } = useAlertRules()
  const [alerts, setAlerts] = useState<Alert[]>(() => loadFromStorage<Alert[]>(ALERTS_KEY, []))
  const [isEvaluating, setIsEvaluating] = useState(false)
  const { mcpData, enqueueMCPData } = useBatchedMCPData()
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)

  const { startMission, missions: allMissions } = useMissions()
  const { isDemoMode } = useDemoMode()

  const previousDemoMode = useRef(isDemoMode)
  const mutationAccRef = useRef<MutationAccumulator | null>(null)
  const notifiedAlertKeysRef = useRef<Map<string, number>>(loadNotifiedAlertKeys())
  const nightlyAlertedRunsRef = useRef<Set<number>>(new Set())
  const isEvaluatingRef = useRef(false)

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
  const { cronJobResultsRef, nightlyE2ERef } = useAlertsOptionalPollers(clustersRef)

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
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    if (!mcpData.isLoading) {
      setLoadingTimedOut(false)
      return
    }
    const timer = setTimeout(() => {
      setLoadingTimedOut(true)
    }, ALERTS_LOADING_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [mcpData.isLoading])


  useEffect(() => {
    saveAlerts(alerts)
  }, [alerts])

  useEffect(() => {
    if (previousDemoMode.current && !isDemoMode) {
      setAlerts(prev => prev.filter(alert => !alert.isDemo))
    }
    previousDemoMode.current = isDemoMode
  }, [isDemoMode])

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
      void Promise.resolve(
        sendBatchedNotifications(notifications, token, API_BASE, FETCH_DEFAULT_TIMEOUT_MS, settledWithConcurrency)
      ).catch(() => {
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
              logger.error('[AlertsContext] resolved notification send failed:', error)
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('alert-notification-error', {
                  detail: { 
                    error: error instanceof Error ? error.message : String(error), 
                    timestamp: Date.now(),
                    context: 'resolved-notification',
                    alertId,
                  }
                }))
              }
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

  const { runAIDiagnosis } = useAlertAIDiagnosis({
    alertsRef,
    rulesRef,
    startMissionRef,
    allMissions,
    setAlerts,
  })

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

// eslint-disable-next-line react-refresh/only-export-components
export const __alertsTestables = {
  shallowEqualRecords,
  alertDedupKey,
  deduplicateAlerts,
  applyMutations,
}
