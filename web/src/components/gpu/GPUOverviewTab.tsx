import { useTranslation } from 'react-i18next'
import {
  Zap,
  AlertTriangle,
  CheckCircle2,
  Settings2,
} from 'lucide-react'
import { DonutChart } from '../charts/PieChart'
import { BarChart } from '../charts/BarChart'
import { ClusterBadge } from '../ui/ClusterBadge'
import { cn } from '../../lib/cn'
import { TechnicalAcronym } from '../shared/TechnicalAcronym'
import { getChartColorByName } from '../../lib/chartColors'
import { Sparkline } from '../charts/Sparkline'
import type { GPUReservation } from '../../hooks/useGPUReservations'
import type { GPUUtilizationSnapshot } from '../../hooks/useGPUUtilizations'
import {
  STATUS_COLORS,
  UTILIZATION_HIGH_THRESHOLD,
  UTILIZATION_MEDIUM_THRESHOLD,
  SPARKLINE_HEIGHT_PX,
  computeAvgUtilization,
  countActiveDays,
  getUtilizationColor,
} from './gpu-constants'

export interface GPUOverviewStats {
  totalGPUs: number
  allocatedGPUs: number
  availableGPUs: number
  utilizationPercent: number
  activeReservations: number
  reservedGPUs: number
  typeChartData: Array<{ name: string; value: number; color: string }>
  usageByNamespace: Array<{ name: string; value: number; color: string }>
  clusterUsage: Array<{ name: string; value: number }>
}

export interface GPUOverviewTabProps {
  stats: GPUOverviewStats
  filteredReservations: GPUReservation[]
  utilizations: Record<string, GPUUtilizationSnapshot[]> | null
  effectiveDemoMode: boolean
  showOnlyMine: boolean
}

export function GPUOverviewTab({
  stats,
  filteredReservations,
  utilizations,
  effectiveDemoMode,
  showOnlyMine,
}: GPUOverviewTabProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{stats.totalGPUs}</div>
              <div className="text-xs text-muted-foreground">{t('common:common.totalGpus')}</div>
            </div>
          </div>
        </div>
        <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-green-400">{stats.availableGPUs}</div>
              <div className="text-xs text-muted-foreground">{t('common:common.available')}</div>
            </div>
          </div>
        </div>
        <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Settings2 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-400">{stats.activeReservations}</div>
              <div className="text-xs text-muted-foreground">{t('gpuReservations.stats.activeReservations')}</div>
            </div>
          </div>
        </div>
        <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-400">{stats.reservedGPUs}</div>
              <div className="text-xs text-muted-foreground">{t('gpuReservations.stats.reservedGpus')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Utilization */}
        <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
          <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('gpuReservations.charts.gpuUtilization')}</h3>
          <div className="flex items-center justify-center">
            <div className="relative w-32 h-32">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="8" className="text-secondary" />
                <circle cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${stats.utilizationPercent * 3.52} 352`}
                  className={cn(
                    stats.utilizationPercent > UTILIZATION_HIGH_THRESHOLD ? 'text-red-500' :
                    stats.utilizationPercent > UTILIZATION_MEDIUM_THRESHOLD ? 'text-yellow-500' : 'text-green-500'
                  )}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-foreground">{stats.utilizationPercent}%</span>
                <span className="text-xs text-muted-foreground">{t('common:common.used')}</span>
              </div>
            </div>
          </div>
          <div className="text-center mt-4 text-sm text-muted-foreground">
            {t('gpuReservations.overview.allocated', { allocated: stats.allocatedGPUs, total: stats.totalGPUs })}
          </div>
        </div>

        {/* GPU Types */}
        <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
          <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('common:common.gpuTypes')}</h3>
          {stats.typeChartData.length > 0 ? (
            <DonutChart data={stats.typeChartData} size={150} thickness={20} showLegend={true} />
          ) : (
            <div className="flex items-center justify-center h-[150px] text-muted-foreground">{t('gpuReservations.overview.noGpuData')}</div>
          )}
        </div>

        {/* Usage by Namespace */}
        <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
          <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('gpuReservations.charts.gpuUsageByNamespace')}</h3>
          {stats.usageByNamespace.length > 0 ? (
            <DonutChart data={stats.usageByNamespace} size={150} thickness={20} showLegend={true} />
          ) : (
            <div className="flex items-center justify-center h-[150px] text-muted-foreground">{t('gpuReservations.overview.noGpuQuotas')}</div>
          )}
        </div>
      </div>

      {/* Cluster Allocation */}
      {stats.clusterUsage.length > 0 && (
        <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
          <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('gpuReservations.charts.gpuAllocationByCluster')}</h3>
          <BarChart data={stats.clusterUsage} height={200} color={getChartColorByName('primary')} showGrid={true} />
        </div>
      )}

      {/* Active Reservations */}
      <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
        <h3 className="text-sm font-medium text-muted-foreground mb-4">
          {showOnlyMine ? t('gpuReservations.overview.myGpuReservations') : t('gpuReservations.overview.activeGpuReservations')}
        </h3>
        <div className="space-y-3">
          {filteredReservations.slice(0, 5).map(r => {
            const snapshots = (utilizations || {})[r.id] || []
            const avgUtil = computeAvgUtilization(snapshots)
            const activeDays = countActiveDays(snapshots)
            const sparkColor = snapshots.length > 0 ? getUtilizationColor(avgUtil) : '#9333ea'
            return (
            <div key={r.id}
              className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="p-2 rounded-lg bg-purple-500/20 shrink-0">
                    <Zap className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{r.title}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {r.namespace} · {r.user_name}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="text-right">
                    <div className="font-medium text-foreground">{r.gpu_count} <TechnicalAcronym term="GPU">{t('common:common.gpus')}</TechnicalAcronym></div>
                    <div className="text-sm text-muted-foreground">{t('gpuReservations.overview.durationHours', { hours: r.duration_hours })}</div>
                  </div>
                  <span className={cn('px-2 py-0.5 text-xs rounded-full border', STATUS_COLORS[r.status] || STATUS_COLORS.pending)}>
                    {r.status}
                  </span>
                  <ClusterBadge cluster={r.cluster} size="sm" />
                </div>
              </div>
              {/* GPU Utilization Sparkline */}
              {snapshots.length > 0 ? (
                <div className="mt-2 pt-2 border-t border-purple-500/10">
                  <Sparkline
                    data={snapshots.map(s => s.gpu_utilization_pct)}
                    color={sparkColor}
                    height={SPARKLINE_HEIGHT_PX}
                    fill
                  />
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span style={{ color: sparkColor }}>
                      {t('gpuReservations.utilization.avgGpu', `Avg {{pct}}% GPU`, { pct: avgUtil })}
                    </span>
                    <span className="text-muted-foreground">
                      {t('gpuReservations.utilization.activeDays', `{{count}} active days`, { count: activeDays })}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-2 pt-2 border-t border-purple-500/10">
                  <div className="text-xs text-muted-foreground text-center py-1">
                    {t('gpuReservations.utilization.noData', 'No usage data yet')}
                  </div>
                </div>
              )}
            </div>
            )
          })}
          {filteredReservations.length === 0 && (
            <div className="text-center py-4 text-muted-foreground">
              {showOnlyMine ? t('gpuReservations.overview.noReservationsUser') : t('gpuReservations.overview.noReservationsYet')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
