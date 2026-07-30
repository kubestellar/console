/* eslint-disable react-refresh/only-export-components */
import {
  FileText, Tag, ChevronDown, ChevronUp, Loader2,
  Copy, Check, ChevronLeft, Layers, Server, Database,
  Eye, EyeOff, Lock,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ClusterBadge } from '../../ui/ClusterBadge'

// ---------------------------------------------------------------------------
// ConfigMapDrillDownHeader
// ---------------------------------------------------------------------------

interface HeaderProps {
  cluster: string
  namespace: string
  clusterShort: string
  canGoBack: boolean
  onBack: () => void
  onDrillToNamespace: (cluster: string, ns: string) => void
  onDrillToCluster: (cluster: string) => void
}

export function ConfigMapDrillDownHeader({
  cluster, namespace, clusterShort, canGoBack,
  onBack, onDrillToNamespace, onDrillToCluster,
}: HeaderProps) {
  const { t } = useTranslation()
  return (
    <div className="px-6 pt-6 pb-4">
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
        {namespace && cluster && (
          <button
            type="button"
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
        {cluster && (
          <button
            type="button"
            onClick={() => onDrillToCluster(cluster)}
            className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
          >
            <Server className="w-4 h-4 text-blue-400" />
            <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
            <ClusterBadge cluster={clusterShort} size="sm" />
            <svg className="w-3 h-3 text-blue-400/70 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ConfigMapOverviewTab
// ---------------------------------------------------------------------------

interface OverviewTabProps {
  hasRequiredContext: boolean
  dataLoading: boolean
  dataError: string | null
  configmapName: string
  dataEntries: [string, string][]
  labels: Record<string, string> | null
  tabPanelProps: Record<string, unknown>
}

export function ConfigMapOverviewTab({
  hasRequiredContext, dataLoading, dataError,
  configmapName, dataEntries, labels, tabPanelProps,
}: OverviewTabProps) {
  const { t } = useTranslation()
  return (
    <div {...tabPanelProps} className="space-y-6">
      {!hasRequiredContext && (
        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-400">
          {t('drilldown.configmap.missingContext', 'Unable to load this ConfigMap because the selected resource is missing required details.')}
        </div>
      )}
      {dataLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">{t('common.loading', 'Loading...')}</span>
        </div>
      )}
      {dataError && !dataLoading && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-400">{dataError}</p>
        </div>
      )}
      {/* Basic Info */}
      <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
        <div className="flex items-center gap-3">
          <FileText className="w-8 h-8 text-yellow-400" />
          <div>
            <div className="text-lg font-semibold text-foreground">{configmapName}</div>
            <div className="text-sm text-muted-foreground">
              {dataEntries.length} key{dataEntries.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>
      {/* Labels */}
      {labels && Object.keys(labels).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <Tag className="w-4 h-4 text-blue-400" />
            Labels
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(labels).slice(0, 5).map(([key, value]) => (
              <span key={key} className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 font-mono">
                {key}={value}
              </span>
            ))}
            {Object.keys(labels).length > 5 && (
              <span className="text-xs text-muted-foreground">+{Object.keys(labels).length - 5} more</span>
            )}
          </div>
        </div>
      )}
      {/* Data Preview */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <Database className="w-4 h-4 text-yellow-400" />
          Data Keys
        </h3>
        {dataEntries.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {dataEntries.map(([key]) => (
              <span key={key} className="text-xs px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 font-mono">
                {key}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No data in this ConfigMap</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ConfigMapDataTab
// ---------------------------------------------------------------------------

interface DataTabProps {
  dataEntries: [string, string][]
  displayedData: [string, string][]
  showAllData: boolean
  revealAll: boolean
  copiedField: string | null
  isRevealed: (key: string) => boolean
  toggleReveal: (key: string) => void
  toggleRevealAll: () => void
  handleCopy: (field: string, value: string) => void
  setShowAllData: (val: boolean) => void
  tabPanelProps: Record<string, unknown>
}

export function ConfigMapDataTab({
  dataEntries, displayedData, showAllData, revealAll, copiedField,
  isRevealed, toggleReveal, toggleRevealAll, handleCopy, setShowAllData,
  tabPanelProps,
}: DataTabProps) {
  return (
    <div {...tabPanelProps} className="space-y-4">
      {/* #6211: master reveal toggle. #6231: text reflects current revealAll state. */}
      <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-400 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4" />
          {revealAll
            ? 'ConfigMap values are visible. Click "Mask all" to hide.'
            : 'ConfigMap values are hidden by default. Click the eye icon to reveal.'}
        </div>
        <button
          onClick={toggleRevealAll}
          className="px-2 py-1 rounded bg-yellow-500/20 hover:bg-yellow-500/30 text-xs text-yellow-300 flex items-center gap-1"
        >
          {revealAll ? <><EyeOff className="w-3 h-3" /> Mask all</> : <><Eye className="w-3 h-3" /> Reveal all</>}
        </button>
      </div>
      {dataEntries.length > 0 ? (
        <>
          {displayedData.map(([key, value]) => (
            <div key={key} className="rounded-lg bg-card/50 border border-border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-yellow-500/10 border-b border-border">
                <span className="font-mono text-sm text-yellow-400">{key}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleReveal(key)}
                    className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
                    aria-label={isRevealed(key) ? 'Mask value' : 'Reveal value'}
                    title={isRevealed(key) ? 'Mask value' : 'Reveal value'}
                  >
                    {isRevealed(key) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleCopy(`data-${key}`, isRevealed(key) ? value : '••••••••••••••••')}
                    className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
                    aria-label={isRevealed(key) ? 'Copy value' : 'Reveal first to copy'}
                    title={isRevealed(key) ? 'Copy value' : 'Reveal first to copy the actual value'}
                  >
                    {copiedField === `data-${key}` ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <pre className="p-3 text-xs font-mono text-foreground whitespace-pre-wrap max-h-48 overflow-auto">
                {isRevealed(key) ? value : '••••••••••••••••'}
              </pre>
            </div>
          ))}
          {dataEntries.length > 5 && (
            <button
              onClick={() => setShowAllData(!showAllData)}
              className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
            >
              {showAllData ? (
                <>Show less <ChevronUp className="w-3 h-3" /></>
              ) : (
                <>Show all {dataEntries.length} keys <ChevronDown className="w-3 h-3" /></>
              )}
            </button>
          )}
        </>
      ) : (
        <div className="p-4 rounded-lg bg-card/50 border border-border text-center text-muted-foreground">
          No data in this ConfigMap
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ConfigMapOutputPane — shared by Describe and YAML tabs
// ---------------------------------------------------------------------------

interface OutputPaneProps {
  loading: boolean
  /** Already-processed content (masking applied before passing in if needed). */
  displayedContent: string | null
  copiedField: string | null
  copiedFieldKey: string
  loadingText: string
  onCopy: (field: string, value: string) => void
  tabPanelProps: Record<string, unknown>
  /** Optional info banner rendered above the output (e.g. masking notice). */
  infoBanner?: React.ReactNode
}

export function ConfigMapOutputPane({
  loading, displayedContent, copiedField, copiedFieldKey,
  loadingText, onCopy, tabPanelProps, infoBanner,
}: OutputPaneProps) {
  const { t } = useTranslation()
  return (
    <div {...tabPanelProps}>
      {infoBanner}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">{loadingText}</span>
        </div>
      ) : displayedContent ? (
        <div className="relative">
          <button
            onClick={() => onCopy(copiedFieldKey, displayedContent)}
            className="absolute top-2 right-2 px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {copiedField === copiedFieldKey
              ? <><Check className="w-3 h-3 text-green-400" /> Copied</>
              : <><Copy className="w-3 h-3" /> Copy</>}
          </button>
          <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
            {displayedContent}
          </pre>
        </div>
      ) : (
        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
          <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
        </div>
      )}
    </div>
  )
}
