import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useGPUNodes, usePodIssues, useClusters } from '../hooks/useMCP'
import { useMissions } from '../hooks/useMissions'
import { useDemoMode } from '../hooks/useDemoMode'
import { getPresentationMode } from '../hooks/usePresentationMode'
import type {
  Alert,
  AlertRule,
  AlertStats,
  AlertChannel,
} from '../types/alerts'
import { PRESET_ALERT_RULES } from '../types/alerts'

// Generate unique ID
function generateId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Local storage keys
const ALERT_RULES_KEY = 'kc_alert_rules'
const ALERTS_KEY = 'kc_alerts'

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

interface AlertsContextValue {
  alerts: Alert[]
  activeAlerts: Alert[]
  acknowledgedAlerts: Alert[]
  stats: AlertStats
  rules: AlertRule[]
  isEvaluating: boolean
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

const AlertsContext = createContext<AlertsContextValue | null>(null)

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

  const { nodes: gpuNodes } = useGPUNodes()
  const { issues: podIssues } = usePodIssues()
  const { clusters } = useClusters()
  const { startMission } = useMissions()
  const { isDemoMode } = useDemoMode()
  const previousDemoMode = useRef(isDemoMode)

  // Save rules whenever they change
  useEffect(() => {
    saveToStorage(ALERT_RULES_KEY, rules)
  }, [rules])

  // Save alerts whenever they change
  useEffect(() => {
    saveToStorage(ALERTS_KEY, alerts)
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

  // Get active (firing) alerts - exclude acknowledged alerts by default
  const activeAlerts = useMemo(() => {
    return alerts.filter(a => a.status === 'firing' && !a.acknowledgedAt)
  }, [alerts])

  // Get acknowledged alerts that are still firing
  const acknowledgedAlerts = useMemo(() => {
    return alerts.filter(a => a.status === 'firing' && a.acknowledgedAt)
  }, [alerts])

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
    setAlerts(prev =>
      prev.map(alert =>
        alert.id === alertId
          ? { ...alert, status: 'resolved' as const, resolvedAt: new Date().toISOString() }
          : alert
      )
    )
  }, [])

