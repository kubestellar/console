import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  Package, Info, Server, Stethoscope,
  FileText, Code, Database, List, ChevronLeft
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { ClusterBadge } from '../../ui/ClusterBadge'
import {
  getConditionStyle,
  type CRDCondition,
  type CRDConditionStyle,
  type CRDInstance,
  type CRDVersion,
  type TabType,
} from './CRDDrillDown.types'

export const CRD_TABS: { id: TabType; label: string; icon: typeof Info }[] = [
  { id: 'overview', label: 'Overview', icon: Info },
  { id: 'versions', label: 'Versions', icon: List },
  { id: 'instances', label: 'Instances', icon: Database },
  { id: 'schema', label: 'Schema', icon: Code },
  { id: 'ai', label: 'AI Analysis', icon: Stethoscope },
]

interface HeaderProps {
  cluster: string
  crdScope: string
  isEstablished: boolean
  statusStyle: CRDConditionStyle
  canGoBack: boolean
  onBack: () => void
  onClusterClick: () => void
}

export function CRDDrillDownHeader({
  cluster,
  crdScope,
  isEstablished,
  statusStyle,
  canGoBack,
  onBack,
  onClusterClick,
}: HeaderProps) {
  const { t } = useTranslation()
  const StatusIcon = statusStyle.icon

  return (
    <div className="px-6 pt-6 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm">
          {canGoBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2 hover:bg-secondary/50 border border-transparent hover:border-border px-3 py-1.5 rounded-lg transition-all text-muted-foreground hover:text-foreground"
              aria-label={t('drilldown.goBack')}
              title={t('drilldown.goBack')}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{t('common.back')}</span>
            </button>
          )}
          <button
            onClick={onClusterClick}
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

        {/* Status badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{crdScope}</span>
          <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1', statusStyle.bg, statusStyle.text, 'border', statusStyle.border)}>
            <StatusIcon className="w-3 h-3" />
            {isEstablished ? 'Established' : 'Not Established'}
          </span>
        </div>
      </div>
    </div>
  )
}

interface TabBarProps {
  activeTab: TabType
  versionCount: number
  instanceCount: number
  onSelect: (tabId: TabType) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
}

export function CRDTabBar({ activeTab, versionCount, instanceCount, onSelect, onKeyDown }: TabBarProps) {
  const { t } = useTranslation()

  const labelFor = (tab: (typeof CRD_TABS)[number]) => {
    if (tab.id === 'versions') return `${tab.label} (${versionCount})`
    if (tab.id === 'instances') return `${tab.label} (${instanceCount})`
    return tab.label
  }

  return (
    <div className="border-b border-border px-6">
      <div className="flex gap-1" role="tablist" aria-label={t('drilldown.crd.tabs', 'CRD tabs')} onKeyDown={onKeyDown}>
        {CRD_TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              id={`crd-tab-${tab.id}`}
              data-tab-id={tab.id}
              role="tab"
              tabIndex={activeTab === tab.id ? 0 : -1}
              aria-selected={activeTab === tab.id}
              aria-controls={`crd-panel-${tab.id}`}
              onClick={() => onSelect(tab.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border'
              )}
            >
              <Icon className="w-4 h-4" />
              {labelFor(tab)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface OverviewTabProps {
  crdName: string
  crdKind: string
  crdGroup?: string
  crdScope: string
  statusStyle: CRDConditionStyle
  versions: CRDVersion[] | null
  instances: CRDInstance[] | null
  conditions: CRDCondition[] | null
}

export function CRDOverviewTab({
  crdName,
  crdKind,
  crdGroup,
  crdScope,
  statusStyle,
  versions,
  instances,
  conditions,
}: OverviewTabProps) {
  const { t } = useTranslation()
  const StatusIcon = statusStyle.icon

  return (
    <div className="space-y-6">
      {/* CRD Info Card */}
      <div className="p-4 rounded-lg bg-linear-to-r from-purple-500/10 to-purple-500/10 border border-purple-500/20">
        <div className="flex items-start gap-3">
          <Package className="w-8 h-8 text-purple-400 mt-1" />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground">{crdKind}</h3>
            <p className="text-sm text-muted-foreground font-mono">{crdName}</p>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
              {crdGroup && (
                <div className="flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  <span>Group: {crdGroup}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Database className="w-4 h-4" />
                <span>Scope: {crdScope}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className={cn('text-2xl font-bold', statusStyle.text)}>
            <StatusIcon className="w-8 h-8" />
          </div>
          <div className="text-xs text-muted-foreground mt-1">{t('common.status')}</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="text-2xl font-bold text-foreground">{versions?.length || '-'}</div>
          <div className="text-xs text-muted-foreground">Versions</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="text-2xl font-bold text-foreground">{instances?.length || '-'}</div>
          <div className="text-xs text-muted-foreground">Instances</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="text-sm font-medium text-foreground">{crdScope}</div>
          <div className="text-xs text-muted-foreground">{t('common.scope')}</div>
        </div>
      </div>

      {/* Conditions */}
      {conditions && conditions.length > 0 && (
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <h4 className="text-sm font-medium text-foreground mb-3">{t('common.conditions')}</h4>
          <div className="space-y-2">
            {conditions.map((condition, i) => {
              const condStyle = getConditionStyle(condition.status)
              return (
                <div key={i} className="flex items-center justify-between p-2 rounded bg-secondary/50">
                  <span className="text-sm text-foreground">{condition.type}</span>
                  <span className={cn('px-2 py-0.5 rounded text-xs', condStyle.bg, condStyle.text)}>
                    {condition.status}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export { CRDVersionsTab, CRDInstancesTab, CRDSchemaTab, CRDAITab } from './CRDDrillDownTabs.parts'
