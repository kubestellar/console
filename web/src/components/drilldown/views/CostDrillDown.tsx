import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { Server, DollarSign, Cpu, HardDrive, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  data: Record<string, unknown>
}

interface CostRow {
  label: string
  value: string
  icon: typeof Cpu
  color: string
}

export function CostDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const { drillToCluster } = useDrillDownActions()

  const monthly = data.monthly as number | undefined
  const daily = data.daily as number | undefined
  const hourly = data.hourly as number | undefined
  const cpus = data.cpus as number | undefined
  const memory = data.memory as number | undefined
  const gpus = data.gpus as number | undefined
  const provider = data.provider as string | undefined
  const costType = data.costType as string | undefined
  const totalMonthly = data.totalMonthly as number | undefined

  const isClusterView = cluster !== 'all'

  const rows: CostRow[] = []
  if (monthly !== undefined) {
    rows.push({ label: 'Monthly', value: `$${Math.round(monthly).toLocaleString()}`, icon: DollarSign, color: 'text-green-400' })
  }
  if (totalMonthly !== undefined && !isClusterView) {
    rows.push({ label: 'Total Monthly', value: `$${Math.round(totalMonthly).toLocaleString()}`, icon: DollarSign, color: 'text-green-400' })
  }
  if (daily !== undefined) {
    rows.push({ label: 'Daily', value: `$${daily.toFixed(2)}`, icon: DollarSign, color: 'text-blue-400' })
  }
  if (hourly !== undefined) {
    rows.push({ label: 'Hourly', value: `$${hourly.toFixed(4)}`, icon: DollarSign, color: 'text-purple-400' })
  }
  if (cpus !== undefined) {
    rows.push({ label: 'CPUs', value: `${cpus} cores`, icon: Cpu, color: 'text-cyan-400' })
  }
  if (memory !== undefined) {
    rows.push({ label: 'Memory', value: `${memory} GB`, icon: HardDrive, color: 'text-orange-400' })
  }
  if (gpus !== undefined && gpus > 0) {
    rows.push({ label: 'GPUs', value: `${gpus}`, icon: Zap, color: 'text-yellow-400' })
  }

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-6 text-sm">
          {costType && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
              <DollarSign className="w-4 h-4 text-green-400" />
              <span className="text-muted-foreground">Type</span>
              <span className="font-mono text-green-400 capitalize">{costType}</span>
            </div>
          )}
          {provider && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Server className="w-4 h-4 text-blue-400" />
              <span className="text-muted-foreground">Provider</span>
              <span className="font-mono text-blue-400 capitalize">{provider}</span>
            </div>
          )}
          {isClusterView && (
            <button
              onClick={() => drillToCluster(cluster)}
              className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
            >
              <Server className="w-4 h-4 text-blue-400" />
              <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
              <ClusterBadge cluster={cluster.split('/').pop() || cluster} size="sm" />
            </button>
          )}
        </div>
      </div>

      {/* Cost Breakdown */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {rows.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-400" />
              Cost Breakdown
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {rows.map(row => {
                const Icon = row.icon
                return (
                  <div key={row.label} className="p-4 rounded-lg bg-secondary/30 border border-border">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-4 h-4 ${row.color}`} />
                      <span className="text-xs text-muted-foreground">{row.label}</span>
                    </div>
                    <div className={`text-lg font-mono font-semibold ${row.color}`}>{row.value}</div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
            <p className="text-yellow-400">No cost data available</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default CostDrillDown
