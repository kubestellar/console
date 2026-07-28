import { Bell, AlertTriangle, CheckCircle2, Zap, ChevronRight } from 'lucide-react'
import { DonutChart } from '../../charts/PieChart'
import { BarChart } from '../../charts/BarChart'
import { formatStat } from '../../../lib/formatStats'
import { StatusBadge } from '../../ui/StatusBadge'
import { getChartColorByName } from '../../../lib/theme/chartColors'
import type { ClusterEvent } from '../../../hooks/mcp/types'
import { getTimeAgo, DONUT_SIZE, DONUT_THICKNESS, DONUT_EMPTY_HEIGHT, BAR_CHART_HEIGHT, MAX_RECENT_WARNINGS_PREVIEW } from './helpers'
import type { EventsStats, EventFilter, TranslateFn } from './types'

export interface EventsOverviewTabProps {
  t: TranslateFn
  stats: EventsStats
  globalFilteredWarningEvents: ClusterEvent[]
  onFilterSelect: (filter: EventFilter) => void
}

/** Overview tab: summary stat tiles, distribution charts, and a recent-warnings preview. */
export function EventsOverviewTab({ t, stats, globalFilteredWarningEvents, onFilterSelect }: EventsOverviewTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <button onClick={() => onFilterSelect('all')} className="glass p-4 rounded-lg text-left hover:bg-secondary/30 transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20"><Bell className="w-5 h-5 text-purple-400" /></div>
            <div><div className="text-2xl font-bold text-foreground">{formatStat(stats.total)}</div><div className="text-xs text-muted-foreground">{t('events.stats.total')}</div></div>
          </div>
        </button>
        <button onClick={() => onFilterSelect('warning')} className="glass p-4 rounded-lg text-left hover:bg-secondary/30 transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20"><AlertTriangle className="w-5 h-5 text-yellow-400" /></div>
            <div><div className="text-2xl font-bold text-yellow-400">{formatStat(stats.warnings)}</div><div className="text-xs text-muted-foreground">{t('events.stats.warnings')}</div></div>
          </div>
        </button>
        <button onClick={() => onFilterSelect('normal')} className="glass p-4 rounded-lg text-left hover:bg-secondary/30 transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20"><CheckCircle2 className="w-5 h-5 text-green-400" /></div>
            <div><div className="text-2xl font-bold text-green-400">{formatStat(stats.normal)}</div><div className="text-xs text-muted-foreground">{t('common.normal')}</div></div>
          </div>
        </button>
        <div className="glass p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20"><Zap className="w-5 h-5 text-blue-400" /></div>
            <div><div className="text-2xl font-bold text-blue-400">{formatStat(stats.recentCount)}</div><div className="text-xs text-muted-foreground">{t('events.stats.lastHour')}</div></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="glass p-4 rounded-lg">
          <div className="text-sm font-medium text-muted-foreground mb-4">{t('events.sections.eventTypes')}</div>
          {stats.typeChartData.length > 0 ? <DonutChart data={stats.typeChartData} size={DONUT_SIZE} thickness={DONUT_THICKNESS} showLegend={true} /> : <div className="flex items-center justify-center text-muted-foreground" style={{ height: DONUT_EMPTY_HEIGHT }}>{t('events.empty.noEvents')}</div>}
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-sm font-medium text-muted-foreground mb-4">{t('events.sections.topReasons')}</div>
          {stats.topReasons.length > 0 ? <DonutChart data={stats.topReasons} size={DONUT_SIZE} thickness={DONUT_THICKNESS} showLegend={true} /> : <div className="flex items-center justify-center text-muted-foreground" style={{ height: DONUT_EMPTY_HEIGHT }}>{t('events.empty.noEvents')}</div>}
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-sm font-medium text-muted-foreground mb-4">{t('events.sections.byCluster')}</div>
          {stats.clusterData.length > 0 ? <DonutChart data={stats.clusterData} size={DONUT_SIZE} thickness={DONUT_THICKNESS} showLegend={true} /> : <div className="flex items-center justify-center text-muted-foreground" style={{ height: DONUT_EMPTY_HEIGHT }}>{t('events.empty.noClusterData')}</div>}
        </div>
      </div>

      <div className="glass p-4 rounded-lg">
        <h4 className="text-sm font-medium text-muted-foreground mb-4">{t('events.sections.activityLast24h')}</h4>
        <BarChart data={stats.hourlyData} height={BAR_CHART_HEIGHT} color={getChartColorByName('primary')} showGrid={true} />
      </div>

      <div className="glass p-4 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-muted-foreground">{t('events.sections.recentWarnings')}</h3>
          <button onClick={() => onFilterSelect('warning')} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 px-3 py-2 min-h-11 min-w-11">{t('events.viewAll')} <ChevronRight className="w-3 h-3" /></button>
        </div>
        {globalFilteredWarningEvents.slice(0, MAX_RECENT_WARNINGS_PREVIEW).length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4"><CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400 opacity-50" />{t('events.empty.noWarnings')}</div>
        ) : (
          <div className="space-y-2">
            {globalFilteredWarningEvents.slice(0, MAX_RECENT_WARNINGS_PREVIEW).map((event) => (
              <div key={`${event.reason}-${event.object}-${event.lastSeen}`} className="flex items-center gap-3 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusBadge color="yellow">{event.reason}</StatusBadge>
                    <span className="text-sm text-foreground truncate">{event.object}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">{event.message}</div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">{getTimeAgo(event.lastSeen, t)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
