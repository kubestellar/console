import { History, Loader2, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../../lib/cn'
import { getStatusStyle } from './helpers'
import type { HelmReleaseHistoryTableProps } from './types'

export function HelmReleaseHistoryTable({
  historyLoading,
  releaseHistory,
  releaseInfo,
  releaseRevision,
  helmActionLoading,
  onConfirmRollback,
}: HelmReleaseHistoryTableProps) {
  const { t } = useTranslation()

  if (historyLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (releaseHistory && releaseHistory.length > 0) {
    return (
      <div className="space-y-2">
        {[...releaseHistory].sort((a, b) => b.revision - a.revision).map((rev) => {
          const revStatus = getStatusStyle(rev.status)
          return (
            <div
              key={rev.revision}
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-sm font-medium">
                  {rev.revision}
                </div>
                <div>
                  <div className="text-sm text-foreground">{rev.chart}</div>
                  <div className="text-xs text-muted-foreground">{rev.description}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn('px-2 py-0.5 rounded text-xs', revStatus.bg, revStatus.text)}>
                  {rev.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(rev.updated).toLocaleDateString()}
                </span>
                {String(rev.revision) !== (releaseInfo?.revision || releaseRevision) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onConfirmRollback(rev.revision)
                    }}
                    disabled={helmActionLoading}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/20 transition-colors disabled:opacity-50"
                    title={`Roll back to revision ${rev.revision}`}
                  >
                    <RotateCcw className={cn('w-3 h-3', helmActionLoading && 'animate-spin')} />
                    Rollback
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="text-center py-12 text-muted-foreground">
      <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
      <p>{t('drilldown.helm.noHistory')}</p>
    </div>
  )
}
