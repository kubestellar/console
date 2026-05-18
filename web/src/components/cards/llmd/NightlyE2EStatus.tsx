/**
 * NightlyE2EStatus — Report card for llm-d nightly E2E workflow status
 *
 * Shows per-guide pass/fail history with colored run dots, trend indicators,
 * and aggregate statistics. Grouped by platform (OCP, GKE).
 * Fetches from GitHub Actions API; falls back to demo data without a token.
 */
import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { TestTube2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAIMode } from '../../../hooks/useAIMode'
import { useNightlyE2EData } from '../../../hooks/useNightlyE2EData'
import { TOOLTIP_HIDE_DELAY_MS } from '../../../lib/constants/network'
import { formatTimeAgo } from '../../../lib/formatters'
import type { NightlyGuideStatus, NightlyRun } from '../../../lib/llmd/nightlyE2EDemoData'
import { Skeleton } from '../../ui/Skeleton'
import { useCardLoadingState } from '../CardDataContext'
import { GuideRow } from './NightlyE2EGuideRow'
import { GuideDetailPanel, NightlySummaryPanel } from './NightlyE2EDetailPanel'
import { PLATFORM_COLORS, PLATFORM_ORDER } from './nightlyE2E.constants'

export function NightlyE2EStatus() {
  const { t } = useTranslation(['cards', 'common'])
  const { guides, isDemoFallback, isFailed, consecutiveFailures, isLoading, isRefreshing } = useNightlyE2EData()
  const { shouldSummarize } = useAIMode()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [hoveredRun, setHoveredRun] = useState<NightlyRun | null>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleRunHover = (run: NightlyRun | null) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    if (run) {
      setHoveredRun(run)
    } else {
      // Delay clearing so moving between adjacent dots doesn't flash to null
      hoverTimeoutRef.current = setTimeout(() => setHoveredRun(null), TOOLTIP_HIDE_DELAY_MS)
    }
  }

  const hasData = guides.length > 0
  const { showSkeleton } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isFailed,
    consecutiveFailures,
    isDemoData: isDemoFallback,
    errorMessage: isFailed ? 'Failed to load nightly E2E status' : undefined })

  const selectedGuide = (() => {
    if (!selectedKey) return null
    return guides.find(g => `${g.guide}-${g.platform}` === selectedKey) ?? null
  })()

  const { stats, grouped, lastRunTime } = useMemo(() => {
    const total = guides.length
    const allRuns = guides.flatMap(g => g.runs)
    const completedRuns = allRuns.filter(r => r.status === 'completed')
    const passedRuns = completedRuns.filter(r => r.conclusion === 'success')
    const overallPassRate = completedRuns.length > 0
      ? Math.round((passedRuns.length / completedRuns.length) * 100)
      : 0

    const failing = guides.filter(g => g.latestConclusion === 'failure').length

    // Find most recent run across all guides
    const mostRecent = allRuns
      .map(r => new Date(r.updatedAt).getTime())
      .sort((a, b) => b - a)[0]

    // Group by platform
    const byPlatform = new Map<string, NightlyGuideStatus[]>()
    for (const p of PLATFORM_ORDER) {
      const pg = guides.filter(g => g.platform === p)
      if (pg.length > 0) byPlatform.set(p, pg)
    }

    return {
      stats: { total, overallPassRate, failing },
      grouped: byPlatform,
      lastRunTime: mostRecent ? new Date(mostRecent).toISOString() : null }
  }, [guides])

  if (showSkeleton) {
    return (
      <div className="p-4 h-full flex flex-col gap-3 overflow-hidden">
        <div className="grid grid-cols-2 @md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={64} />
          ))}
        </div>
        <div className="flex flex-1 min-h-0 gap-3">
          <div className="flex-1 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={36} />
            ))}
          </div>
          <div className="w-[420px] shrink-0">
            <Skeleton variant="rounded" height={280} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 h-full flex flex-col gap-3 overflow-hidden">
      {/* Stats row */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="bg-secondary/60 border border-border/50 rounded-xl p-3 text-center"
        >
          <div className={`text-xl font-bold ${stats.overallPassRate >= 90 ? 'text-green-400' : stats.overallPassRate >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
            {stats.overallPassRate}%
          </div>
          <div className="text-2xs text-muted-foreground uppercase tracking-wider mt-0.5">{t('cards:llmd.passRate')}</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="bg-secondary/60 border border-border/50 rounded-xl p-3 text-center"
        >
          <div className="text-xl font-bold text-white">{stats.total}</div>
          <div className="text-2xs text-muted-foreground uppercase tracking-wider mt-0.5">{t('cards:llmd.guides')}</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="bg-secondary/60 border border-border/50 rounded-xl p-3 text-center"
        >
          <div className={`text-xl font-bold ${stats.failing > 0 ? 'text-red-400' : 'text-green-400'}`}>
            {stats.failing}
          </div>
          <div className="text-2xs text-muted-foreground uppercase tracking-wider mt-0.5">{t('cards:llmd.failing')}</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="bg-secondary/60 border border-border/50 rounded-xl p-3 text-center"
        >
          <div className="text-xl font-bold text-foreground">
            {lastRunTime ? formatTimeAgo(lastRunTime) : '—'}
          </div>
          <div className="text-2xs text-muted-foreground uppercase tracking-wider mt-0.5">{t('cards:llmd.lastRun')}</div>
        </motion.div>
      </div>

      {/* Two-column layout: guide rows (left) + detail panel (right) */}
      <div className="flex flex-1 min-h-0 gap-3">
        {/* Guide rows grouped by platform */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-2" onMouseLeave={() => { setSelectedKey(null); if (hoverTimeoutRef.current) { clearTimeout(hoverTimeoutRef.current); hoverTimeoutRef.current = null }; setHoveredRun(null) }}>
          {[...grouped.entries()].map(([platform, platformGuides]) => (
            <div key={platform}>
              <div className="flex items-center gap-2 px-2 mb-1">
                <TestTube2 size={12} style={{ color: PLATFORM_COLORS[platform] }} />
                <span className="text-2xs font-semibold uppercase tracking-wider"
                  style={{ color: PLATFORM_COLORS[platform] }}>
                  {platform}
                </span>
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-2xs text-muted-foreground">
                  {platformGuides.filter(g => g.latestConclusion === 'success').length}/{platformGuides.length} {t('cards:llmd.passing')}
                </span>
              </div>
              {platformGuides.map((guide, gi) => {
                const key = `${guide.guide}-${guide.platform}`
                return (
                  <GuideRow
                    key={key}
                    guide={guide}
                    delay={0.25 + gi * 0.04}
                    isSelected={selectedKey === key}
                    onMouseEnter={() => setSelectedKey(key)}
                    onRunHover={handleRunHover}
                  />
                )
              })}
            </div>
          ))}
        </div>

        {/* Detail panel (right side) */}
        <div className="w-[420px] shrink-0 bg-secondary/30 border border-border/40 rounded-xl p-3 overflow-y-auto">
          {selectedGuide ? (
            <GuideDetailPanel guide={selectedGuide} hoveredRun={hoveredRun} onRunHover={handleRunHover} />
          ) : shouldSummarize ? (
            <NightlySummaryPanel guides={guides} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2">
              <TestTube2 size={20} className="text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground">{t('cards:llmd.hoverTestDetails')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-2xs text-muted-foreground pt-1 border-t border-border/30">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span>{t('cards:llmd.pass')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <span>{t('cards:llmd.fail')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-yellow-400" />
          <span>GPU</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-400" />
          <span>{t('common:common.running').toLowerCase()}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-gray-500 dark:bg-gray-400" />
          <span>{t('cards:llmd.cancelled')}</span>
        </div>
        <span className="text-muted-foreground">|</span>
        <span>{t('cards:llmd.newestRunOnLeft')}</span>
      </div>
    </div>
  )
}

export default NightlyE2EStatus
