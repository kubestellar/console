import { memo } from 'react'
import { CircleDot, Database, Grid3X3 } from 'lucide-react'
import { StatusBadge } from '../../ui/StatusBadge'
import { moveFocusByKey } from '../../../lib/a11y/rovingFocus'
import type { HeaderProps } from './KVCacheMonitor.types'

export const KVCacheMonitorHeader = memo(function KVCacheMonitorHeader({
  aggregationMode,
  isDemoMode,
  onAggregationModeChange,
  onViewModeToggle,
  selectedStack,
  t,
  viewMode,
}: HeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-y-2">
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-cyan-500/20 p-1.5">
          <Database size={16} className="text-cyan-400" />
        </div>
        <span className="font-medium text-white">{t('llmd.kvCacheMonitor')}</span>
      </div>

      <div className="flex items-center gap-2">
        {selectedStack && (
          <div className="flex items-center gap-1 text-xs">
            <span
              className={`max-w-[180px] truncate rounded px-1.5 py-0.5 font-medium ${
                isDemoMode ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'
              }`}
              title={selectedStack.name}
            >
              {selectedStack.name}
            </span>
            {isDemoMode && <StatusBadge color="yellow" size="xs">{t('common:common.demo')}</StatusBadge>}
          </div>
        )}

        <div
          aria-label={t('llmd.aggregationMode', 'Aggregation mode')}
          className="flex rounded-lg bg-secondary/80 p-0.5 backdrop-blur-xs"
          onKeyDown={event => {
            const nextTab = moveFocusByKey(event, { orientation: 'horizontal', selector: '[role="tab"]' })
            const nextMode = nextTab?.dataset.mode as HeaderProps['aggregationMode'] | undefined
            if (nextMode) {
              onAggregationModeChange(nextMode)
            }
          }}
          role="tablist"
        >
          <button
            aria-selected={aggregationMode === 'aggregated'}
            className={`rounded px-2 py-1 text-xs transition-all ${
              aggregationMode === 'aggregated'
                ? 'bg-purple-500/30 text-purple-400 shadow-lg shadow-purple-500/20'
                : 'text-muted-foreground hover:text-white'
            }`}
            data-mode="aggregated"
            onClick={() => onAggregationModeChange('aggregated')}
            role="tab"
            tabIndex={aggregationMode === 'aggregated' ? 0 : -1}
            title={t('llmd.showOnePerRole')}
            type="button"
          >
            {t('llmd.agg')}
          </button>
          <button
            aria-selected={aggregationMode === 'disaggregated'}
            className={`rounded px-2 py-1 text-xs transition-all ${
              aggregationMode === 'disaggregated'
                ? 'bg-purple-500/30 text-purple-400 shadow-lg shadow-purple-500/20'
                : 'text-muted-foreground hover:text-white'
            }`}
            data-mode="disaggregated"
            onClick={() => onAggregationModeChange('disaggregated')}
            role="tab"
            tabIndex={aggregationMode === 'disaggregated' ? 0 : -1}
            title={t('llmd.showOnePerReplica')}
            type="button"
          >
            {t('llmd.perPod')}
          </button>
        </div>

        <div className="flex items-center gap-1">
          {viewMode !== 'heatmap' && (
            <button
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-all ${
                viewMode === 'horseshoe'
                  ? 'bg-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/20'
                  : 'bg-secondary/50 text-muted-foreground'
              }`}
              onClick={() => onViewModeToggle(viewMode === 'gauges' ? 'horseshoe' : 'gauges')}
              title={t('llmd.toggleHorseshoe')}
              type="button"
            >
              <CircleDot size={12} />
            </button>
          )}

          <button
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-all ${
              viewMode === 'heatmap'
                ? 'bg-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/20'
                : 'bg-secondary/50 text-muted-foreground'
            }`}
            onClick={() => onViewModeToggle(viewMode === 'heatmap' ? 'gauges' : 'heatmap')}
            title={t('llmd.toggleHeatmap')}
            type="button"
          >
            <Grid3X3 size={12} />
          </button>
        </div>
      </div>
    </div>
  )
})
