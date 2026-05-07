import { useMemo } from 'react'
import { ROUTES } from '@/config/routes'
import { useAlerts } from './useAlerts'
import { useBackendHealth } from './useBackendHealth'
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
 * Hook to aggregate health status across the dashboard
 * Checks alerts, cluster health, pod issues, and backend connectivity.
 *
 * Backend connectivity (issue #8162): persistent failures of the root
 * `/health` endpoint — which also indicate that downstream API calls
 * such as `/api/kagent/status`, `/api/kagenti-provider/status`, and
 * various `/api/.../runs` and `/api/.../stream` endpoints are likely
 * returning 503 — are surfaced as a critical dashboard health state so
 * the UI does not appear "healthy" while backend services are down.
 */
export function useDashboardHealth(): DashboardHealthInfo {
  const { activeAlerts } = useAlerts()
  const { deduplicatedClusters, isLoading: clustersLoading } = useClusters()
  const { issues: podIssues, isLoading: podsLoading } = usePodIssues()
  const { status: backendStatus } = useBackendHealth()

  return useMemo(() => {
    const details: string[] = []
    let criticalCount = 0
    let warningCount = 0

    // Backend connectivity check (issue #8162).
    // `useBackendHealth` only flips to 'disconnected' after a debounced
    // number of consecutive failures on /health (see FAILURE_THRESHOLD in
    // useBackendHealth.ts), so this is a persistent-failure signal, not a
    // transient one. When demo mode is active on Netlify, /health is
    // mocked (web/src/mocks/handlers.ts) and this branch stays inactive.
    if (backendStatus === 'disconnected') {
      criticalCount += 1
      details.push('Backend API unreachable')
    }

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
      const clusterSummary = summarizeClusterHealth(deduplicatedClusters)

      if (clusterSummary.unreachable > 0) {
        criticalCount += clusterSummary.unreachable
        details.push(`${clusterSummary.unreachable} cluster${clusterSummary.unreachable > 1 ? 's' : ''} offline`)
      } else if (clusterSummary.unhealthy > 0) {
        warningCount += clusterSummary.unhealthy
        details.push(`${clusterSummary.unhealthy} cluster${clusterSummary.unhealthy > 1 ? 's' : ''} degraded`)
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
      navigateTo = ROUTES.ALERTS
    } else if (warningCount > 0) {
      status = 'warning'
      message = `${warningCount} warning${warningCount > 1 ? 's' : ''}`
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
  }, [activeAlerts, deduplicatedClusters, clustersLoading, podIssues, podsLoading, backendStatus])
}
