import { AlertTriangle, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// Stats summary row shown at the top of the alerts card
export function AlertStatsRow({ critical, warning, acknowledged }: { critical: number; warning: number; acknowledged: number }) {
  const { t } = useTranslation('cards')
  return (
    <div className="grid grid-cols-2 @sm:grid-cols-3 gap-2 mb-2">
      <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
        <div className="flex items-center gap-1.5 mb-1">
          <AlertTriangle className="w-3 h-3 text-red-400" />
          <span className="text-xs text-red-400">{t('activeAlerts.critical')}</span>
        </div>
        <span className="text-lg font-bold text-foreground">{critical}</span>
      </div>
      <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
        <div className="flex items-center gap-1.5 mb-1">
          <AlertTriangle className="w-3 h-3 text-orange-400" />
          <span className="text-xs text-orange-400">{t('activeAlerts.warning')}</span>
        </div>
        <span className="text-lg font-bold text-foreground">{warning}</span>
      </div>
      <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
        <div className="flex items-center gap-1.5 mb-1">
          <CheckCircle className="w-3 h-3 text-green-400" />
          <span className="text-xs text-green-400">{t('activeAlerts.ackd')}</span>
        </div>
        <span className="text-lg font-bold text-foreground">{acknowledged}</span>
      </div>
    </div>
  )
}
