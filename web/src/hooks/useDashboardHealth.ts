import { useMemo } from 'react'
import { useAlerts } from './useAlerts'
import { useClusters, usePodIssues } from './useMCP'

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
 * Hook to aggregate health status across the dashboard
 * Checks alerts, cluster health, and pod issues
 */
export function useDashboardHealth(): DashboardHealthInfo {
  const { stats: alertStats, activeAlerts } = useAlerts()
  const { deduplicatedClusters, isLoading: clustersLoading } = useClusters()
  const { issues: podIssues, isLoading: podsLoading } = usePodIssues()

  return useMemo(() => {
    const details: string[] = []
    let criticalCount = 0
    let warningCount = 0

    // Count critical and warning alerts
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

    // Check cluster health (only if data is loaded)
    if (!clustersLoading && deduplicatedClusters.length > 0) {
      const unhealthyClusters = deduplicatedClusters.filter(c => !c.healthy).length
      const unreachableClusters = deduplicatedClusters.filter(c => c.reachable === false).length
      
      if (unreachableClusters > 0) {
        criticalCount += unreachableClusters
        details.push(`${unreachableClusters} cluster${unreachableClusters > 1 ? 's' : ''} offline`)
      } else if (unhealthyClusters > 0) {
        warningCount += unhealthyClusters
        details.push(`${unhealthyClusters} cluster${unhealthyClusters > 1 ? 's' : ''} degraded`)
      }
    }

    // Check pod issues (only if data is loaded)
    if (!podsLoading && podIssues.length > 0) {
      const crashingPods = podIssues.filter(p => 
        p.reason === 'CrashLoopBackOff' || p.reason === 'Error'
      ).length
      
      if (crashingPods > 0) {
        warningCount += crashingPods
        details.push(`${crashingPods} pod${crashingPods > 1 ? 's' : ''} failing`)
      }
    }

    // Determine overall status
    let status: DashboardHealthStatus = 'healthy'
    let message = 'All systems healthy'
    let navigateTo: string | undefined

    if (criticalCount > 0) {
      status = 'critical'
      message = `${criticalCount} critical issue${criticalCount > 1 ? 's' : ''}`
      navigateTo = '/alerts'
    } else if (warningCount > 0) {
      status = 'warning'
      message = `${warningCount} warning${warningCount > 1 ? 's' : ''}`
      navigateTo = '/alerts'
    }

    return {
      status,
      message,
      details,
      criticalCount,
      warningCount,
      navigateTo,
    }
  }, [activeAlerts, alertStats, deduplicatedClusters, clustersLoading, podIssues, podsLoading])
}
