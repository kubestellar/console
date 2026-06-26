import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { Shield, ShieldAlert, ShieldCheck, Users, AlertTriangle, type LucideIcon } from 'lucide-react'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { cn } from '../../lib/cn'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { useDemoMode } from '../../hooks/useDemoMode'
import { RotatingTip } from '../ui/RotatingTip'
import { useLocalAgent, wasAgentEverConnected } from '../../hooks/useLocalAgent'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { SHORT_DELAY_MS } from '../../lib/constants/network'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { useCachedSecurityIssues } from '../../hooks/useCachedData'
import { Skeleton } from '../ui/Skeleton'
import {
  getMockSecurityData,
  getMockRBACData,
  getMockComplianceData,
  type ComplianceCheck } from '../../mocks/securityData'
import { getDefaultCards } from '../../config/dashboards'
import { useTranslation } from 'react-i18next'
import { AMBER_500, BLUE_500, GREEN_500, PURPLE_500, RED_500 } from '../../lib/theme/chartColors'
import { ensureCardInDashboard } from '../../lib/dashboards/migrateStorageKey'
import { SecurityOverviewTab } from './SecurityOverviewTab'
import { SecurityIssuesTab } from './SecurityIssuesTab'
import { SecurityRBACTab } from './SecurityRBACTab'
import { SecurityComplianceTab } from './SecurityComplianceTab'

const SECURITY_CARDS_KEY = 'kubestellar-security-cards'

// Ensure ISO 27001 audit card is present in existing saved layouts.
// Uses `card_type` (snake_case) to match the DashboardCard interface — see
// issue #5902 where the legacy `cardType` field caused runtime crashes.
ensureCardInDashboard(SECURITY_CARDS_KEY, 'iso27001_audit', {
  id: 'security-0',
  card_type: 'iso27001_audit',
  position: { w: 6, h: 3, x: 0, y: 0 } })

// Default cards for the security dashboard
const DEFAULT_SECURITY_CARDS = getDefaultCards('security')

type ViewTab = 'overview' | 'issues' | 'rbac' | 'compliance'

