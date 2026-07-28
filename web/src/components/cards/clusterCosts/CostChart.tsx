import { memo } from 'react'
import { useTranslation } from 'react-i18next'

interface CostChartProps {
  totalMonthly: number
  totalDaily: number
}

export const CostChart = memo(function CostChart({ totalMonthly, totalDaily }: CostChartProps) {
  const { t } = useTranslation(['cards'])

  return (
    <div className="p-4 rounded-lg bg-linear-to-r from-green-500/20 to-green-500/20 border border-green-500/30 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div>
          <p className="text-xs text-green-400 mb-1">{t('cards:clusterCosts.estimatedMonthly')}</p>
          <p className="text-2xl font-bold text-foreground">${totalMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground mb-1">{t('cards:clusterCosts.daily')}</p>
          <p className="text-lg font-medium text-foreground">${totalDaily.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
      </div>
    </div>
  )
})
