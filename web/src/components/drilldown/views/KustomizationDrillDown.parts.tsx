/* eslint-disable react-refresh/only-export-components */
import {
  Layers, Info, Loader2, Server, RefreshCw, Stethoscope,
  CheckCircle, XCircle, AlertTriangle,
  FileText, GitBranch, Clock, Package,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { StatusBadge } from '../../ui/StatusBadge'
import { ConsoleAIIcon } from '../../ui/ConsoleAIIcon'
import { cn } from '../../../lib/cn'
import type { Condition } from '../../../types/mcs'
import type { KustomizationTabType, AppliedResource } from './useKustomizationDrillDown'

// ---------------------------------------------------------------------------
// Status style helper
// ---------------------------------------------------------------------------

export const getStatusStyle = (status: string) => {
  const lower = status?.toLowerCase() || ''
  if (lower === 'ready' || lower === 'true' || lower === 'applied' || lower === 'succeeded') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', icon: CheckCircle }
  }
  if (lower === 'reconciling' || lower === 'progressing') {
    return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', icon: RefreshCw }
  }
  if (lower === 'failed' || lower === 'false' || lower === 'error') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: XCircle }
  }
  if (lower === 'stalled' || lower === 'suspended') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: AlertTriangle }
  }
  return { bg: 'bg-secondary', text: 'text-muted-foreground', border: 'border-border', icon: AlertTriangle }
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

interface KustomizationDrillDownHeaderProps {
  cluster: string
  namespace: string
  kustomizationStatus: string
  suspended?: boolean
  onDrillToNamespace: (cluster: string, namespace: string) => void
  onDrillToCluster: (cluster: string) => void
}

export function KustomizationDrillDownHeader({
  cluster, namespace, kustomizationStatus, suspended, onDrillToNamespace, onDrillToCluster,
}: KustomizationDrillDownHeaderProps) {
  const { t } = useTranslation()
  const statusStyle = getStatusStyle(kustomizationStatus)
  const StatusIcon = statusStyle.icon

  return (
    <div className="px-6 pt-6 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm">
          <button
            onClick={() => onDrillToNamespace(cluster, namespace)}
            className="flex items-center gap-2 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
          >
            <Layers className="w-4 h-4 text-purple-400" />
            <span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span>
            <span className="font-mono text-purple-400 group-hover:text-purple-300 transition-colors">{namespace}</span>
            <svg className="w-3 h-3 text-purple-400/70 group-hover:text-purple-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={() => onDrillToCluster(cluster)}
            className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
          >
            <Server className="w-4 h-4 text-blue-400" />
            <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
            <ClusterBadge cluster={cluster.split('/').pop() || cluster} size="sm" />
            <svg className="w-3 h-3 text-blue-400/70 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {suspended && (
            <StatusBadge color="yellow" variant="outline">
              Suspended
            </StatusBadge>
          )}
          <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1', statusStyle.bg, statusStyle.text, 'border', statusStyle.border)}>
            <StatusIcon className="w-3 h-3" />
            {kustomizationStatus}
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

interface KustomizationTabBarProps {
  activeTab: KustomizationTabType
  appliedResourcesCount: number
  onChange: (tab: KustomizationTabType) => void
}