  // Delete an alert
  const deleteAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId))
  }, [])

  // Create a new alert
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
      setAlerts(prev => {
        // Check if similar alert already exists and is firing
        const existingAlert = prev.find(
          a =>
            a.ruleId === rule.id &&
            a.status === 'firing' &&
            a.cluster === cluster &&
            a.resource === resource
        )

        if (existingAlert) {
          return prev
        }

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
          isDemo: isDemoMode, // Mark alert as demo if created during demo mode
        }

        // Send notification to configured channels (async, non-blocking, silent failures)
        if (rule.channels && rule.channels.length > 0) {
          const enabledChannels = rule.channels.filter(ch => ch.enabled)
          if (enabledChannels.length > 0) {
            // Send notifications asynchronously without blocking alert creation
            sendNotifications(alert, enabledChannels).catch(() => {
              // Silent failure - notifications are best-effort
            })
          }
        }

        return [alert, ...prev]
      })
    },
    [isDemoMode]
  )

  // Send notifications for an alert (best-effort, silent on auth failures)
  const sendNotifications = async (alert: Alert, channels: AlertChannel[]) => {
    try {
      const token = localStorage.getItem('auth_token')
      // Skip notification if not authenticated - notifications require login
      if (!token) return

      const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

      const response = await fetch(`${API_BASE}/api/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ alert, channels }),
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

  // Run AI diagnosis on an alert
  const runAIDiagnosis = useCallback(
    (alertId: string) => {
      const alert = alerts.find(a => a.id === alertId)
      if (!alert) return null

      const missionId = startMission({
        title: `Diagnose: ${alert.ruleName}`,
        description: `Analyzing alert on ${alert.cluster || 'cluster'}`,
        type: 'troubleshoot',
        cluster: alert.cluster,
        initialPrompt: `Please analyze this alert and provide diagnosis with suggestions:

Alert: ${alert.ruleName}
Severity: ${alert.severity}
Message: ${alert.message}
Cluster: ${alert.cluster || 'N/A'}
Resource: ${alert.resource || 'N/A'}
Details: ${JSON.stringify(alert.details, null, 2)}

Please provide:
1. A summary of the issue
2. The likely root cause
3. Suggested actions to resolve this alert`,
        context: {
          alertId,
          alertType: alert.ruleName,
          details: alert.details,
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
    [alerts, startMission]
  )

  // Evaluate alert conditions
  const evaluateConditions = useCallback(() => {
    if (isEvaluating) return
    setIsEvaluating(true)

    try {
      const enabledRules = rules.filter(r => r.enabled)

      for (const rule of enabledRules) {
        switch (rule.condition.type) {
          case 'gpu_usage':
            evaluateGPUUsage(rule)
            break
          case 'node_not_ready':
            evaluateNodeReady(rule)
            break
          case 'pod_crash':
            evaluatePodCrash(rule)
            break
          case 'weather_alerts':
            evaluateWeatherAlerts(rule)
            break
          default:
            break
        }
      }
    } finally {
      setIsEvaluating(false)
    }
  }, [rules, gpuNodes, podIssues, clusters, isEvaluating])

  // Evaluate GPU usage condition
  const evaluateGPUUsage = useCallback(
    (rule: AlertRule) => {
      const threshold = rule.condition.threshold || 90
      const relevantClusters = rule.condition.clusters?.length
        ? clusters.filter(c => rule.condition.clusters!.includes(c.name))
        : clusters

      for (const cluster of relevantClusters) {
        const clusterGPUNodes = gpuNodes.filter(n => n.cluster.startsWith(cluster.name))
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
          setAlerts(prev => {
            const firingAlert = prev.find(
              a =>
                a.ruleId === rule.id &&
                a.status === 'firing' &&
                a.cluster === cluster.name
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
        }
      }
    },
    [gpuNodes, clusters, createAlert]
  )

  // Evaluate node ready condition
  const evaluateNodeReady = useCallback(
    (rule: AlertRule) => {
      const relevantClusters = rule.condition.clusters?.length
        ? clusters.filter(c => rule.condition.clusters!.includes(c.name))
        : clusters

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
          setAlerts(prev => {
            const firingAlert = prev.find(
              a =>
                a.ruleId === rule.id &&
                a.status === 'firing' &&
                a.cluster === cluster.name
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
        }
      }
    },
    [clusters, createAlert]
  )

  // Evaluate pod crash condition
  const evaluatePodCrash = useCallback(
    (rule: AlertRule) => {
      const threshold = rule.condition.threshold || 5

      for (const issue of podIssues) {
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
    [podIssues, createAlert]
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
          case 'extreme_heat':
            const temp = rule.condition.temperatureThreshold || 100
            message = `Extreme heat alert - Temperature expected to exceed ${temp}°F`
            details.temperature = temp + 5
            details.threshold = temp
            break
          case 'heavy_rain':
            message = 'Heavy rain warning - Flooding possible'
            details.rainfall = '2-3 inches'
            break
          case 'snow':
            message = 'Winter storm warning - Heavy snow expected'
            details.snowfall = '6-12 inches'
            break
          case 'high_wind':
            const windSpeed = rule.condition.windSpeedThreshold || 40
            message = `High wind warning - Gusts up to ${windSpeed + 10} mph expected`
            details.windSpeed = windSpeed + 10
            details.threshold = windSpeed
            break
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
        setAlerts(prev => {
          const firingAlert = prev.find(
            a => a.ruleId === rule.id && a.status === 'firing'
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
      }
    },
    [createAlert]
  )

  // Periodic evaluation (every 30 seconds)
  useEffect(() => {
    const timer = setTimeout(() => {
      evaluateConditions()
    }, 1000)

    const alertInterval = getPresentationMode() ? 300000 : 30000
    const interval = setInterval(() => {
      evaluateConditions()
    }, alertInterval)

    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [evaluateConditions])

  const value: AlertsContextValue = {
    alerts,
    activeAlerts,
    acknowledgedAlerts,
    stats,
    rules,
    isEvaluating,
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
  }

  return (
    <AlertsContext.Provider value={value}>
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
