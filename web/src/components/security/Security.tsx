import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Shield, ShieldAlert, ShieldCheck, ShieldX, Users, Key, Lock, Eye, Clock, AlertTriangle, CheckCircle2, XCircle, ChevronRight } from 'lucide-react'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatusIndicator } from '../charts/StatusIndicator'
import { DonutChart } from '../charts/PieChart'
import { ProgressBar } from '../charts/ProgressBar'
import { ClusterBadge } from '../ui/ClusterBadge'
import { cn } from '../../lib/cn'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { useCachedSecurityIssues } from '../../hooks/useCachedData'
import { Skeleton } from '../ui/Skeleton'
import {
  getMockSecurityData,
  getMockRBACData,
  getMockComplianceData,
  type ComplianceCheck,
} from '../../mocks/securityData'
import { getDefaultCards } from '../../config/dashboards'

const SECURITY_CARDS_KEY = 'kubestellar-security-cards'

// Default cards for the security dashboard
const DEFAULT_SECURITY_CARDS = getDefaultCards('security')

type ViewTab = 'overview' | 'issues' | 'rbac' | 'compliance'

export function Security() {
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    filterBySeverity,
    customFilter,
  } = useGlobalFilters()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<ViewTab>('overview')
  const [selectedIssueType, setSelectedIssueType] = useState<string | null>(null)
  const [dataRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  // Check demo mode and agent status
  const { isDemoMode } = useDemoMode()
  const { status: agentStatus } = useLocalAgent()

  // When demo mode is OFF and agent is not connected, force skeleton display
  const isAgentOffline = agentStatus === 'disconnected'
  const forceSkeletonForOffline = !isDemoMode && isAgentOffline

  // Fetch cached security issues (stale-while-revalidate pattern)
  const { issues: cachedSecurityIssues, isLoading: securityLoading, isRefreshing: securityRefreshing } = useCachedSecurityIssues()

  // Refresh function for security data
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    setRefreshError(null)
    try {
      // In a real implementation, this would refetch security data
      // For now, just simulate a refresh
      await new Promise(resolve => setTimeout(resolve, 500))
      setLastUpdated(new Date())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh security data'
      setRefreshError(message)
      console.error('Security data refresh failed:', error)
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  // Handle addCard URL param - open modal and clear param
  useEffect(() => {
    if (searchParams.get('addCard') === 'true') {
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Trigger refresh on mount (ensures data is fresh when navigating to this page)
  useEffect(() => {
    handleRefresh()
  }, [handleRefresh])

  // Transform cached issues to match the page format
  const securityIssues = useMemo(() => {
    if (isDemoMode) return getMockSecurityData()

    // Transform cached data to match mock format
    return cachedSecurityIssues.map(issue => {
      // Map issue string to type enum
      let type: 'privileged' | 'root' | 'hostNetwork' | 'hostPID' | 'noSecurityContext' = 'noSecurityContext'
      const issueLower = issue.issue.toLowerCase()
      if (issueLower.includes('privileged')) type = 'privileged'
      else if (issueLower.includes('root')) type = 'root'
      else if (issueLower.includes('host network')) type = 'hostNetwork'
      else if (issueLower.includes('host pid') || issueLower.includes('hostpid')) type = 'hostPID'
      else if (issueLower.includes('security context') || issueLower.includes('capabilities')) type = 'noSecurityContext'

      return {
        type,
        severity: issue.severity as 'high' | 'medium' | 'low',
        resource: issue.name,
        namespace: issue.namespace,
        cluster: issue.cluster || 'unknown',
        message: issue.details || issue.issue,
      }
    })
  }, [isDemoMode, cachedSecurityIssues])

  // RBAC and compliance still use mock data (TODO: implement cached hooks for these)
  const rbacBindings = useMemo(() => isDemoMode ? getMockRBACData() : [], [isDemoMode])
  const complianceChecks = useMemo(() => isDemoMode ? getMockComplianceData() : [], [isDemoMode])

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
  }, [securityIssues, globalSelectedClusters, isAllClustersSelected, filterBySeverity, customFilter])

  const filteredIssues = useMemo(() => {
    let result = globalFilteredIssues
    // Apply local severity filter
    if (severityFilter !== 'all') {
      result = result.filter(issue => issue.severity === severityFilter)
    }
    return result
  }, [globalFilteredIssues, severityFilter])

  // Filter RBAC and compliance based on clusters
  const filteredRBAC = useMemo(() => {
    if (isAllClustersSelected) return rbacBindings
    return rbacBindings.filter(b => globalSelectedClusters.includes(b.cluster))
  }, [rbacBindings, globalSelectedClusters, isAllClustersSelected])

  const filteredCompliance = useMemo(() => {
    if (isAllClustersSelected) return complianceChecks
    return complianceChecks.filter(c => globalSelectedClusters.includes(c.cluster))
  }, [complianceChecks, globalSelectedClusters, isAllClustersSelected])

  const stats = useMemo(() => {
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
        { name: 'High', value: high, color: '#ef4444' },
        { name: 'Medium', value: medium, color: '#f59e0b' },
        { name: 'Low', value: low, color: '#3b82f6' },
      ].filter(d => d.value > 0),
      typeChartData: Object.entries(typeCounts).map(([name, value], i) => ({
        name: name.replace(/([A-Z])/g, ' $1').trim(),
        value,
        color: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'][i % 5],
      })),
      rbacChartData: [
        { name: 'High Risk', value: rbacHighRisk, color: '#ef4444' },
        { name: 'Medium Risk', value: rbacMedRisk, color: '#f59e0b' },
        { name: 'Low Risk', value: rbacLowRisk, color: '#10b981' },
      ].filter(d => d.value > 0),
      complianceChartData: [
        { name: 'Pass', value: compliancePass, color: '#10b981' },
        { name: 'Warn', value: complianceWarn, color: '#f59e0b' },
        { name: 'Fail', value: complianceFail, color: '#ef4444' },
      ].filter(d => d.value > 0),
    }
  }, [globalFilteredIssues, filteredRBAC, filteredCompliance])

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-400 bg-red-500/20'
      case 'medium': return 'text-yellow-400 bg-yellow-500/20'
      case 'low': return 'text-blue-400 bg-blue-500/20'
      default: return 'text-muted-foreground bg-card'
    }
  }

  const typeIcon = (type: string) => {
    switch (type) {
      case 'privileged':
        return (
          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )
      case 'root':
        return (
          <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        )
      default:
        return (
          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        )
    }
  }

  // Get type label for display
  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      privileged: 'Privileged Container',
      root: 'Running as Root',
      hostNetwork: 'Host Network',
      hostPID: 'Host PID',
      noSecurityContext: 'No Security Context',
    }
    return labels[type] || type
  }

  // Group compliance by category
  const complianceByCategory = useMemo(() => {
    return filteredCompliance.reduce((acc, check) => {
      if (!acc[check.category]) acc[check.category] = []
      acc[check.category].push(check)
      return acc
    }, {} as Record<string, ComplianceCheck[]>)
  }, [filteredCompliance])

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    const hasDataToShow = stats.total > 0
    switch (blockId) {
      case 'issues':
        return { value: stats.total, sublabel: 'total issues', onClick: () => setActiveTab('issues'), isClickable: hasDataToShow }
      case 'critical':
        return { value: stats.high, sublabel: 'critical issues', onClick: () => { setSeverityFilter('high'); setActiveTab('issues') }, isClickable: stats.high > 0 }
      case 'high':
        return { value: stats.high, sublabel: 'high severity', onClick: () => { setSeverityFilter('high'); setActiveTab('issues') }, isClickable: stats.high > 0 }
      case 'medium':
        return { value: stats.medium, sublabel: 'medium severity', onClick: () => { setSeverityFilter('medium'); setActiveTab('issues') }, isClickable: stats.medium > 0 }
      case 'low':
        return { value: stats.low, sublabel: 'low severity', onClick: () => { setSeverityFilter('low'); setActiveTab('issues') }, isClickable: stats.low > 0 }
      case 'privileged':
        return { value: stats.typeCounts['privileged'] || 0, sublabel: 'privileged containers' }
      case 'root':
        return { value: stats.typeCounts['root'] || 0, sublabel: 'running as root' }
      default:
        return { value: 0 }
    }
  }, [stats, setActiveTab, setSeverityFilter])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  // Tabs section (rendered between stats and cards)
  const tabsSection = (
    <>
      {/* Error Banner */}
      {refreshError && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Failed to refresh security data</p>
            <p className="text-sm text-red-300/80">{refreshError}</p>
          </div>
          <button
            onClick={handleRefresh}
            className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {[
          { id: 'overview', label: 'Overview', icon: Shield },
          { id: 'issues', label: 'Issues', icon: ShieldAlert, count: stats.total },
          { id: 'rbac', label: 'RBAC', icon: Users, count: stats.rbacTotal },
          { id: 'compliance', label: 'Compliance', icon: ShieldCheck },
        ].map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ViewTab)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-[2px] transition-colors',
                activeTab === tab.id
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={cn(
                  'px-1.5 py-0.5 text-xs rounded-full',
                  tab.id === 'issues' && stats.high > 0 ? 'bg-red-500/20 text-red-400' : 'bg-card text-muted-foreground'
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </>
  )

  return (
    <DashboardPage
      title="Security"
      subtitle="RBAC, compliance, and security policies across your clusters"
      icon="Shield"
      storageKey={SECURITY_CARDS_KEY}
      defaultCards={DEFAULT_SECURITY_CARDS}
      statsType="security"
      getStatValue={getStatValue}
      onRefresh={handleRefresh}
      isLoading={securityLoading}
      isRefreshing={dataRefreshing || securityRefreshing}
      lastUpdated={lastUpdated}
      hasData={stats.total > 0 || securityIssues.length > 0}
      beforeCards={tabsSection}
      emptyState={{
        title: 'Security Dashboard',
        description: 'Add cards to monitor security issues, RBAC policies, and compliance checks across your clusters.',
      }}
    >
      {/* Show skeleton when agent is offline and demo mode is OFF */}
      {forceSkeletonForOffline ? (
        <div className="space-y-6">
          {/* Quick Stats Skeleton */}
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass p-4 rounded-lg">
                <div className="flex items-center gap-3">
                  <Skeleton variant="circular" width={40} height={40} />
                  <div>
                    <Skeleton variant="text" width={60} height={28} className="mb-1" />
                    <Skeleton variant="text" width={80} height={12} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Charts Skeleton */}
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass p-4 rounded-lg">
                <Skeleton variant="text" width={100} height={16} className="mb-4" />
                <div className="flex justify-center">
                  <Skeleton variant="circular" width={150} height={150} />
                </div>
              </div>
            ))}
          </div>
          {/* Lists Skeleton */}
          <div className="grid grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="glass p-4 rounded-lg">
                <Skeleton variant="text" width={120} height={16} className="mb-4" />
                <div className="space-y-2">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="flex items-center gap-3 p-2 rounded bg-secondary/20">
                      <Skeleton variant="circular" width={16} height={16} />
                      <div className="flex-1">
                        <Skeleton variant="text" width={150} height={14} className="mb-1" />
                        <Skeleton variant="text" width={80} height={12} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
      <>
      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-4">
            <button
              onClick={() => { setActiveTab('issues'); setSeverityFilter('all'); }}
              className="glass p-4 rounded-lg text-left hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/20">
                  <ShieldAlert className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{stats.total}</div>
                  <div className="text-xs text-muted-foreground">Security Issues</div>
                </div>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('rbac')}
              className="glass p-4 rounded-lg text-left hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{stats.rbacTotal}</div>
                  <div className="text-xs text-muted-foreground">RBAC Bindings</div>
                </div>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('compliance')}
              className="glass p-4 rounded-lg text-left hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'p-2 rounded-lg',
                  stats.complianceScore >= 80 ? 'bg-green-500/20' :
                  stats.complianceScore >= 60 ? 'bg-yellow-500/20' : 'bg-red-500/20'
                )}>
                  <ShieldCheck className={cn(
                    'w-5 h-5',
                    stats.complianceScore >= 80 ? 'text-green-400' :
                    stats.complianceScore >= 60 ? 'text-yellow-400' : 'text-red-400'
                  )} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{stats.complianceScore}%</div>
                  <div className="text-xs text-muted-foreground">Compliance Score</div>
                </div>
              </div>
            </button>
            <button
              onClick={() => { setActiveTab('issues'); setSeverityFilter('high'); }}
              className="glass p-4 rounded-lg text-left hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/20">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-400">{stats.high}</div>
                  <div className="text-xs text-muted-foreground">Critical Issues</div>
                </div>
              </div>
            </button>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-3 gap-4">
            {/* Severity Distribution */}
            <div className="glass p-4 rounded-lg">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Issues by Severity</h3>
              {stats.severityChartData.length > 0 ? (
                <DonutChart
                  data={stats.severityChartData}
                  size={150}
                  thickness={20}
                  showLegend={true}
                />
              ) : (
                <div className="flex items-center justify-center h-[180px] text-muted-foreground">
                  <ShieldCheck className="w-12 h-12 text-green-400 opacity-50" />
                </div>
              )}
            </div>

            {/* Issue Types */}
            <div className="glass p-4 rounded-lg">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Issues by Type</h3>
              {stats.typeChartData.length > 0 ? (
                <DonutChart
                  data={stats.typeChartData}
                  size={150}
                  thickness={20}
                  showLegend={true}
                />
              ) : (
                <div className="flex items-center justify-center h-[180px] text-muted-foreground">
                  <ShieldCheck className="w-12 h-12 text-green-400 opacity-50" />
                </div>
              )}
            </div>

            {/* Compliance Status */}
            <div className="glass p-4 rounded-lg">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Compliance Status</h3>
              {stats.complianceChartData.length > 0 ? (
                <DonutChart
                  data={stats.complianceChartData}
                  size={150}
                  thickness={20}
                  showLegend={true}
                />
              ) : (
                <div className="flex items-center justify-center h-[180px] text-muted-foreground">
                  No compliance data
                </div>
              )}
            </div>
          </div>

          {/* Recent Issues & RBAC Alerts */}
          <div className="grid grid-cols-2 gap-4">
            {/* Recent Critical Issues */}
            <div className="glass p-4 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground">Critical Issues</h3>
                <button
                  onClick={() => { setActiveTab('issues'); setSeverityFilter('high'); }}
                  className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                >
                  View all <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              {globalFilteredIssues.filter(i => i.severity === 'high').slice(0, 3).length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No critical issues
                </div>
              ) : (
                <div className="space-y-2">
                  {globalFilteredIssues.filter(i => i.severity === 'high').slice(0, 3).map((issue, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded bg-red-500/10 border border-red-500/20">
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{issue.resource}</div>
                        <div className="text-xs text-muted-foreground">{getTypeLabel(issue.type)}</div>
                      </div>
                      <ClusterBadge cluster={issue.cluster} size="sm" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* High Risk RBAC */}
            <div className="glass p-4 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground">High Risk RBAC Bindings</h3>
                <button
                  onClick={() => setActiveTab('rbac')}
                  className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                >
                  View all <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              {filteredRBAC.filter(r => r.riskLevel === 'high').slice(0, 3).length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No high risk bindings
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredRBAC.filter(r => r.riskLevel === 'high').slice(0, 3).map((binding, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded bg-red-500/10 border border-red-500/20">
                      <Key className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{binding.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {binding.subjects.map(s => s.name).join(', ')}
                        </div>
                      </div>
                      <ClusterBadge cluster={binding.cluster} size="sm" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Security Recommendations */}
          <div className="glass p-4 rounded-lg">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Security Recommendations</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <StatusIndicator status="healthy" size="sm" />
                  <span className="text-foreground">Use Pod Security Standards to enforce security contexts</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <StatusIndicator status="healthy" size="sm" />
                  <span className="text-foreground">Avoid privileged containers unless absolutely necessary</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <StatusIndicator status="healthy" size="sm" />
                  <span className="text-foreground">Run containers as non-root users</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <StatusIndicator status="healthy" size="sm" />
                  <span className="text-foreground">Enable network policies to restrict pod communication</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Issues Tab */}
      {activeTab === 'issues' && (
        <div className="space-y-6">
          {/* Severity Stats */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { sev: 'all', label: 'All Issues', count: stats.total, color: 'text-foreground', bg: 'bg-card' },
              { sev: 'high', label: 'High', count: stats.high, color: 'text-red-400', bg: 'bg-red-500/20' },
              { sev: 'medium', label: 'Medium', count: stats.medium, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
              { sev: 'low', label: 'Low', count: stats.low, color: 'text-blue-400', bg: 'bg-blue-500/20' },
            ].map(item => (
              <button
                key={item.sev}
                onClick={() => setSeverityFilter(item.sev)}
                className={cn(
                  'glass p-4 rounded-lg text-left transition-all',
                  severityFilter === item.sev ? 'ring-2 ring-purple-500' : 'hover:bg-secondary/30'
                )}
              >
                <div className="text-2xl font-bold" style={{ color: item.color === 'text-foreground' ? undefined : item.color.replace('text-', '') }}>
                  <span className={item.color}>{item.count}</span>
                </div>
                <div className="text-xs text-muted-foreground">{item.label}</div>
              </button>
            ))}
          </div>

          {/* Issue Type Quick Filters */}
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-muted-foreground mr-2">Filter by type:</span>
            <button
              onClick={() => setSelectedIssueType(null)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                selectedIssueType === null ? 'bg-purple-500 text-white' : 'bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              All
            </button>
            {Object.entries(stats.typeCounts).map(([type, count]) => (
              <button
                key={type}
                onClick={() => setSelectedIssueType(selectedIssueType === type ? null : type)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1',
                  selectedIssueType === type ? 'bg-purple-500 text-white' : 'bg-card text-muted-foreground hover:text-foreground'
                )}
              >
                {getTypeLabel(type)} <span className="opacity-60">({count})</span>
              </button>
            ))}
          </div>

          {/* Issues List */}
          {filteredIssues.filter(i => selectedIssueType === null || i.type === selectedIssueType).length === 0 ? (
            <div className="text-center py-12">
              <ShieldCheck className="w-16 h-16 mx-auto mb-4 text-green-400 opacity-50" />
              <p className="text-lg text-foreground">No security issues found!</p>
              <p className="text-sm text-muted-foreground">Your clusters are following security best practices</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredIssues
                .filter(i => selectedIssueType === null || i.type === selectedIssueType)
                .map((issue, i) => (
                <div
                  key={i}
                  className={cn(
                    'glass p-4 rounded-lg border-l-4',
                    issue.severity === 'high' ? 'border-l-red-500' :
                    issue.severity === 'medium' ? 'border-l-yellow-500' :
                    'border-l-blue-500'
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-1">{typeIcon(issue.type)}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <ClusterBadge cluster={issue.cluster} size="sm" />
                        <span className="font-semibold text-foreground">{issue.resource}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${severityColor(issue.severity)}`}>
                          {issue.severity}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-card text-muted-foreground">
                          {getTypeLabel(issue.type)}
                        </span>
                      </div>
                      <p className="text-sm text-foreground">{issue.message}</p>
                      <div className="text-xs text-muted-foreground mt-2">
                        Namespace: {issue.namespace}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RBAC Tab */}
      {activeTab === 'rbac' && (
        <div className="space-y-6">
          {/* RBAC Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="glass p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{stats.rbacTotal}</div>
                  <div className="text-xs text-muted-foreground">Total Bindings</div>
                </div>
              </div>
            </div>
            <div className="glass p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/20">
                  <ShieldX className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-400">{stats.rbacHighRisk}</div>
                  <div className="text-xs text-muted-foreground">High Risk</div>
                </div>
              </div>
            </div>
            <div className="glass p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/20">
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-400">{stats.rbacMedRisk}</div>
                  <div className="text-xs text-muted-foreground">Medium Risk</div>
                </div>
              </div>
            </div>
            <div className="glass p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <ShieldCheck className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-400">{stats.rbacLowRisk}</div>
                  <div className="text-xs text-muted-foreground">Low Risk</div>
                </div>
              </div>
            </div>
          </div>

          {/* RBAC Bindings List */}
          <div className="space-y-3">
            {filteredRBAC.map((binding, i) => (
              <div
                key={i}
                className={cn(
                  'glass p-4 rounded-lg border-l-4',
                  binding.riskLevel === 'high' ? 'border-l-red-500' :
                  binding.riskLevel === 'medium' ? 'border-l-yellow-500' :
                  'border-l-green-500'
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    {binding.kind === 'ClusterRole' ? (
                      <Key className={cn(
                        'w-5 h-5',
                        binding.riskLevel === 'high' ? 'text-red-400' :
                        binding.riskLevel === 'medium' ? 'text-yellow-400' : 'text-green-400'
                      )} />
                    ) : (
                      <Lock className={cn(
                        'w-5 h-5',
                        binding.riskLevel === 'high' ? 'text-red-400' :
                        binding.riskLevel === 'medium' ? 'text-yellow-400' : 'text-green-400'
                      )} />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <ClusterBadge cluster={binding.cluster} size="sm" />
                      <span className="font-semibold text-foreground">{binding.name}</span>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded',
                        binding.riskLevel === 'high' ? 'bg-red-500/20 text-red-400' :
                        binding.riskLevel === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-green-500/20 text-green-400'
                      )}>
                        {binding.riskLevel} risk
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-card text-muted-foreground">
                        {binding.kind}
                      </span>
                    </div>
                    <div className="text-sm text-foreground mb-2">
                      <span className="text-muted-foreground">Subjects: </span>
                      {binding.subjects.map((s, j) => (
                        <span key={j} className="inline-flex items-center gap-1 mr-2">
                          {s.kind === 'User' && <Users className="w-3 h-3" />}
                          {s.kind === 'Group' && <Users className="w-3 h-3" />}
                          {s.kind === 'ServiceAccount' && <Key className="w-3 h-3" />}
                          {s.name}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {binding.permissions.slice(0, 5).map((perm, j) => (
                        <span key={j} className="text-xs px-2 py-0.5 rounded bg-card/50 text-muted-foreground">
                          {perm}
                        </span>
                      ))}
                      {binding.permissions.length > 5 && (
                        <span className="text-xs text-muted-foreground">
                          +{binding.permissions.length - 5} more
                        </span>
                      )}
                    </div>
                    {binding.namespace && (
                      <div className="text-xs text-muted-foreground mt-2">
                        Namespace: {binding.namespace}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compliance Tab */}
      {activeTab === 'compliance' && (
        <div className="space-y-6">
          {/* Compliance Score */}
          <div className="glass p-6 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Overall Compliance Score</h3>
                <p className="text-sm text-muted-foreground">Based on {stats.complianceTotal} checks across all clusters</p>
              </div>
              <div className={cn(
                'text-4xl font-bold',
                stats.complianceScore >= 80 ? 'text-green-400' :
                stats.complianceScore >= 60 ? 'text-yellow-400' : 'text-red-400'
              )}>
                {stats.complianceScore}%
              </div>
            </div>
            <ProgressBar
              value={stats.complianceScore}
              max={100}
              color={stats.complianceScore >= 80 ? '#10b981' : stats.complianceScore >= 60 ? '#f59e0b' : '#ef4444'}
              size="lg"
              showValue={false}
            />
            <div className="flex items-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className="text-sm text-foreground">{stats.compliancePass} Passed</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-foreground">{stats.complianceWarn} Warnings</span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm text-foreground">{stats.complianceFail} Failed</span>
              </div>
            </div>
          </div>

          {/* Compliance by Category */}
          {Object.entries(complianceByCategory).map(([category, checks]) => {
            const passed = checks.filter(c => c.status === 'pass').length
            const total = checks.length
            const percentage = Math.round((passed / total) * 100)

            return (
              <div key={category} className="glass p-4 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {category === 'Pod Security' && <Shield className="w-5 h-5 text-purple-400" />}
                    {category === 'Network' && <Eye className="w-5 h-5 text-blue-400" />}
                    {category === 'RBAC' && <Users className="w-5 h-5 text-orange-400" />}
                    {category === 'Secrets' && <Lock className="w-5 h-5 text-green-400" />}
                    {category === 'Images' && <Clock className="w-5 h-5 text-cyan-400" />}
                    <h4 className="font-medium text-foreground">{category}</h4>
                  </div>
                  <span className={cn(
                    'text-sm font-medium',
                    percentage >= 80 ? 'text-green-400' :
                    percentage >= 60 ? 'text-yellow-400' : 'text-red-400'
                  )}>
                    {passed}/{total} passed
                  </span>
                </div>
                <div className="space-y-2">
                  {checks.map(check => (
                    <div
                      key={check.id}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-lg',
                        check.status === 'pass' ? 'bg-green-500/10' :
                        check.status === 'warn' ? 'bg-yellow-500/10' : 'bg-red-500/10'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {check.status === 'pass' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                        {check.status === 'warn' && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                        {check.status === 'fail' && <XCircle className="w-4 h-4 text-red-400" />}
                        <div>
                          <div className="text-sm font-medium text-foreground">{check.name}</div>
                          <div className="text-xs text-muted-foreground">{check.description}</div>
                        </div>
                      </div>
                      <ClusterBadge cluster={check.cluster} size="sm" />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
      </>
      )}
    </DashboardPage>
  )
}
