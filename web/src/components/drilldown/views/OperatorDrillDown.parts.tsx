/* eslint-disable react-refresh/only-export-components */
import { Loader2, Package, FileText, ExternalLink, Settings, RefreshCw, ChevronLeft, Server, Layers } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { sanitizeUrl } from '../../../lib/utils/sanitizeUrl'
import { useTranslation } from 'react-i18next'
import { ConsoleAIIcon } from '../../ui/ConsoleAIIcon'
import { Stethoscope } from 'lucide-react'
import { ClusterBadge } from '../../ui/ClusterBadge'
import type { CSVInfo, CRDInfo } from './operator-drilldown'

type PhaseStyle = {
  bg: string
  text: string
  border: string
  icon: React.ComponentType<{ className?: string }>
}

interface OperatorDrillDownHeaderProps {
  cluster: string
  namespace: string
  operatorPhase: string
  phaseStyle: PhaseStyle
  canGoBack: boolean
  onBack: () => void
  onNamespaceClick: () => void
  onClusterClick: () => void
}

export function OperatorDrillDownHeader({
  cluster,
  namespace,
  operatorPhase,
  phaseStyle,
  canGoBack,
  onBack,
  onNamespaceClick,
  onClusterClick,
}: OperatorDrillDownHeaderProps) {
  const { t } = useTranslation()
  const PhaseIcon = phaseStyle.icon

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

        <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1', phaseStyle.bg, phaseStyle.text, 'border', phaseStyle.border)}>
          <PhaseIcon className="w-3 h-3" />
          {operatorPhase}
        </span>
      </div>
    </div>
  )
}

interface OperatorTabBarProps {
  tabs: { id: string; label: string; icon: React.ComponentType<{ className?: string }> }[]
  activeTab: string
  onSelect: (tab: string) => void
}

