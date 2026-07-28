import { History, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ArgoSyncHistoryPanelProps } from './types'

export function ArgoSyncHistoryPanel({ historyLoading, syncHistory }: ArgoSyncHistoryPanelProps) {
  const { t } = useTranslation()

  if (historyLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (syncHistory && syncHistory.length > 0) {
    return (
      <div className="space-y-2">
        {syncHistory.map((entry, i) => (
          <div
            key={`${entry.revision}-${i}`}
            className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary font-mono text-xs">
                {entry.revision}
              </div>
              <div>
                <div className="text-sm text-foreground">{entry.status}</div>
                {entry.message && (
                  <div className="text-xs text-muted-foreground truncate max-w-sm">{entry.message}</div>
                )}
              </div>
            </div>
            <span className="text-xs text-muted-foreground">
              {entry.deployedAt ? new Date(entry.deployedAt).toLocaleString() : '-'}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="text-center py-12 text-muted-foreground">
      <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
      <p>{t('drilldown.argoApp.noSyncHistory')}</p>
    </div>
  )
}
