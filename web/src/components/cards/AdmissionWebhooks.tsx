import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCardLoadingState } from './CardDataContext'
import { useAdmissionWebhooks } from '../../hooks/useAdmissionWebhooks'

export function AdmissionWebhooks() {
  const { t } = useTranslation('cards')
  const [tab, setTab] = useState<'all' | 'mutating' | 'validating'>('all')
  const { webhooks, isLoading, isDemoData } = useAdmissionWebhooks()
  useCardLoadingState({ isLoading, hasAnyData: webhooks.length > 0, isDemoData })
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

      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {filtered.map((wh, i) => (
          <div key={`${wh.cluster}-${wh.name}-${i}`} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
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
