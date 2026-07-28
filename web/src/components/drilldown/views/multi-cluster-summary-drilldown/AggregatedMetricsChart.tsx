import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DrillDownViewType } from '../../../../hooks/useDrillDown'
import type { SummaryStats } from './types'
import { ClusterSummaryCard } from './ClusterSummaryCard'

interface AggregatedMetricsChartProps {
  iconClassName: string
  Icon: LucideIcon
  stats: SummaryStats
  viewType: DrillDownViewType
}

export function AggregatedMetricsChart({
  iconClassName,
  Icon,
  stats,
  viewType,
}: AggregatedMetricsChartProps) {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-3 gap-4">
      <ClusterSummaryCard
        icon={Icon}
        iconClassName={iconClassName}
        label={t('common.total')}
        value={stats.total}
      />
      {viewType === 'all-alerts' ? (
        <>
          <ClusterSummaryCard
            icon={AlertCircle}
            iconClassName="text-red-400"
            label={t('alerts.firingLabel', { defaultValue: 'Firing' })}
            value={stats.firing}
            valueClassName="text-red-400"
          />
          <ClusterSummaryCard
            icon={CheckCircle}
            iconClassName="text-green-400"
            label={t('alerts.resolvedLabel', { defaultValue: 'Resolved' })}
            value={stats.resolved}
            valueClassName="text-green-400"
          />
        </>
      ) : (
        <>
          <ClusterSummaryCard
            icon={CheckCircle}
            iconClassName="text-green-400"
            label={t('common.healthy')}
            value={stats.healthy}
            valueClassName="text-green-400"
          />
          <ClusterSummaryCard
            icon={AlertTriangle}
            iconClassName="text-yellow-400"
            label={t('common.issues', { defaultValue: 'Issues' })}
            value={stats.issues}
            valueClassName="text-yellow-400"
          />
        </>
      )}
    </div>
  )
}
