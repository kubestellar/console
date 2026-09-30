import { useTranslation } from 'react-i18next'

interface ClusterMetricsSummaryProps {
  data: Array<{ value: number }>
  unit: string
}

export function ClusterMetricsSummary({ data, unit }: ClusterMetricsSummaryProps) {
  const { t } = useTranslation(['cards', 'common'])

  if (data.length === 0) return null

  const values = data.map((d) => d.value)
  const min = Math.round(values.length > 0 ? Math.min(...values) : 0)
  const avg = Math.round(data.reduce((a, b) => a + b.value, 0) / data.length)
  const max = Math.round(values.length > 0 ? Math.max(...values) : 0)

  return (
    <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 @md:grid-cols-3 gap-4">
      <div>
        <p className="text-xs text-muted-foreground">{t('cards:clusterMetrics.min')}</p>
        <p className="text-sm font-medium text-foreground">{min}{unit}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{t('cards:clusterMetrics.avg')}</p>
        <p className="text-sm font-medium text-foreground">{avg}{unit}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{t('cards:clusterMetrics.max')}</p>
        <p className="text-sm font-medium text-foreground">{max}{unit}</p>
      </div>
    </div>
  )
}
