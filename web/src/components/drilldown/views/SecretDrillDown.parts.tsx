import { ChevronDown, ChevronUp, Loader2, Copy, Check, ChevronLeft, Layers, Server, Eye, EyeOff, Lock, Tag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { cn } from '../../../lib/cn'
import type { SecretTab, TabType } from './useSecretDrillDown'

// ─── Header ──────────────────────────────────────────────────────────────────

interface SecretHeaderBreadcrumbsProps {
  cluster: string
  namespace: string
  canGoBack: boolean
  onBack: () => void
  onNamespaceClick: () => void
  onClusterClick: () => void
}

/** Navigation breadcrumbs: back button, namespace chip, cluster chip. */
export function SecretHeaderBreadcrumbs({
  cluster,
  namespace,
  canGoBack,
  onBack,
  onNamespaceClick,
  onClusterClick,
}: SecretHeaderBreadcrumbsProps) {
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
        <button
          type="button"
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
          type="button"
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
    </div>
  )
}

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

interface SecretTabBarProps {
  tabs: SecretTab[]
  activeTab: TabType
  onTabChange: (tab: TabType) => void
}

/** Horizontal tab bar for the Secret drill-down. */
export function SecretTabBar({ tabs, activeTab, onTabChange }: SecretTabBarProps) {
  return (
    <div className="border-b border-border px-6">
      <div className="flex gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
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

// ─── Overview Tab ─────────────────────────────────────────────────────────────

interface SecretOverviewTabProps {
  secretName: string
  secretType: string | null
  dataLoading: boolean
  dataError: string | null
  dataEntries: [string, string][]
  labels: Record<string, string> | null
}

/** Overview tab: basic info card, labels, secret key list. */
export function SecretOverviewTab({
  secretName,
  secretType,
  dataLoading,
  dataError,
  dataEntries,
  labels,
}: SecretOverviewTabProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
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
      <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
        <div className="flex items-center gap-3">
          <Lock className="w-8 h-8 text-red-400" />
          <div>
            <div className="text-lg font-semibold text-foreground">{secretName}</div>
            <div className="text-sm text-muted-foreground">
              Type: {secretType} • {dataEntries.length} key{dataEntries.length !== 1 ? 's' : ''}
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
      {/* Data Keys */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <Lock className="w-4 h-4 text-red-400" />
          Secret Keys
        </h3>
        {dataEntries.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {dataEntries.map(([key]) => (
              <span key={key} className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 font-mono">
                {key}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No data in this Secret</p>
        )}
      </div>
    </div>
  )
}

// ─── Data Tab ─────────────────────────────────────────────────────────────────

interface SecretDataTabProps {
  dataEntries: [string, string][]
  displayedData: [string, string][]
  revealedKeys: Set<string>
  copiedField: string | null
  showAllData: boolean
  onToggleReveal: (key: string) => void
  onCopy: (field: string, value: string) => void
  onToggleShowAll: () => void
}

/** Data tab: key/value rows with per-key reveal and copy controls. */
export function SecretDataTab({
  dataEntries,
  displayedData,
  revealedKeys,
  copiedField,
  showAllData,
  onToggleReveal,
  onCopy,
  onToggleShowAll,
}: SecretDataTabProps) {
  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-400 flex items-center gap-2">
        <Lock className="w-4 h-4" />
        Secret values are hidden by default. Click the eye icon to reveal.
      </div>
      {dataEntries.length > 0 ? (
        <>
          {displayedData.map(([key, value]) => (
            <div key={key} className="rounded-lg bg-card/50 border border-border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-red-500/10 border-b border-border">
                <span className="font-mono text-sm text-red-400">{key}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onToggleReveal(key)}
                    className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
                  >
                    {revealedKeys.has(key) ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => onCopy(`data-${key}`, value)}
                    className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
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
                {revealedKeys.has(key) ? value : '••••••••••••••••'}
              </pre>
            </div>
          ))}
          {dataEntries.length > 5 && (
            <button
              onClick={onToggleShowAll}
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
          No data in this Secret
        </div>
      )}
    </div>
  )
}
