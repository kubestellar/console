import { memo, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { StatusBadge } from '../../ui/StatusBadge'
import type { DetailPanelProps, MetricType } from './KVCacheMonitor.types'
import { InfoSparkline } from './KVCacheMonitorChart'
import { getDisplayPodName } from './KVCacheMonitor.utils'

const DETAIL_PANEL_WIDTH_SINGLE = 170
const DETAIL_PANEL_WIDTH_DOUBLE = 75
const DETAIL_PANEL_HEIGHT = 32

const METRIC_OPTIONS: MetricType[] = ['util', 'hitRate']

const DEMO_DETAIL_HISTORY = {
  hitRate: [0.9, 0.91, 0.92, 0.93, 0.92, 0.94],
  util: [58, 61, 64, 67, 69, 72],
}

export const KVCacheMonitorDetailPanel = memo(function KVCacheMonitorDetailPanel({
  isDemoData,
  onClose,
  onToggleMetric,
  panelPosition,
  podHistory,
  selectedMetrics,
  selectedPod,
  stats,
  t,
}: DetailPanelProps) {
  const selectedStat = useMemo(
    () => (stats || []).find(stat => stat.podName === selectedPod) || null,
    [selectedPod, stats],
  )
  const selectedHistory = selectedPod
    ? podHistory[selectedPod] || (isDemoData ? DEMO_DETAIL_HISTORY : undefined)
    : undefined

  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <AnimatePresence>
      {selectedPod && panelPosition && selectedStat && (
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className="fixed z-dropdown w-[200px] rounded-lg border border-border bg-background/95 p-3 shadow-2xl backdrop-blur-xs"
          exit={{ opacity: 0, scale: 0.95 }}
          initial={{ opacity: 0, scale: 0.95 }}
          style={{ left: panelPosition.x, top: panelPosition.y }}
          transition={{ duration: 0.15 }}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">{getDisplayPodName(t, selectedStat.podName, 14)}</span>
              {isDemoData && <StatusBadge color="yellow" size="xs">{t('common:common.demo')}</StatusBadge>}
            </div>
            <button className="p-1 text-xs text-muted-foreground hover:text-white" onClick={onClose} type="button" aria-label="Close detail panel">
              ✕
            </button>
          </div>

          <div className="mb-2 text-xs text-muted-foreground">
            {selectedStat.usedGB.toFixed(1)} / {selectedStat.totalCapacityGB} GB
          </div>

          <div className="mb-2 flex gap-1">
            {METRIC_OPTIONS.map(metric => (
              <button
                key={metric}
                className={`rounded px-2 py-0.5 text-xs transition-all ${selectedMetrics.includes(metric)
                  ? metric === 'util'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-green-500/20 text-green-400'
                  : 'bg-secondary/50 text-muted-foreground hover:text-foreground'}`}
                onClick={() => onToggleMetric(metric)}
                type="button"
              >
                {metric === 'util' ? t('llmd.util') : t('llmd.hitRate')}
              </button>
            ))}
          </div>

          <div className="mb-2 flex gap-3 text-xs">
            {selectedMetrics.includes('util') && (
              <div>
                <span className="text-muted-foreground">{t('llmd.util')}:</span>{' '}
                <span className="font-mono text-yellow-400">{selectedStat.utilizationPercent}%</span>
              </div>
            )}
            {selectedMetrics.includes('hitRate') && (
              <div>
                <span className="text-muted-foreground">{t('llmd.hit')}:</span>{' '}
                <span className="font-mono text-green-400">{Math.round(selectedStat.hitRate * 100)}%</span>
              </div>
            )}
          </div>

          {selectedHistory && (
            <div className={`grid gap-2 ${selectedMetrics.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {selectedMetrics.includes('util') && (
                <div>
                  <div className="mb-1 text-2xs text-yellow-400/70">{t('llmd.utilPercent')}</div>
                  <InfoSparkline
                    color="#f59e0b"
                    data={selectedHistory.util}
                    height={DETAIL_PANEL_HEIGHT}
                    width={selectedMetrics.length === 2 ? DETAIL_PANEL_WIDTH_DOUBLE : DETAIL_PANEL_WIDTH_SINGLE}
                  />
                </div>
              )}
              {selectedMetrics.includes('hitRate') && (
                <div>
                  <div className="mb-1 text-2xs text-green-400/70">{t('llmd.hitRate')}</div>
                  <InfoSparkline
                    color="#22c55e"
                    data={selectedHistory.hitRate}
                    height={DETAIL_PANEL_HEIGHT}
                    width={selectedMetrics.length === 2 ? DETAIL_PANEL_WIDTH_DOUBLE : DETAIL_PANEL_WIDTH_SINGLE}
                  />
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
})
