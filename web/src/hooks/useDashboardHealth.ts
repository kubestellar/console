import { useMemo } from 'react'
import { ROUTES } from '@/config/routes'
import { useAlerts } from './useAlerts'
import { useBackendHealth } from './useBackendHealth'
import { useLocalAgent } from './useLocalAgent'
import { useClusters, usePodIssues } from './useMCP'
import { summarizeClusterHealth } from '../components/clusters/utils'

export type DashboardHealthStatus = 'healthy' | 'warning' | 'critical'

export interface DashboardHealthInfo {
  status: DashboardHealthStatus
  message: string
  details: string[]
  criticalCount: number
  warningCount: number
  navigateTo?: string
}

/**
 * Hook to aggregate health status across the dashboard.
 * Checks alerts, cluster health, pod issues, backend connectivity, and
 * agent-level data-path degradation so page health matches the top bar.
 */
export function useDashboardHealth(): DashboardHealthInfo {
  const { activeAlerts } = useAlerts()
  const { deduplicatedClusters, isLoading: clustersLoading } = useClusters()
  const { issues: podIssues, isLoading: podsLoading } = usePodIssues()
  const { status: backendStatus } = useBackendHealth()
  const { status: agentStatus, dataErrorCount } = useLocalAgent()

  return useMemo(() => {
    const details: string[] = []
    let criticalCount = 0
    let warningCount = 0
    let hasAgentDegradation = false

    if (backendStatus === 'disconnected') {
      criticalCount += 1
      details.push('Backend API unreachable')
    }

    if (agentStatus === 'degraded') {
      hasAgentDegradation = true
      warningCount += 1
      details.push(`Local agent degraded (${dataErrorCount} error${dataErrorCount === 1 ? '' : 's'})`)
    }

    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical').length
    const warningAlerts = activeAlerts.filter(a => a.severity === 'warning').length

    if (criticalAlerts > 0) {
      criticalCount += criticalAlerts
      details.push(`${criticalAlerts} critical alert${criticalAlerts > 1 ? 's' : ''}`)
    }
    if (warningAlerts > 0) {
      warningCount += warningAlerts
      details.push(`${warningAlerts} warning alert${warningAlerts > 1 ? 's' : ''}`)
    }

    if (!clustersLoading && deduplicatedClusters.length > 0) {
      const clusterSummary = summarizeClusterHealth(deduplicatedClusters)

      if (clusterSummary.unreachable > 0) {
        criticalCount += clusterSummary.unreachable
        details.push(`${clusterSummary.unreachable} cluster${clusterSummary.unreachable > 1 ? 's' : ''} offline`)
      } else if (clusterSummary.unhealthy > 0) {
        warningCount += clusterSummary.unhealthy
        details.push(`${clusterSummary.unhealthy} cluster${clusterSummary.unhealthy > 1 ? 's' : ''} degraded`)
      }
    }

    if (!podsLoading && podIssues.length > 0) {
      const crashingPods = podIssues.filter(
        p => p.reason === 'CrashLoopBackOff' || p.reason === 'Error'
      ).length

      if (crashingPods > 0) {
        warningCount += crashingPods
        details.push(`${crashingPods} pod${crashingPods > 1 ? 's' : ''} failing`)
      }
    }

    let status: DashboardHealthStatus = 'healthy'
    let message = 'All systems healthy'
    let navigateTo: string | undefined

    if (criticalCount > 0) {
      status = 'critical'
      message = `${criticalCount} critical issue${criticalCount > 1 ? 's' : ''}`
      navigateTo = ROUTES.ALERTS
    } else if (warningCount > 0) {
      status = 'warning'
      message = hasAgentDegradation && warningCount === 1
        ? 'Degraded'
        : `${warningCount} warning${warningCount > 1 ? 's' : ''}`
      navigateTo = ROUTES.ALERTS
    }

    return {
      status,
      message,
      details,
      criticalCount,
      warningCount,
      navigateTo,
    }
  }, [
    activeAlerts,
    agentStatus,
    backendStatus,
    clustersLoading,
    dataErrorCount,
    deduplicatedClusters,
    podIssues,
    podsLoading,
  ])
}