export function Security() {
  const { t } = useTranslation('cards')
  const { t: tc } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    filterBySeverity,
    customFilter } = useGlobalFilters()

  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<ViewTab>('overview')
  const [selectedIssueType, setSelectedIssueType] = useState<string | null>(null)
  const [dataRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  // Check demo mode and agent status
  const { isDemoMode } = useDemoMode()
  const { status: agentStatus } = useLocalAgent()
  const isModeSwitching = useIsModeSwitching()

  // When demo mode is OFF and agent is not connected, force skeleton display
  // Also show skeleton during mode switching for smooth transitions
  const isAgentOffline = agentStatus === 'disconnected'
  const forceSkeletonForOffline = (!isDemoMode && isAgentOffline && !isInClusterMode() && !wasAgentEverConnected()) || isModeSwitching

  // Fetch cached security issues (stale-while-revalidate pattern)
  const { issues: cachedSecurityIssues, isLoading: securityLoading, isRefreshing: securityRefreshing } = useCachedSecurityIssues()

  // Refresh function for security data
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    setRefreshError(null)
    try {
      // In a real implementation, this would refetch security data
      // For now, just simulate a refresh
      await new Promise(resolve => setTimeout(resolve, SHORT_DELAY_MS))
      setLastUpdated(new Date())
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to refresh security data'
      setRefreshError(message)
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  // Handle addCard URL param - open modal and clear param.
  // Guard: KeepAlive keeps hidden dashboards mounted; only process on active route.
  useEffect(() => {
    if (location.pathname !== '/security') return
    if (searchParams.get('addCard') === 'true') {
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, location.pathname])

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
      const issueLower = (issue.issue || '').toLowerCase()
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
        message: issue.details || issue.issue }
    })
  }, [isDemoMode, cachedSecurityIssues])

  // RBAC and compliance data fetching requires backend API endpoints to be implemented first.
  // Once /api/mcp/rbac and /api/mcp/compliance endpoints are available, create useCachedRBAC()
  // and useCachedCompliance() hooks following the pattern in useCachedData.ts
  const rbacBindings = isDemoMode ? getMockRBACData() : []
  const complianceChecks = isDemoMode ? getMockComplianceData() : []

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
  }, [isAllClustersSelected, rbacBindings, globalSelectedClusters])

  const filteredCompliance = useMemo(() => {
    if (isAllClustersSelected) return complianceChecks
    return complianceChecks.filter(c => globalSelectedClusters.includes(c.cluster))
  }, [isAllClustersSelected, complianceChecks, globalSelectedClusters])

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
    const compliancePassed = filteredCompliance.filter(c => c.status === 'pass').length
    const complianceFailed = filteredCompliance.filter(c => c.status === 'fail').length
    const complianceWarnings = filteredCompliance.filter(c => c.status === 'warn').length
    const complianceScore = filteredCompliance.length > 0
      ? Math.round((compliancePassed / filteredCompliance.length) * 100)
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
      compliancePassed,
      complianceFailed,
      complianceWarnings,
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
        color: [RED_500, AMBER_500, BLUE_500, GREEN_500, PURPLE_500][i % 5] })),
      rbacChartData: [
        { name: 'High Risk', value: rbacHighRisk, color: RED_500 },
        { name: 'Medium Risk', value: rbacMedRisk, color: AMBER_500 },
        { name: 'Low Risk', value: rbacLowRisk, color: GREEN_500 },
      ].filter(d => d.value > 0),
      complianceChartData: [
        { name: 'Pass', value: compliancePassed, color: GREEN_500 },
        { name: 'Warn', value: complianceWarnings, color: AMBER_500 },
        { name: 'Fail', value: complianceFailed, color: RED_500 },
      ].filter(d => d.value > 0) }
  }, [globalFilteredIssues, filteredRBAC, filteredCompliance])

  // Group compliance by category
  const complianceByCategory = filteredCompliance.reduce((acc, check) => {
      if (!acc[check.category]) acc[check.category] = []
      acc[check.category].push(check)
      return acc
    }, {} as Record<string, ComplianceCheck[]>)

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = (blockId: string): StatBlockValue => {
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
  }

  const getStatValue = getDashboardStatValue

  // Per-tab content. Issue 9856: previously this lived in `children` of
  // `DashboardPage`, which renders BELOW the dashboard cards section. The static
  // "Security Cards" section between the tab buttons and this content made
  // every tab look identical (the cards section never changed). Defined here
  // and rendered inside `tabsSection` (via `beforeCards`) so the active tab's
  // content appears immediately under the tab buttons.
  const tabContent = forceSkeletonForOffline ? (
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
      {activeTab === 'overview' && (
        <SecurityOverviewTab
          stats={stats}
          globalFilteredIssues={globalFilteredIssues}
          filteredRBAC={filteredRBAC}
          setActiveTab={setActiveTab}
          setSeverityFilter={setSeverityFilter}
        />
      )}
      {activeTab === 'issues' && (
        <SecurityIssuesTab
          stats={stats}
          filteredIssues={filteredIssues}
          severityFilter={severityFilter}
          setSeverityFilter={setSeverityFilter}
          selectedIssueType={selectedIssueType}
          setSelectedIssueType={setSelectedIssueType}
        />
      )}
      {activeTab === 'rbac' && (
        <SecurityRBACTab
          stats={stats}
          filteredRBAC={filteredRBAC}
        />
      )}
      {activeTab === 'compliance' && (
        <SecurityComplianceTab
          stats={stats}
          complianceByCategory={complianceByCategory}
          handleRefresh={handleRefresh}
        />
      )}
    </>
  )

  // Tabs + tab-specific content (rendered between stats and the dashboard cards
  // section). Issue 9856: previously the tab buttons lived in `beforeCards` while
  // the per-tab content was passed via `children` (which renders BELOW the
  // dashboard cards section). The static "Security Cards" section between the
  // tabs and the per-tab content made every tab look identical because users
  // couldn't see the content change. Render tab content directly under the tab
  // buttons so the active tab's content is the first thing the user sees after
  // clicking.
  const tabsSection = (
    <>
      {/* Error Banner */}
      {refreshError && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">{t('security.refreshFailed')}</p>
            <p className="text-sm text-red-300/80">{refreshError}</p>
          </div>
          <button
            onClick={handleRefresh}
            className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm font-medium transition-colors"
          >
            {tc('common.retry')}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {([
          { id: 'overview', label: t('security.overview'), icon: Shield },
          { id: 'issues', label: t('security.issues'), icon: ShieldAlert, count: stats.total },
          { id: 'rbac', label: t('security.rbac'), icon: Users, count: stats.rbacTotal },
          { id: 'compliance', label: t('security.compliance'), icon: ShieldCheck },
        ] as { id: string; label: string; icon: LucideIcon; count?: number }[]).map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ViewTab)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 mb-[-2px] transition-colors',
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

      {/* Tab content rendered immediately below tab buttons so each tab shows
          distinct content. */}
      <div className="mb-6">
        {tabContent}
      </div>
    </>
  )

  return (
    <DashboardPage
      title={tc('navigation.security')}
      subtitle={t('security.subtitle')}
      icon="Shield"
      rightExtra={<RotatingTip page="security" />}
      storageKey={SECURITY_CARDS_KEY}
      defaultCards={DEFAULT_SECURITY_CARDS}
      statsType="security"
      getStatValue={getStatValue}
      onRefresh={handleRefresh}
      isLoading={false}
      isRefreshing={securityLoading || dataRefreshing || securityRefreshing}
      lastUpdated={lastUpdated}
      hasData={stats.total > 0 || securityIssues.length > 0}
      beforeCards={tabsSection}
      emptyState={{
        title: t('security.securityDashboard'),
        description: t('security.emptyDescription') }}
    />
  )
}
