import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  Package, Info, Loader2, Server, Stethoscope,
  AlertTriangle,
  FileText, Code, Database, List, ChevronLeft
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { StatusBadge } from '../../ui/StatusBadge'
import { ConsoleAIIcon } from '../../ui/ConsoleAIIcon'
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

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="text-sm">{message}</span>
    </div>
  )
}

function CenteredSpinner({ className = 'text-muted-foreground' }: { className?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className={cn('w-6 h-6 animate-spin', className)} />
    </div>
  )
}

interface VersionsTabProps {
  versions: CRDVersion[] | null
  isLoading: boolean
  error: string | null
}

export function CRDVersionsTab({ versions, isLoading, error }: VersionsTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">API Versions</h4>
      {error && <ErrorBanner message={error} />}
      {isLoading ? (
        <CenteredSpinner />
      ) : versions && versions.length > 0 ? (
        <div className="space-y-2">
          {versions.map((version, i) => (
            <div
              key={i}
              className={cn(
                'p-4 rounded-lg border bg-card/50',
                version.deprecated ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-border'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{version.name}</span>
                  {version.storage && (
                    <StatusBadge color="blue" size="xs">{t('common.storage')}</StatusBadge>
                  )}
                  {version.deprecated && (
                    <StatusBadge color="yellow" size="xs">{t('common.deprecated')}</StatusBadge>
                  )}
                </div>
                <span className={cn(
                  'px-2 py-0.5 rounded text-xs',
                  version.served ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                )}>
                  {version.served ? 'Served' : 'Not Served'}
                </span>
              </div>
              {version.deprecationWarning && (
                <p className="text-sm text-yellow-400">{version.deprecationWarning}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <List className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.crd.noVersionInfo')}</p>
        </div>
      )}
    </div>
  )
}

interface InstancesTabProps {
  instances: CRDInstance[] | null
  isLoading: boolean
  error: string | null
  onInstanceClick: (namespace: string) => void
}

export function CRDInstancesTab({ instances, isLoading, error, onInstanceClick }: InstancesTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">Custom Resource Instances ({instances?.length || 0})</h4>
      {error && <ErrorBanner message={error} />}
      {isLoading ? (
        <CenteredSpinner />
      ) : instances && instances.length > 0 ? (
        <div className="space-y-2">
          {instances.map((instance, i) => (
            <div
              key={i}
              onClick={() => instance.namespace && onInstanceClick(instance.namespace)}
              className={cn(
                'flex items-center justify-between p-3 rounded-lg border border-border bg-card/50',
                instance.namespace && 'cursor-pointer hover:bg-card/80 transition-colors'
              )}
            >
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-purple-400" />
                <div>
                  <span className="text-sm font-medium text-foreground">{instance.name}</span>
                  {instance.namespace && (
                    <span className="text-xs text-muted-foreground ml-2">({instance.namespace})</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {instance.creationTimestamp && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(instance.creationTimestamp).toLocaleDateString()}
                  </span>
                )}
                {instance.namespace && (
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
          <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.crd.noInstancesFound')}</p>
        </div>
      )}
    </div>
  )
}

interface SchemaTabProps {
  schema: Record<string, unknown> | null
  isLoading: boolean
}

export function CRDSchemaTab({ schema, isLoading }: SchemaTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">OpenAPI Schema</h4>
      {isLoading ? (
        <CenteredSpinner />
      ) : schema ? (
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <pre className="text-sm text-foreground font-mono whitespace-pre-wrap overflow-x-auto max-h-[60vh]">
            {JSON.stringify(schema, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Code className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.crd.schemaNotAvailable')}</p>
        </div>
      )}
    </div>
  )
}

interface AITabProps {
  isAgentConnected: boolean
  aiAnalysis: string | null
  aiAnalysisLoading: boolean
  onDiagnose: () => void
}

export function CRDAITab({ isAgentConnected, aiAnalysis, aiAnalysisLoading, onDiagnose }: AITabProps) {
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
          Analyze CRD
        </button>
      </div>

      {!isAgentConnected ? (
        <div className="text-center py-12 text-muted-foreground">
          <ConsoleAIIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>AI agent not connected</p>
          <p className="text-xs mt-1">Configure the local agent in Settings to enable AI analysis</p>
        </div>
      ) : aiAnalysisLoading ? (
        <CenteredSpinner className="text-purple-400" />
      ) : aiAnalysis ? (
        <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <pre className="whitespace-pre-wrap text-sm text-foreground">{aiAnalysis}</pre>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Stethoscope className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.crd.clickAnalyze')}</p>
          <p className="text-xs mt-1">{t('drilldown.crd.analyzeHint')}</p>
        </div>
      )}
    </div>
  )
}
