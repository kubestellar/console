import { Shield, ShieldAlert, ShieldCheck, Users, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { Skeleton } from '../ui/Skeleton'
import type { ComplianceCheck, RBACBinding, SecurityIssue } from '../../mocks/securityData'
import { SecurityOverviewTab } from './SecurityOverviewTab'
import { SecurityIssuesTab } from './SecurityIssuesTab'
import { SecurityRBACTab } from './SecurityRBACTab'
import { SecurityComplianceTab } from './SecurityComplianceTab'

export type ViewTab = 'overview' | 'issues' | 'rbac' | 'compliance'

interface SecurityStats {
  total: number
  high: number
  medium: number
  low: number
  typeCounts: Record<string, number>
  rbacTotal: number
  rbacHighRisk: number
  rbacMedRisk: number
  rbacLowRisk: number
  compliancePassed: number
  complianceFailed: number
  complianceWarnings: number
  complianceScore: number
  severityChartData: { name: string; value: number; color: string }[]
  typeChartData: { name: string; value: number; color: string }[]
  rbacChartData: { name: string; value: number; color: string }[]
  complianceChartData: { name: string; value: number; color: string }[]
}

interface PolicyStatusTableProps {
  activeTab: ViewTab
  setActiveTab: (tab: ViewTab) => void
  stats: SecurityStats
  forceSkeletonForOffline: boolean
  globalFilteredIssues: SecurityIssue[]
  filteredRBAC: RBACBinding[]
  filteredIssues: SecurityIssue[]
  severityFilter: string
  setSeverityFilter: (value: string) => void
  selectedIssueType: string | null
  setSelectedIssueType: (value: string | null) => void
  complianceByCategory: Record<string, ComplianceCheck[]>
  handleRefresh: () => void
  isRefreshing: boolean
}

export function PolicyStatusTable({
  activeTab,
  setActiveTab,
  stats,
  forceSkeletonForOffline,
  globalFilteredIssues,
  filteredRBAC,
  filteredIssues,
  severityFilter,
  setSeverityFilter,
  selectedIssueType,
  setSelectedIssueType,
  complianceByCategory,
  handleRefresh,
  isRefreshing,
}: PolicyStatusTableProps) {
  const { t } = useTranslation('cards')

  const tabContent = forceSkeletonForOffline ? (
    <div className="space-y-6">
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
          isRefreshing={isRefreshing}
        />
      )}
    </>
  )

  return (
    <>
      <div className="flex gap-1 mb-6 border-b border-border">
        {([
          { id: 'overview', label: t('security.overview'), icon: Shield },
          { id: 'issues', label: t('security.issues'), icon: ShieldAlert, count: stats.total },
          { id: 'rbac', label: t('security.rbac'), icon: Users, count: stats.rbacTotal },
          { id: 'compliance', label: t('security.compliance'), icon: ShieldCheck },
        ] as { id: ViewTab; label: string; icon: LucideIcon; count?: number }[]).map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
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

      <div className="mb-6">
        {tabContent}
      </div>
    </>
  )
}
