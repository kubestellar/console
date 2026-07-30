/* eslint-disable react-refresh/only-export-components */
import { Loader2, GitBranch, CheckCircle, AlertTriangle, FileText, Diff, Server, Layers } from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '../../../lib/cn'
import { ConsoleAIIcon } from '../../ui/ConsoleAIIcon'
import { Stethoscope } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ClusterBadge } from '../../ui/ClusterBadge'
import type { DriftChange } from './drift-drilldown'

type SeverityStyle = {
  bg: string
  text: string
  border: string
  icon: ComponentType<{ className?: string }>
}

interface DriftDrillDownHeaderProps {
  cluster: string
  namespace?: string
  driftSeverity: string
  severityStyle: SeverityStyle
  onNamespaceClick?: () => void
  onClusterClick: () => void
}

export function DriftDrillDownHeader({
  cluster,
  namespace,
  driftSeverity,
  severityStyle,
  onNamespaceClick,
  onClusterClick,
}: DriftDrillDownHeaderProps) {
  const { t } = useTranslation()
  const SeverityIcon = severityStyle.icon

  return (
    <div className="px-6 pt-6 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm">
          {namespace && onNamespaceClick && (
            <button
              onClick={onNamespaceClick}
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

        <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1', severityStyle.bg, severityStyle.text, 'border', severityStyle.border)}>
          <SeverityIcon className="w-3 h-3" />
          {driftSeverity === 'None' || driftSeverity === 'Synced' ? 'In Sync' : 'Drifted'}
        </span>
      </div>
    </div>
  )
}

interface DriftTabBarProps {
  tabs: { id: string; label: string; icon: ComponentType<{ className?: string }> }[]
  activeTab: string
  onSelect: (tab: string) => void
}

export function DriftTabBar({ tabs, activeTab, onSelect }: DriftTabBarProps) {
  return (
    <div className="border-b border-border px-6">
      <div className="flex gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
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



interface DriftOverviewTabProps {
  driftedResources: number
  gitRepo?: string
  gitBranch?: string
  gitPath?: string
  lastChecked?: string
  severityStyle: { bg: string; text: string; border: string; icon: ComponentType<{ className?: string }> }
}

export function DriftOverviewTab({
  driftedResources,
  gitRepo,
  gitBranch,
  gitPath,
  lastChecked,
  severityStyle,
}: DriftOverviewTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div
        className={cn(
          'p-4 rounded-lg border',
          driftedResources > 0
            ? 'bg-linear-to-r from-red-500/10 to-orange-500/10 border-red-500/20'
            : 'bg-linear-to-r from-green-500/10 to-green-500/10 border-green-500/20'
        )}
      >
        <div className="flex items-start gap-3">
          <GitBranch className={cn('w-8 h-8 mt-1', driftedResources > 0 ? 'text-red-400' : 'text-green-400')} />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground">
              {driftedResources > 0 ? 'Configuration Drift Detected' : 'No Drift Detected'}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {driftedResources > 0
                ? `${driftedResources} resource(s) have drifted from the desired Git state`
                : 'Cluster configuration matches Git repository state'}
            </p>
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
              {gitRepo && (
                <div className="flex items-center gap-1.5">
                  <GitBranch className="w-4 h-4" />
                  <span>{gitRepo}</span>
                </div>
              )}
              {gitBranch && (
                <div className="flex items-center gap-1.5">
                  <span>Branch: {gitBranch}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className={cn('text-2xl font-bold', severityStyle.text)}>
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="text-xs text-muted-foreground mt-1">{t('common.status')}</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className={cn('text-2xl font-bold', driftedResources > 0 ? 'text-red-400' : 'text-green-400')}>
            {driftedResources}
          </div>
          <div className="text-xs text-muted-foreground">{t('drilldown.drift.driftedResources')}</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="text-sm font-mono text-foreground truncate">{gitPath || '/'}</div>
          <div className="text-xs text-muted-foreground">{t('drilldown.drift.gitPath')}</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="text-sm text-foreground">
            {lastChecked ? new Date(lastChecked).toLocaleString() : '-'}
          </div>
          <div className="text-xs text-muted-foreground">{t('drilldown.drift.lastChecked')}</div>
        </div>
      </div>

      {gitRepo && (
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <h4 className="text-sm font-medium text-foreground mb-3">{t('drilldown.drift.gitSource')}</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Repository:</span>
              <span className="ml-2 text-foreground font-mono">{gitRepo}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Branch:</span>
              <span className="ml-2 text-foreground">{gitBranch || 'main'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Path:</span>
              <span className="ml-2 text-foreground font-mono">{gitPath || '/'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface DriftChangesTabProps {
  changes: DriftChange[] | null
  changesLoading: boolean
  changesError: string | null
  onChangeClick: (change: DriftChange) => void
  getChangeTypeStyle: (type: string) => { bg: string; text: string; label: string }
}

export function DriftChangesTab({
  changes,
  changesLoading,
  changesError,
  onChangeClick,
  getChangeTypeStyle,
}: DriftChangesTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">Drifted Resources ({changes?.length || 0})</h4>
      {changesError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="text-sm">{changesError}</span>
        </div>
      )}
      {changesLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : changes && changes.length > 0 ? (
        <div className="space-y-2">
          {changes.map((change, i) => {
            const changeStyle = getChangeTypeStyle(change.changeType)
            return (
              <div
                key={i}
                onClick={() => onChangeClick(change)}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border border-border bg-card/50',
                  (change.kind === 'Pod' || change.kind === 'Deployment') && change.namespace
                    ? 'cursor-pointer hover:bg-card/80 transition-colors'
                    : ''
                )}
              >
                <div className="flex items-center gap-3">
                  <span className={cn('px-2 py-0.5 rounded text-xs font-medium', changeStyle.bg, changeStyle.text)}>
                    {changeStyle.label}
                  </span>
                  <div>
                    <span className="text-sm font-medium text-foreground">{change.kind}/{change.name}</span>
                    {change.namespace && <span className="text-xs text-muted-foreground ml-2">({change.namespace})</span>}
                  </div>
                </div>
                {(change.kind === 'Pod' || change.kind === 'Deployment') && change.namespace && (
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50 text-green-400" />
          <p className="text-green-400">{t('drilldown.drift.noDrifted')}</p>
          <p className="text-xs mt-1">{t('drilldown.drift.allMatch')}</p>
        </div>
      )}
    </div>
  )
}

interface DriftDiffTabProps {
  selectedChange: DriftChange | null
}

export function DriftDiffTab({ selectedChange }: DriftDiffTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">{t('drilldown.drift.configDiff')}</h4>
      {selectedChange ? (
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-secondary/50">
            <span className="text-sm text-foreground">
              {selectedChange.kind}/{selectedChange.name}
              {selectedChange.namespace && ` in ${selectedChange.namespace}`}
            </span>
          </div>
          {selectedChange.diff ? (
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <pre className="text-sm font-mono whitespace-pre-wrap overflow-x-auto">{selectedChange.diff}</pre>
            </div>
          ) : selectedChange.fields && selectedChange.fields.length > 0 ? (
            <div className="space-y-2">
              {selectedChange.fields.map((field, i) => (
                <div key={i} className="p-3 rounded-lg border border-border bg-card/50">
                  <div className="text-xs text-muted-foreground mb-2 font-mono">{field.path}</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs text-muted-foreground">Git:</span>
                      <pre className="text-sm text-green-400 mt-1">{field.gitValue}</pre>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">{t('drilldown.fields.cluster')}</span>
                      <pre className="text-sm text-red-400 mt-1">{field.clusterValue}</pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t('drilldown.drift.diffNotAvailable')}</p>
              <p className="text-xs mt-1">{t('drilldown.drift.selectResourceChanges')}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Diff className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.drift.selectResourceDiff')}</p>
          <p className="text-xs mt-1">{t('drilldown.drift.chooseDrifted')}</p>
        </div>
      )}
    </div>
  )
}

interface DriftAITabProps {
  isAgentConnected: boolean
  aiAnalysis: string | null
  aiAnalysisLoading: boolean
  onDiagnose: () => void
}

export function DriftAITab({ isAgentConnected, aiAnalysis, aiAnalysisLoading, onDiagnose }: DriftAITabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
          <ConsoleAIIcon className="w-5 h-5" />
          {t('drilldown.ai.title')}
        </h4>
        <button
          onClick={onDiagnose}
          disabled={!isAgentConnected}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          <Stethoscope className="w-4 h-4" />
          Analyze Drift
        </button>
      </div>

      {!isAgentConnected ? (
        <div className="text-center py-12 text-muted-foreground">
          <ConsoleAIIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.ai.notConnected')}</p>
          <p className="text-xs mt-1">{t('drilldown.ai.configureAgent')}</p>
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
          <p>{t('drilldown.drift.clickAnalyze')}</p>
          <p className="text-xs mt-1">{t('drilldown.drift.analyzeHint')}</p>
        </div>
      )}
    </div>
  )
}
