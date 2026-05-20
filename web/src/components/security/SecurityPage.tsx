import { useState, useEffect } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { Shield, ShieldAlert, Users, ShieldCheck, AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { useDemoMode } from '../../hooks/useDemoMode'
import { RotatingTip } from '../ui/RotatingTip'
import { useLocalAgent, wasAgentEverConnected } from '../../hooks/useLocalAgent'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { useCachedSecurityIssues } from '../../hooks/useCachedData'
import { Skeleton } from '../ui/Skeleton'
import { getDefaultCards } from '../../config/dashboards'
import { useTranslation } from 'react-i18next'
import { ensureCardInDashboard } from '../../lib/dashboards/migrateStorageKey'
import { useSecurityData } from '../../hooks/security/useSecurityData'
import { SecurityOverviewTab } from './tabs/SecurityOverviewTab'
import { SecurityIssuesTab } from './tabs/SecurityIssuesTab'
import { SecurityRBACTab } from './tabs/SecurityRBACTab'
import { SecurityComplianceTab } from './tabs/SecurityComplianceTab'

const SECURITY_CARDS_KEY = 'kubestellar-security-cards'

// Ensure ISO 27001 audit card is present in existing saved layouts.
ensureCardInDashboard(SECURITY_CARDS_KEY, 'iso27001_audit', {
  id: 'security-0',
  card_type: 'iso27001_audit',
  position: { w: 6, h: 3, x: 0, y: 0 }
})

// Default cards for the security dashboard
const DEFAULT_SECURITY_CARDS = getDefaultCards('security')

type ViewTab = 'overview' | 'issues' | 'rbac' | 'compliance'

export function SecurityPage() {
  const { t } = useTranslation(['cards', 'common'])
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()

  const [activeTab, setActiveTab] = useState<ViewTab>('overview')

  // Check demo mode and agent status
  const { isDemoMode } = useDemoMode()
  const { status: agentStatus } = useLocalAgent()
  const isModeSwitching = useIsModeSwitching()

  // When demo mode is OFF and agent is not connected, force skeleton display
  const isAgentOffline = agentStatus === 'disconnected'
  const forceSkeletonForOffline = (!isDemoMode && isAgentOffline && !isInClusterMode() && !wasAgentEverConnected()) || isModeSwitching

  // Fetch security data using custom hook
  const {
    securityIssues,
    rbacBindings,
    complianceChecks,
    stats,
    isRefreshing,
    lastUpdated,
    refreshError,
    handleRefresh,
  } = useSecurityData()

  // Fetch cached security issues for loading state
  const { isLoading: securityLoading, isRefreshing: securityRefreshing } = useCachedSecurityIssues()

  // Handle addCard URL param - open modal and clear param.
  useEffect(() => {
    if (location.pathname !== '/security') return
    if (searchParams.get('addCard') === 'true') {
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, location.pathname])

  // Trigger refresh on mount
  useEffect(() => {
    handleRefresh()
  }, [handleRefresh])

  // Get type label for display
  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      privileged: t('cards:security.privilegedContainers'),
      root: t('cards:security.runAsRoot'),
      hostNetwork: t('cards:security.hostNetwork'),
      hostPID: t('cards:security.hostPID'),
      noSecurityContext: t('cards:security.noSecurityContext')
    }
    return labels[type] || type
  }

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

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    const hasDataToShow = stats.total > 0
    switch (blockId) {
      case 'issues':
        return { value: stats.total, sublabel: 'total issues', onClick: () => setActiveTab('issues'), isClickable: hasDataToShow }
      case 'critical':
        return { value: stats.high, sublabel: 'critical issues', onClick: () => setActiveTab('issues'), isClickable: stats.high > 0 }
      case 'high':
        return { value: stats.high, sublabel: 'high severity', onClick: () => setActiveTab('issues'), isClickable: stats.high > 0 }
      case 'medium':
        return { value: stats.medium, sublabel: 'medium severity', onClick: () => setActiveTab('issues'), isClickable: stats.medium > 0 }
      case 'low':
        return { value: stats.low, sublabel: 'low severity', onClick: () => setActiveTab('issues'), isClickable: stats.low > 0 }
      case 'privileged':
        return { value: stats.typeCounts['privileged'] || 0, sublabel: 'privileged containers' }
      case 'root':
        return { value: stats.typeCounts['root'] || 0, sublabel: 'running as root' }
      default:
        return { value: 0 }
    }
  }

  // Navigation handlers
  const navigateToIssues = () => {
    setActiveTab('issues')
  }

  const navigateToRBAC = () => {
    setActiveTab('rbac')
  }

  const navigateToCompliance = () => {
    setActiveTab('compliance')
  }

  // Tab content rendering
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
          issues={securityIssues}
          rbacBindings={rbacBindings}
          onNavigateToIssues={navigateToIssues}
          onNavigateToRBAC={navigateToRBAC}
          onNavigateToCompliance={navigateToCompliance}
          getTypeLabel={getTypeLabel}
        />
      )}
      {activeTab === 'issues' && (
        <SecurityIssuesTab
          issues={securityIssues}
          stats={stats}
          getTypeLabel={getTypeLabel}
          typeIcon={typeIcon}
          severityColor={severityColor}
        />
      )}
      {activeTab === 'rbac' && (
        <SecurityRBACTab
          rbacBindings={rbacBindings}
          stats={stats}
        />
      )}
      {activeTab === 'compliance' && (
        <SecurityComplianceTab
          complianceChecks={complianceChecks}
          stats={stats}
        />
      )}
    </>
  )

  // Tabs section rendering
  const tabsSection = (
    <>
      {/* Error Banner */}
      {refreshError && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">{t('cards:security.refreshFailed')}</p>
            <p className="text-sm text-red-300/80">{refreshError}</p>
          </div>
          <button
            onClick={handleRefresh}
            className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm font-medium transition-colors"
          >
            {t('common:common.retry')}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {[
          { id: 'overview', label: t('cards:security.overview'), icon: Shield },
          { id: 'issues', label: t('cards:security.issues'), icon: ShieldAlert, count: stats.total },
          { id: 'rbac', label: t('cards:security.rbac'), icon: Users, count: stats.rbacTotal },
          { id: 'compliance', label: t('cards:security.compliance'), icon: ShieldCheck },
        ].map(tab => {
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

      {/* Tab content rendered immediately below tab buttons */}
      <div className="mb-6">
        {tabContent}
      </div>
    </>
  )

  return (
    <DashboardPage
      title={t('common:navigation.security')}
      subtitle={t('cards:security.subtitle')}
      icon="Shield"
      rightExtra={<RotatingTip page="security" />}
      storageKey={SECURITY_CARDS_KEY}
      defaultCards={DEFAULT_SECURITY_CARDS}
      statsType="security"
      getStatValue={getDashboardStatValue}
      onRefresh={handleRefresh}
      isLoading={false}
      isRefreshing={securityLoading || isRefreshing || securityRefreshing}
      lastUpdated={lastUpdated}
      hasData={stats.total > 0 || (securityIssues || []).length > 0}
      beforeCards={tabsSection}
      emptyState={{
        title: t('cards:security.securityDashboard'),
        description: t('cards:security.emptyDescription')
      }}
    />
  )
}
