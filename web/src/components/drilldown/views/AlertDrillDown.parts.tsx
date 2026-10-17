/* eslint-disable react-refresh/only-export-components */
import {
  Bell, Info, Tag,
  Layers, Server, AlertTriangle, Clock, ExternalLink, Stethoscope,
  Code,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { cn } from '../../../lib/cn'
import type { AlertTabType } from './useAlertDrillDown'

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

export const getSeverityStyle = (severity: string) => {
  const lower = severity?.toLowerCase() || ''
  if (lower === 'critical' || lower === 'page') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: 'text-red-400' }
  }
  if (lower === 'warning' || lower === 'warn') {
    return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', icon: 'text-orange-400' }
  }
  if (lower === 'info') {
    return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', icon: 'text-blue-400' }
  }
  return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: 'text-yellow-400' }
}

export const getStateStyle = (state: string) => {
  const lower = state?.toLowerCase() || ''
  if (lower === 'firing') {
    return { bg: 'bg-red-500/20', text: 'text-red-400' }
  }
  if (lower === 'pending') {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400' }
  }
  if (lower === 'resolved' || lower === 'inactive') {
    return { bg: 'bg-green-500/20', text: 'text-green-400' }
  }
  return { bg: 'bg-secondary', text: 'text-muted-foreground' }
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

interface AlertDrillDownHeaderProps {
  cluster: string
  namespace?: string
  alertSeverity: string
  alertState: string
  onDrillToNamespace: (cluster: string, namespace: string) => void
  onDrillToCluster: (cluster: string) => void
}

export function AlertDrillDownHeader({
  cluster, namespace, alertSeverity, alertState, onDrillToNamespace, onDrillToCluster,
}: AlertDrillDownHeaderProps) {
  const { t } = useTranslation()
  const severityStyle = getSeverityStyle(alertSeverity)
  const stateStyle = getStateStyle(alertState)

  return (
    <div className="px-6 pt-6 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm">
          {namespace && (
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
          )}
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
          <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium', severityStyle.bg, severityStyle.text, 'border', severityStyle.border)}>
            {alertSeverity.toUpperCase()}
          </span>
          <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium', stateStyle.bg, stateStyle.text)}>
            {alertState.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

interface AlertTabBarProps {
  activeTab: AlertTabType
  tabListProps: Record<string, unknown>
  getTabProps: (tab: AlertTabType) => Record<string, unknown>
}

export function AlertTabBar({ activeTab, tabListProps, getTabProps }: AlertTabBarProps) {
  const { t } = useTranslation()
  const TABS: { id: AlertTabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: t('drilldown.tabs.overview'), icon: Info },
    { id: 'labels', label: t('drilldown.tabs.labels'), icon: Tag },
    { id: 'source', label: t('common.source'), icon: Code },
    { id: 'ai', label: t('drilldown.tabs.aiAnalysis'), icon: Stethoscope },
  ]

  return (
    <div className="border-b border-border px-6">
      <div {...tabListProps} className="flex gap-1">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              {...getTabProps(tab.id)}
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

const LABELS_PREVIEW_COUNT = 6

interface AlertOverviewTabProps {
  tabPanelProps: Record<string, unknown>
  alertName: string
  alertMessage?: string
  alertStartsAt?: string
  alertSource?: string
  alertSeverity: string
  alertAnnotations: Record<string, string>
  labelEntries: [string, string][]
  relatedPod?: string
  relatedNamespace?: string
  relatedDeployment?: string
  alertRuleName?: string
  cluster: string
  namespace?: string
  onDrillToPod: (cluster: string, namespace: string, pod: string) => void
  onDrillToDeployment: (cluster: string, namespace: string, deployment: string) => void
  onDrillToAlertRule: (cluster: string, namespace: string, alertRule: string) => void
  onShowAllLabels: () => void
}

export function AlertOverviewTab({
  tabPanelProps, alertName, alertMessage, alertStartsAt, alertSource, alertSeverity,
  alertAnnotations, labelEntries, relatedPod, relatedNamespace, relatedDeployment, alertRuleName,
  cluster, namespace, onDrillToPod, onDrillToDeployment, onDrillToAlertRule, onShowAllLabels,
}: AlertOverviewTabProps) {
  const { t } = useTranslation()
  const severityStyle = getSeverityStyle(alertSeverity)
  const displayedLabels = labelEntries.slice(0, LABELS_PREVIEW_COUNT)

  return (
    <div {...tabPanelProps} className="space-y-6">
      <div className={cn('p-4 rounded-lg border', severityStyle.bg, severityStyle.border)}>
        <div className="flex items-start gap-3">
          <AlertTriangle className={cn('w-8 h-8 mt-1', severityStyle.icon)} />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground">{alertName}</h3>
            {alertMessage && (
              <p className="text-sm text-muted-foreground mt-1">{alertMessage}</p>
            )}
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
              {alertStartsAt && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{t('drilldown.alertDetail.started')}: {new Date(alertStartsAt).toLocaleString()}</span>
                </div>
              )}
              {alertSource && (
                <div className="flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" />
                  <span>{t('drilldown.fields.source')} {alertSource}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {Object.keys(alertAnnotations).length > 0 && (
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <h4 className="text-sm font-medium text-foreground mb-3">{t('common.annotations')}</h4>
          <div className="space-y-2">
            {Object.entries(alertAnnotations).map(([key, value]) => (
              <div key={key} className="flex items-start gap-2 text-sm">
                <span className="text-muted-foreground min-w-[120px]">{key}:</span>
                <span className="text-foreground break-all">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-4 rounded-lg border border-border bg-card/50">
        <h4 className="text-sm font-medium text-foreground mb-3">{t('drilldown.alertDetail.relatedResources')}</h4>
        <div className="flex flex-wrap gap-2">
          {relatedPod && relatedNamespace && (
            <button
              onClick={() => onDrillToPod(cluster, relatedNamespace, relatedPod)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors text-sm"
            >
              <span>{t('drilldown.fields.pod')} {relatedPod}</span>
            </button>
          )}
          {relatedDeployment && relatedNamespace && (
            <button
              onClick={() => onDrillToDeployment(cluster, relatedNamespace, relatedDeployment)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors text-sm"
            >
              <span>{t('drilldown.fields.deployment')} {relatedDeployment}</span>
            </button>
          )}
          {alertRuleName && (
            <button
              onClick={() => onDrillToAlertRule(cluster, namespace || 'monitoring', alertRuleName)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 transition-colors text-sm"
            >
              <Bell className="w-3 h-3" />
              <span>{t('drilldown.alertDetail.alertRule')}</span>
            </button>
          )}
        </div>
      </div>

      {labelEntries.length > 0 && (
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-foreground">{t('common.labels')}</h4>
            <span className="text-xs text-muted-foreground">
              {t('drilldown.alertDetail.labelsCount', { count: labelEntries.length })}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {displayedLabels.map(([key, value]) => (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-secondary/50 text-xs"
              >
                <span className="text-muted-foreground">{key}:</span>
                <span className="text-foreground font-mono">{value}</span>
              </span>
            ))}
            {labelEntries.length > LABELS_PREVIEW_COUNT && (
              <button
                onClick={onShowAllLabels}
                className="text-xs text-primary hover:underline"
              >
                {t('drilldown.tabs.more', { count: labelEntries.length - LABELS_PREVIEW_COUNT })}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export { AlertLabelsTab, AlertSourceTab, AlertAITab } from './AlertSecondaryTabs.parts'
