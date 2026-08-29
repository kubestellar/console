/* eslint-disable react-refresh/only-export-components */
import { HardDrive, Code, Info, Tag, Loader2, Copy, Check, ChevronLeft, Layers, Server, Database, AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

export type TabType = 'overview' | 'describe' | 'yaml'

export function getStatusColor(status: string): string {
  const s = status?.toLowerCase() || ''
  if (s === 'bound') return 'bg-green-500/20 text-green-400'
  if (s === 'pending') return 'bg-yellow-500/20 text-yellow-400'
  if (s === 'lost') return 'bg-red-500/20 text-red-400'
  return 'bg-muted text-muted-foreground'
}

export function getTabs(t: TFunction): { id: TabType; label: string; icon: typeof Info }[] {
  return [
    { id: 'overview', label: String(t('drilldown.overview', 'Overview')), icon: Info },
    { id: 'describe', label: String(t('drilldown.describe', 'Describe')), icon: Code },
    { id: 'yaml', label: 'YAML', icon: Code },
  ]
}

interface DrillDownErrorBannerProps {
  message: string
  onRetry: () => void
}

export function DrillDownErrorBanner({ message, onRetry }: DrillDownErrorBannerProps) {
  const { t } = useTranslation()
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
    >
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-md bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/30"
      >
        <RefreshCw className="w-3 h-3" />
        {t('common.retry', 'Retry')}
      </button>
    </div>
  )
}

interface CopyButtonProps {
  text: string
  field: string
  copiedField: string | null
  onCopy: (text: string, field: string) => void
}

export function CopyButton({ text, field, copiedField, onCopy }: CopyButtonProps) {
  return (
    <button
      onClick={() => onCopy(text, field)}
      className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy to clipboard"
    >
      {copiedField === field ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

interface HeaderProps {
  pvcName: string
  status: string
  statusColor: string
  isLoading: boolean
  cluster: string
  namespace: string
  canGoBack: boolean
  onBack?: () => void
  onClusterClick: () => void
  onNamespaceClick: () => void
}

export function PVCDrillDownHeader({
  pvcName,
  status,
  statusColor,
  isLoading,
  cluster,
  namespace,
  canGoBack,
  onBack,
  onClusterClick,
  onNamespaceClick,
}: HeaderProps) {
  const { t } = useTranslation()

  return (
    <>
      {/* Back navigation */}
      {canGoBack && onBack && (
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

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
            <HardDrive className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">{pvcName}</h2>
              {status && (
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', statusColor)}>
                  {status}
                </span>
              )}
              {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <button
                onClick={onClusterClick}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ClusterBadge cluster={cluster} size="sm" />
              </button>
              <span className="text-muted-foreground">/</span>
              <button
                onClick={onNamespaceClick}
                className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300 transition-colors"
              >
                <Layers className="w-3.5 h-3.5" />
                {namespace}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

interface TabBarProps {
  activeTab: TabType
  tabs: { id: TabType; label: string; icon: typeof Info }[]
  onSelect: (tabId: TabType, fetchDescribe?: () => void, fetchYaml?: () => void) => void
  describeOutput: string | null
  yamlOutput: string | null
  fetchDescribe: () => void
  fetchYaml: () => void
}

export function PVCTabBar({ activeTab, tabs, onSelect, describeOutput, yamlOutput, fetchDescribe, fetchYaml }: TabBarProps) {
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => {
            onSelect(tab.id)
            if (tab.id === 'describe' && !describeOutput) void fetchDescribe()
            if (tab.id === 'yaml' && !yamlOutput) void fetchYaml()
          }}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === tab.id
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <tab.icon className="w-3.5 h-3.5" />
          {tab.label}
        </button>
      ))}
    </div>
  )
}

interface LabelsProps {
  labels: Record<string, string>
}

export function LabelsSection({ labels }: LabelsProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
        <Tag className="w-4 h-4 text-yellow-400" />
        {t('drilldown.labels', 'Labels')}
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(labels).map(([key, value]) => (
          <span key={key} className="px-2 py-1 rounded bg-secondary/50 text-xs font-mono text-foreground">
            {key}={value}
          </span>
        ))}
      </div>
    </div>
  )
}

interface AnnotationsProps {
  annotations: Record<string, string>
}

export function AnnotationsSection({ annotations }: AnnotationsProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
        <Tag className="w-4 h-4 text-muted-foreground" />
        {t('drilldown.annotations', 'Annotations')}
      </h3>
      <div className="space-y-1">
        {Object.entries(annotations).map(([key, value]) => (
          <div key={key} className="flex items-start gap-2 text-xs">
            <span className="font-mono text-muted-foreground break-all">{key}</span>
            <span className="text-foreground break-all">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export { Info, Database, Server, Layers, Loader2, Copy, Check }
