import { Loader2, Copy, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'

export interface PodOutputTabProps {
  /** The output content, or null if not yet fetched */
  output: string | null
  /** Whether the data is currently loading */
  loading: boolean
  /** Whether the local agent is connected */
  agentConnected: boolean
  /** The field key used for copy feedback (e.g. 'describe', 'logs', 'events', 'yaml') */
  copyField: string
  /** Currently copied field for feedback */
  copiedField: string | null
  /** The kubectl comment to display above the output */
  kubectlComment: string
  /** Pre-translated loading message */
  loadingMessage: string
  /** Pre-translated not-connected message */
  notConnectedMessage: string
  /** Pre-translated empty/fail message */
  emptyMessage: string
  /** Handler to copy text */
  handleCopy: (field: string, value: string) => void
  /** Handler to refresh/retry the data */
  onRefresh: () => void
  /** Optional refresh icon (for logs, events, yaml tabs that show a refresh button with output) */
  refreshIcon?: LucideIcon
  /** Optional refresh button label */
  refreshLabel?: string
}

export function PodOutputTab({
  output,
  loading,
  agentConnected,
  copyField,
  copiedField,
  kubectlComment,
  loadingMessage,
  notConnectedMessage,
  emptyMessage,
  handleCopy,
  onRefresh,
  refreshIcon: RefreshIcon,
  refreshLabel,
}: PodOutputTabProps) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">{loadingMessage}</span>
        </div>
      </div>
    )
  }

  if (output) {
    return (
      <div>
        <div className="relative">
          <div className="absolute top-2 right-2 flex items-center gap-2">
            {RefreshIcon && refreshLabel && (
              <button
                onClick={onRefresh}
                className="px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                title={refreshLabel}
              >
                <RefreshIcon className="w-3 h-3" /> {refreshLabel}
              </button>
            )}
            <button
              onClick={() => handleCopy(copyField, output)}
              className="px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              {copiedField === copyField ? (
                <><Check className="w-3 h-3 text-green-400" /> {t('common.copied')}</>
              ) : (
                <><Copy className="w-3 h-3" /> {t('common.copy')}</>
              )}
            </button>
          </div>
          <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
            <code className="text-muted-foreground">{kubectlComment}</code>
            {'\n\n'}
            {output}
          </pre>
        </div>
      </div>
    )
  }

  if (!agentConnected) {
    return (
      <div>
        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
          <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
          <p className="text-sm text-muted-foreground mt-1">{notConnectedMessage}</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="p-4 rounded-lg bg-card/50 border border-border text-center">
        <p className="text-muted-foreground">{emptyMessage}</p>
        <button
          onClick={onRefresh}
          className="mt-2 px-3 py-1 rounded bg-primary/20 text-primary text-sm"
        >
          {t('common.retry')}
        </button>
      </div>
    </div>
  )
}
