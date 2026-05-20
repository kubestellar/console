import { useMemo, useCallback, useState } from 'react'
import { useGlobalFilters } from '../useGlobalFilters'
import { useDemoMode } from '../useDemoMode'
import { useCachedSecurityIssues } from '../useCachedData'
import {
  getMockSecurityData,
  getMockRBACData,
  getMockComplianceData,
  type ComplianceCheck
} from '../../mocks/securityData'
import { SHORT_DELAY_MS } from '../../lib/constants/network'
import { AMBER_500, BLUE_500, GREEN_500, PURPLE_500, RED_500 } from '../../lib/theme/chartColors'

export interface SecurityIssue {
  type: 'privileged' | 'root' | 'hostNetwork' | 'hostPID' | 'noSecurityContext'
  severity: 'high' | 'medium' | 'low'
  resource: string
  namespace: string
  cluster: string
  message: string
}

export interface RBACBinding {
  name: string
  kind: string
  riskLevel: 'high' | 'medium' | 'low'
  cluster: string
  namespace?: string
  subjects: Array<{ kind: string; name: string }>
  permissions: string[]
}

export interface SecurityStats {
  total: number
  high: number
  medium: number
  low: number
  typeCounts: Record<string, number>
  clusterCounts: Record<string, number>
  rbacTotal: number
  rbacHighRisk: number
  rbacMedRisk: number
  rbacLowRisk: number
  complianceTotal: number
  compliancePass: number
  complianceFail: number
  complianceWarn: number
  complianceScore: number
  severityChartData: Array<{ name: string; value: number; color: string }>
  typeChartData: Array<{ name: string; value: number; color: string }>
  rbacChartData: Array<{ name: string; value: number; color: string }>
  complianceChartData: Array<{ name: string; value: number; color: string }>
}

