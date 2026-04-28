import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Shield } from 'lucide-react'
import { useCardLoadingState } from './CardDataContext'
import { useAdmissionWebhooks } from '../../hooks/useAdmissionWebhooks'
import { CardSkeleton } from '../../lib/cards/CardComponents'

export function AdmissionWebhooks() {
  const { t } = useTranslation('cards')
  const [tab, setTab] = useState<'all' | 'mutating' | 'validating'>('all')
  const { webhooks, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures, lastRefresh } = useAdmissionWebhooks()
  const hasData = webhooks.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  })

  if (showSkeleton) {
    return <CardSkeleton type="list" rows={4} />
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <Shield className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">{t('admissionWebhooks.noWebhooks', 'No admission webhooks found')}</p>
        <p className="text-xs mt-1">{t('admissionWebhooks.noWebhooksHint', 'Webhooks will appear here when configured')}</p>
      </div>
    )
  }

  const filtered = tab === 'all' ? webhooks : webhooks.filter(w => w.type === tab)
  const mutatingCount = webhooks.filter(w => w.type === 'mutating').length
  const validatingCount = webhooks.filter(w => w.type === 'validating').length

  return (
    <div className="space-y-2 p-1">
      <div className="flex gap-2 items-center">
        {(['all', 'mutating', 'validating'] as const).map(tabKey => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
              tab === tabKey ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {tabKey === 'all' ? t('admissionWebhooks.allTab', { count: webhooks.length }) : tabKey === 'mutating' ? t('admissionWebhooks.mutatingTab', { count: mutatingCount }) : t('admissionWebhooks.validatingTab', { count: validatingCount })}
          </button>
        ))}
      </div>

      {isFailed && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-medium text-red-400">{t('admissionWebhooks.errorTitle', 'Error loading webhooks')}</p>
            <p className="text-2xs text-muted-foreground mt-0.5">{t('admissionWebhooks.errorDescription', 'Failed to fetch webhook data ({{count}} attempts)', { count: consecutiveFailures })}</p>
          </div>
        </div>
      )}

      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {filtered.map((wh, i) => (
          <div key={`${wh.cluster}-${wh.name}-${i}`} className="flex flex-wrap items-center justify-between gap-y-2 px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  wh.type === 'mutating' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
                }`}>
                  {wh.type === 'mutating' ? 'M' : 'V'}
                </span>
                <span className="text-sm font-medium truncate">{wh.name}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{wh.cluster} · {t('admissionWebhooks.rulesCount', { count: wh.rules })}</div>
            </div>
            <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
              wh.failurePolicy === 'Fail' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'
            }`}>
              {wh.failurePolicy}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