export function OperatorTabBar({ tabs, activeTab, onSelect }: OperatorTabBarProps) {
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

interface OperatorOverviewTabProps {
  csvInfo: CSVInfo | null
  operatorName: string
  channel?: string
  source?: string
  sourceNamespace?: string
  subscriptionName?: string
  operatorCRDs?: CRDInfo[] | null
  phaseStyle: { bg: string; text: string; border: string }
}

export function OperatorOverviewTab({
  csvInfo,
  operatorName,
  channel,
  source,
  sourceNamespace,
  subscriptionName,
  operatorCRDs,
  phaseStyle,
}: OperatorOverviewTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      {/* Operator Info Card */}
      <div className="p-4 rounded-lg bg-linear-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
        <div className="flex items-start gap-3">
          <Settings className="w-8 h-8 text-purple-400 mt-1" />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground">
              {csvInfo?.displayName || operatorName}
            </h3>
            {csvInfo?.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{csvInfo.description}</p>
            )}
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
              {csvInfo?.version && (
                <div className="flex items-center gap-1.5">
                  <Package className="w-4 h-4" />
                  <span>Version: {csvInfo.version}</span>
                </div>
              )}
              {channel && (
                <div className="flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4" />
                  <span>Channel: {channel}</span>
                </div>
              )}
              {csvInfo?.provider && (
                <div className="flex items-center gap-1.5">
                  <Settings className="w-4 h-4" />
                  <span>Provider: {csvInfo.provider}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Subscription Info */}
      <div className="p-4 rounded-lg border border-border bg-card/50">
        <h4 className="text-sm font-medium text-foreground mb-3">{t('drilldown.operator.subscription')}</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">{t('drilldown.operator.name')}</span>
            <span className="ml-2 text-foreground">{subscriptionName || operatorName}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('drilldown.operator.channel')}</span>
            <span className="ml-2 text-foreground">{channel || 'default'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('drilldown.fields.source')}</span>
            <span className="ml-2 text-foreground">{source || 'Unknown'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('drilldown.operator.sourceNs')}</span>
            <span className="ml-2 text-foreground">{sourceNamespace || 'Unknown'}</span>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className={cn('text-2xl font-bold', phaseStyle.text)}>
            <Settings className="w-8 h-8" />
          </div>
          <div className="text-xs text-muted-foreground mt-1">{t('common.status')}</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="text-2xl font-bold text-foreground">{operatorCRDs?.length || '-'}</div>
          <div className="text-xs text-muted-foreground">{t('drilldown.tabs.crds')}</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="text-sm font-mono text-foreground truncate">{csvInfo?.version || '-'}</div>
          <div className="text-xs text-muted-foreground">{t('common.version')}</div>
        </div>
      </div>

      {/* Links */}
      {csvInfo?.links && csvInfo.links.length > 0 && (
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <h4 className="text-sm font-medium text-foreground mb-3">{t('drilldown.operator.links')}</h4>
          <div className="flex flex-wrap gap-2">
            {csvInfo.links.map((link, i) => (
              <a
                key={i}
                href={sanitizeUrl(link.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary/50 text-sm text-foreground hover:bg-secondary transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                {link.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface OperatorCSVTabProps {
  csvInfo: CSVInfo | null
  csvLoading: boolean
  phaseStyle: { bg: string; text: string; border: string }
}

export function OperatorCSVTab({ csvInfo, csvLoading, phaseStyle }: OperatorCSVTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">{t('drilldown.operator.csvDetails')}</h4>
      {csvLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : csvInfo ? (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-border bg-card/50">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Name:</span>
                <span className="ml-2 text-foreground font-mono">{csvInfo.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Display Name:</span>
                <span className="ml-2 text-foreground">{csvInfo.displayName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Version:</span>
                <span className="ml-2 text-foreground">{csvInfo.version}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Phase:</span>
                <span className={cn('ml-2 px-2 py-0.5 rounded text-xs', phaseStyle.bg, phaseStyle.text)}>
                  {csvInfo.phase}
                </span>
              </div>
              {csvInfo.maturity && (
                <div>
                  <span className="text-muted-foreground">Maturity:</span>
                  <span className="ml-2 text-foreground capitalize">{csvInfo.maturity}</span>
                </div>
              )}
              {csvInfo.provider && (
                <div>
                  <span className="text-muted-foreground">Provider:</span>
                  <span className="ml-2 text-foreground">{csvInfo.provider}</span>
                </div>
              )}
            </div>
          </div>

          {csvInfo.maintainers && csvInfo.maintainers.length > 0 && (
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <h5 className="text-sm font-medium text-foreground mb-2">{t('drilldown.operator.maintainers')}</h5>
              <div className="space-y-1">
                {csvInfo.maintainers.map((m, i) => (
                  <div key={i} className="text-sm text-muted-foreground">
                    {m.name} {m.email && `<${m.email}>`}
                  </div>
                ))}
              </div>
            </div>
          )}

          {csvInfo.installModes && (
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <h5 className="text-sm font-medium text-foreground mb-2">{t('drilldown.operator.installModes')}</h5>
              <div className="flex flex-wrap gap-2">
                {csvInfo.installModes.map((mode) => (
                  <span
                    key={mode.type}
                    className={cn(
                      'px-2 py-1 rounded text-xs',
                      mode.supported ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    )}
                  >
                    {mode.type}: {mode.supported ? t('drilldown.operator.yes') : t('drilldown.operator.no')}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.operator.csvNotAvailable')}</p>
        </div>
      )}
    </div>
  )
}

interface OperatorCRDsTabProps {
  operatorCRDs: CRDInfo[] | null
  crdsLoading: boolean
  onCRDClick: (crdName: string) => void
}

export function OperatorCRDsTab({ operatorCRDs, crdsLoading, onCRDClick }: OperatorCRDsTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">
        {t('drilldown.operator.ownedCRDs', { count: operatorCRDs?.length || 0 })}
      </h4>
      {crdsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : operatorCRDs && operatorCRDs.length > 0 ? (
        <div className="space-y-2">
          {operatorCRDs.map((crd) => (
            <div
              key={crd.name}
              onClick={() => onCRDClick(crd.name)}
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Package className="w-4 h-4 text-purple-400" />
                <div>
                  <span className="text-sm font-medium text-foreground">{crd.kind}</span>
                  <span className="text-xs text-muted-foreground ml-2">({crd.version})</span>
                  {crd.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">{crd.description}</p>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground font-mono">{crd.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.operator.noCRDs')}</p>
        </div>
      )}
    </div>
  )
}

interface OperatorAITabProps {
  isAgentConnected: boolean
  aiAnalysis: string | null
  aiAnalysisLoading: boolean
  onDiagnose: () => void
}

export function OperatorAITab({
  isAgentConnected,
  aiAnalysis,
  aiAnalysisLoading,
  onDiagnose,
}: OperatorAITabProps) {
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
          {t('drilldown.operator.analyzeOperator')}
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
          <p>{t('drilldown.operator.clickAnalyze')}</p>
          <p className="text-xs mt-1">{t('drilldown.operator.analyzeHint')}</p>
        </div>
      )}
    </div>
  )
}