export function useSecurityData() {
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    filterBySeverity,
    customFilter
  } = useGlobalFilters()

  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { isDemoMode } = useDemoMode()
  const { issues: cachedSecurityIssues } = useCachedSecurityIssues()

  // Transform cached issues to match the page format
  const securityIssues = useMemo<SecurityIssue[]>(() => {
    if (isDemoMode) return getMockSecurityData()

    // Transform cached data to match mock format
    return cachedSecurityIssues.map(issue => {
      // Map issue string to type enum
      let type: SecurityIssue['type'] = 'noSecurityContext'
      const issueLower = (issue.issue || '').toLowerCase()
      if (issueLower.includes('privileged')) type = 'privileged'
      else if (issueLower.includes('root')) type = 'root'
      else if (issueLower.includes('host network')) type = 'hostNetwork'
      else if (issueLower.includes('host pid') || issueLower.includes('hostpid')) type = 'hostPID'
      else if (issueLower.includes('security context') || issueLower.includes('capabilities')) type = 'noSecurityContext'

      return {
        type,
        severity: issue.severity as SecurityIssue['severity'],
        resource: issue.name,
        namespace: issue.namespace,
        cluster: issue.cluster || 'unknown',
        message: issue.details || issue.issue
      }
    })
  }, [isDemoMode, cachedSecurityIssues])

  // RBAC and compliance data fetching requires backend API endpoints to be implemented first.
  const rbacBindings: RBACBinding[] = isDemoMode ? getMockRBACData() : []
  const complianceChecks: ComplianceCheck[] = isDemoMode ? getMockComplianceData() : []

  // Issues after global filter (before local severity filter)
  const globalFilteredIssues = useMemo(() => {
    let result = securityIssues

    // Apply global cluster filter
    if (!isAllClustersSelected) {
      result = result.filter(issue => globalSelectedClusters.includes(issue.cluster))
    }

    // Apply global severity filter
    result = filterBySeverity(result)

    // Apply global custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(issue =>
        issue.resource.toLowerCase().includes(query) ||
        issue.namespace.toLowerCase().includes(query) ||
        issue.cluster.toLowerCase().includes(query) ||
        issue.message.toLowerCase().includes(query)
      )
    }

    return result
  }, [securityIssues, isAllClustersSelected, globalSelectedClusters, filterBySeverity, customFilter])

  // Filter RBAC and compliance based on clusters
  const filteredRBAC = useMemo(() => {
    if (isAllClustersSelected) return rbacBindings
    return rbacBindings.filter(b => globalSelectedClusters.includes(b.cluster))
  }, [isAllClustersSelected, rbacBindings, globalSelectedClusters])

  const filteredCompliance = useMemo(() => {
    if (isAllClustersSelected) return complianceChecks
    return complianceChecks.filter(c => globalSelectedClusters.includes(c.cluster))
  }, [isAllClustersSelected, complianceChecks, globalSelectedClusters])

  const stats = useMemo<SecurityStats>(() => {
    const high = globalFilteredIssues.filter(i => i.severity === 'high').length
    const medium = globalFilteredIssues.filter(i => i.severity === 'medium').length
    const low = globalFilteredIssues.filter(i => i.severity === 'low').length

    // Issue type counts
    const typeCounts = globalFilteredIssues.reduce((acc, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Cluster distribution
    const clusterCounts = globalFilteredIssues.reduce((acc, issue) => {
      acc[issue.cluster] = (acc[issue.cluster] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // RBAC stats
    const rbacHighRisk = filteredRBAC.filter(r => r.riskLevel === 'high').length
    const rbacMedRisk = filteredRBAC.filter(r => r.riskLevel === 'medium').length
    const rbacLowRisk = filteredRBAC.filter(r => r.riskLevel === 'low').length

    // Compliance stats
    const compliancePass = filteredCompliance.filter(c => c.status === 'pass').length
    const complianceFail = filteredCompliance.filter(c => c.status === 'fail').length
    const complianceWarn = filteredCompliance.filter(c => c.status === 'warn').length
    const complianceScore = filteredCompliance.length > 0
      ? Math.round((compliancePass / filteredCompliance.length) * 100)
      : 100

    return {
      total: globalFilteredIssues.length,
      high,
      medium,
      low,
      typeCounts,
      clusterCounts,
      rbacTotal: filteredRBAC.length,
      rbacHighRisk,
      rbacMedRisk,
      rbacLowRisk,
      complianceTotal: filteredCompliance.length,
      compliancePass,
      complianceFail,
      complianceWarn,
      complianceScore,
      // Chart data
      severityChartData: [
        { name: 'High', value: high, color: RED_500 },
        { name: 'Medium', value: medium, color: AMBER_500 },
        { name: 'Low', value: low, color: BLUE_500 },
      ].filter(d => d.value > 0),
      typeChartData: Object.entries(typeCounts).map(([name, value], i) => ({
        name: name.replace(/([A-Z])/g, ' $1').trim(),
        value,
        color: [RED_500, AMBER_500, BLUE_500, GREEN_500, PURPLE_500][i % 5]
      })),
      rbacChartData: [
        { name: 'High Risk', value: rbacHighRisk, color: RED_500 },
        { name: 'Medium Risk', value: rbacMedRisk, color: AMBER_500 },
        { name: 'Low Risk', value: rbacLowRisk, color: GREEN_500 },
      ].filter(d => d.value > 0),
      complianceChartData: [
        { name: 'Pass', value: compliancePass, color: GREEN_500 },
        { name: 'Warn', value: complianceWarn, color: AMBER_500 },
        { name: 'Fail', value: complianceFail, color: RED_500 },
      ].filter(d => d.value > 0)
    }
  }, [globalFilteredIssues, filteredRBAC, filteredCompliance])

  // Refresh function for security data
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    setRefreshError(null)
    try {
      await new Promise(resolve => setTimeout(resolve, SHORT_DELAY_MS))
      setLastUpdated(new Date())
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to refresh security data'
      setRefreshError(message)
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  return {
    securityIssues: globalFilteredIssues,
    rbacBindings: filteredRBAC,
    complianceChecks: filteredCompliance,
    stats,
    isRefreshing,
    lastUpdated,
    refreshError,
    handleRefresh,
  }
}