export function KustomizationTabBar({ activeTab, appliedResourcesCount, onChange }: KustomizationTabBarProps) {
  const TABS: { id: KustomizationTabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'resources', label: `Resources (${appliedResourcesCount})`, icon: Package },
    { id: 'conditions', label: 'Conditions', icon: FileText },
    { id: 'ai', label: 'AI Analysis', icon: Stethoscope },
  ]

  return (
    <div className="border-b border-border px-6">
      <div className="flex gap-1">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

interface KustomizationOverviewTabProps {
  kustomizationName: string
  kustomizationStatus: string
  path?: string
  interval?: string
  sourceRef?: { kind?: string; name?: string }
  appliedResourcesCount?: number
  suspended?: boolean
  lastAppliedRevision?: string
}

export function KustomizationOverviewTab({
  kustomizationName, kustomizationStatus, path, interval, sourceRef,
  appliedResourcesCount, suspended, lastAppliedRevision,
}: KustomizationOverviewTabProps) {
  const { t } = useTranslation()
  const statusStyle = getStatusStyle(kustomizationStatus)
  const StatusIcon = statusStyle.icon

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-linear-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20">
        <div className="flex items-start gap-3">
          <Layers className="w-8 h-8 text-blue-400 mt-1" />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground">{kustomizationName}</h3>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
              {path && (
                <div className="flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  <span>Path: {path}</span>
                </div>
              )}
              {interval && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span>Interval: {interval}</span>
                </div>
              )}
              {sourceRef && (
                <div className="flex items-center gap-1.5">
                  <GitBranch className="w-4 h-4" />
                  <span>Source: {sourceRef.kind}/{sourceRef.name}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className={cn('text-2xl font-bold', statusStyle.text)}>
            <StatusIcon className="w-8 h-8" />
          </div>
          <div className="text-xs text-muted-foreground mt-1">{t('common.status')}</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="text-2xl font-bold text-foreground">{appliedResourcesCount || '-'}</div>
          <div className="text-xs text-muted-foreground">{t('common.resources')}</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className={cn('text-sm font-medium', suspended ? 'text-yellow-400' : 'text-green-400')}>
            {suspended ? 'Yes' : 'No'}
          </div>
          <div className="text-xs text-muted-foreground">Suspended</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="text-sm font-mono text-foreground truncate" title={lastAppliedRevision}>
            {lastAppliedRevision?.slice(0, 12) || '-'}
          </div>
          <div className="text-xs text-muted-foreground">Last Revision</div>
        </div>
      </div>

      {sourceRef && (
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <h4 className="text-sm font-medium text-foreground mb-3">Source Reference</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Kind:</span>
              <span className="ml-2 text-foreground">{sourceRef.kind || 'Unknown'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Name:</span>
              <span className="ml-2 text-foreground">{sourceRef.name || 'Unknown'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Resources tab
// ---------------------------------------------------------------------------

interface KustomizationResourcesTabProps {
  appliedResources: AppliedResource[] | null
  resourcesLoading: boolean
  onResourceClick: (resource: AppliedResource) => void
}

export function KustomizationResourcesTab({ appliedResources, resourcesLoading, onResourceClick }: KustomizationResourcesTabProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">Applied Resources ({appliedResources?.length || 0})</h4>
      {resourcesLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : appliedResources && appliedResources.length > 0 ? (
        <div className="space-y-2">
          {appliedResources.map((resource, i) => (
            <div
              key={i}
              onClick={() => onResourceClick(resource)}
              className={cn(
                'flex items-center justify-between p-3 rounded-lg border border-border bg-card/50',
                (resource.kind === 'Pod' || resource.kind === 'Deployment') && resource.namespace
                  ? 'cursor-pointer hover:bg-card/80 transition-colors'
                  : ''
              )}
            >
              <div className="flex items-center gap-3">
                <Package className="w-4 h-4 text-blue-400" />
                <div>
                  <span className="text-sm font-medium text-foreground">{resource.name}</span>
                  {resource.namespace && (
                    <span className="text-xs text-muted-foreground ml-2">({resource.namespace})</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{resource.kind}</span>
                {(resource.kind === 'Pod' || resource.kind === 'Deployment') && resource.namespace && (
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.kustomization.noResources')}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Conditions tab
// ---------------------------------------------------------------------------

interface KustomizationConditionsTabProps {
  conditions: Condition[] | null
  conditionsLoading: boolean
}

export function KustomizationConditionsTab({ conditions, conditionsLoading }: KustomizationConditionsTabProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">{t('common.conditions')}</h4>
      {conditionsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : conditions && conditions.length > 0 ? (
        <div className="space-y-3">
          {conditions.map((condition, i) => {
            const condStyle = getStatusStyle(condition.status)
            const CondIcon = condStyle.icon
            return (
              <div key={i} className={cn('p-4 rounded-lg border', condStyle.border, condStyle.bg)}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CondIcon className={cn('w-4 h-4', condStyle.text)} />
                    <span className="text-sm font-medium text-foreground">{condition.type}</span>
                  </div>
                  <span className={cn('px-2 py-0.5 rounded text-xs font-medium', condStyle.bg, condStyle.text)}>
                    {condition.status}
                  </span>
                </div>
                {condition.reason && (
                  <div className="text-sm text-foreground mb-1">
                    Reason: {condition.reason}
                  </div>
                )}
                {condition.message && (
                  <div className="text-sm text-muted-foreground">{condition.message}</div>
                )}
                {condition.lastTransitionTime && (
                  <div className="text-xs text-muted-foreground mt-2">
                    Last Transition: {new Date(condition.lastTransitionTime).toLocaleString()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.kustomization.noConditions')}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI tab
// ---------------------------------------------------------------------------

interface KustomizationAITabProps {
  isAgentConnected: boolean
  aiAnalysisLoading: boolean
  aiAnalysis: string | null
  onDiagnose: () => void
}

export function KustomizationAITab({ isAgentConnected, aiAnalysisLoading, aiAnalysis, onDiagnose }: KustomizationAITabProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
          <ConsoleAIIcon className="w-5 h-5" />
          AI Analysis
        </h4>
        <button
          onClick={onDiagnose}
          disabled={!isAgentConnected}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          <Stethoscope className="w-4 h-4" />
          Analyze Kustomization
        </button>
      </div>

      {!isAgentConnected ? (
        <div className="text-center py-12 text-muted-foreground">
          <ConsoleAIIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>AI agent not connected</p>
          <p className="text-xs mt-1">Configure the local agent in Settings to enable AI analysis</p>
        </div>
      ) : aiAnalysisLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
        </div>
      ) : aiAnalysis ? (
        <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <pre className="whitespace-pre-wrap text-sm text-foreground">{aiAnalysis}</pre>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Stethoscope className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.kustomization.clickAnalyze')}</p>
          <p className="text-xs mt-1">{t('drilldown.kustomization.analyzeHint')}</p>
        </div>
      )}
    </div>
  )
}
