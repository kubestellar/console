import { useMemo } from 'react'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { motion } from 'framer-motion'
import { ExternalLink, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatTimeAgo } from '../../../lib/formatters'
import type { NightlyGuideStatus, NightlyRun } from '../../../lib/llmd/nightlyE2EDemoData'
import { sanitizeUrl } from '../../../lib/utils/sanitizeUrl'
import {
  PLATFORM_COLORS,
  computeAvgDurationMin,
  formatDuration,
  getGuideMeta,
} from './nightlyE2E.constants'
import { RunDot, TrendIndicator } from './NightlyE2EGuideRow'
import { TrendSparkline } from './NightlyE2ETrendSparkline'
import { computeRunDurationMin, generateNightlySummary } from './NightlyE2EDetailPanel.utils'

export function NightlySummaryPanel({ guides }: { guides: NightlyGuideStatus[] }) {
  const { t } = useTranslation(['cards'])
  const [para1, para2] = useMemo(() => generateNightlySummary(guides), [guides])

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-purple-400" />
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">{t('cards:llmd.aiSummary')}</span>
      </div>
      <div className="flex-1 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">{para1}</p>
        {para2 && <p className="text-xs text-muted-foreground leading-relaxed">{para2}</p>}
      </div>
      <div className="mt-auto pt-3 border-t border-border/30">
        <p className="text-2xs text-muted-foreground text-center">{t('cards:llmd.hoverTestDetails')}</p>
      </div>
    </div>
  )
}

export function GuideDetailPanel({ guide, hoveredRun, onRunHover }: {
  guide: NightlyGuideStatus
  hoveredRun: NightlyRun | null
  onRunHover: (run: NightlyRun | null) => void
}) {
  const { t } = useTranslation(['cards', 'common'])
  const { isDemoMode } = useDemoMode()
  const completedRuns = guide.runs.filter(r => r.status === 'completed')
  const passed = completedRuns.filter(r => r.conclusion === 'success').length
  const failedAll = completedRuns.filter(r => r.conclusion === 'failure')
  const gpuFails = failedAll.filter(r => r.failureReason === 'gpu_unavailable').length
  const failed = failedAll.length - gpuFails
  const cancelled = completedRuns.filter(r => r.conclusion === 'cancelled').length
  const running = guide.runs.filter(r => r.status === 'in_progress').length
  const meta = getGuideMeta(guide)
  const avgDur = computeAvgDurationMin(completedRuns)

  // Per-run overrides when hovering a specific dot
  const displayModel = hoveredRun?.model || meta.model
  const displayGpuType = hoveredRun?.gpuType || meta.gpuType
  const displayGpuCount = hoveredRun ? hoveredRun.gpuCount : meta.gpuCount
  const runDur = hoveredRun ? computeRunDurationMin(hoveredRun) : null

  // Consecutive streak
  let streak = 0
  let streakType: 'success' | 'failure' | null = null
  for (const run of guide.runs) {
    if (run.status !== 'completed') continue
    if (!streakType) streakType = run.conclusion === 'success' ? 'success' : 'failure'
    if ((streakType === 'success' && run.conclusion === 'success') ||
        (streakType === 'failure' && run.conclusion !== 'success')) {
      streak++
    } else break
  }

  // Last success & failure timestamps
  const lastSuccess = guide.runs.find(r => r.conclusion === 'success')
  const lastFailure = guide.runs.find(r => r.conclusion === 'failure')

  const workflowUrl = `https://github.com/${guide.repo}/actions/workflows/${guide.workflowFile}`

  return (
    <motion.div
      key={`${guide.guide}-${guide.platform}`}
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="h-full flex flex-col"
    >
      {/* Header */}
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono font-bold text-sm" style={{ color: PLATFORM_COLORS[guide.platform] }}>
            {guide.acronym}
          </span>
          <span className="text-sm font-semibold text-foreground truncate">{guide.guide}</span>
        </div>
        <div className="flex items-center gap-2 text-2xs text-muted-foreground">
          <span style={{ color: PLATFORM_COLORS[guide.platform] }}>{guide.platform}</span>
          <span>&middot;</span>
          <a href={sanitizeUrl(workflowUrl)} target="_blank" rel="noopener noreferrer"
            className="hover:text-foreground transition-colors flex items-center gap-0.5 min-h-11 min-w-11">
            {guide.repo.split('/')[1]} <ExternalLink size={9} />
          </a>
        </div>
      </div>

      {/* Trend sparkline */}
      <div className="mb-2">
        <TrendSparkline runs={guide.runs} />
      </div>

      {/* Pass rate + stats in a row */}
      <div className={`grid ${gpuFails > 0 ? 'grid-cols-6' : 'grid-cols-5'} gap-1.5 mb-2`}>
        <div className="col-span-1 bg-secondary/60 border border-border/50 rounded-lg p-2 text-center">
          <div className={`text-lg font-bold ${
            guide.passRate >= 90 ? 'text-green-400' : guide.passRate >= 70 ? 'text-yellow-400' : guide.passRate > 0 ? 'text-red-400' : 'text-muted-foreground'
          }`}>
            {guide.passRate}%
          </div>
          <div className="text-[8px] text-muted-foreground uppercase tracking-wider">{t('common:common.rate')}</div>
        </div>
        <StatBox label={t('cards:llmd.pass')} value={String(passed)} color="text-green-400" />
        <StatBox label={t('cards:llmd.fail')} value={String(failed)} color="text-red-400" />
        {gpuFails > 0 && <StatBox label="GPU" value={String(gpuFails)} color="text-yellow-400" />}
        <StatBox label={t('cards:llmd.skip')} value={String(cancelled)} color="text-muted-foreground" />
        <StatBox label={t('cards:llmd.run')} value={String(running)} color="text-blue-400" />
      </div>

      {/* Streak */}
      {streakType && streak > 0 && (
        <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border mb-2 ${
          streakType === 'success'
            ? 'bg-green-950/30 border-green-800/40'
            : 'bg-red-950/30 border-red-800/40'
        }`}>
          {streakType === 'success' ? (
            <TrendingUp size={13} className="text-green-400" />
          ) : (
            <TrendingDown size={13} className="text-red-400" />
          )}
          <span className="text-xs text-foreground">
            {streak} {streakType === 'success'
              ? t(streak === 1 ? 'cards:llmd.consecutivePass' : 'cards:llmd.consecutivePasses')
              : t(streak === 1 ? 'cards:llmd.consecutiveFailure' : 'cards:llmd.consecutiveFailures')}
          </span>
        </div>
      )}

      {/* Infrastructure + timestamps */}
      <div className="space-y-1 flex-1">
        {hoveredRun && (
          <div className="flex items-center gap-1.5 mb-1">
            <div className={`w-1.5 h-1.5 rounded-full ${
              hoveredRun.status !== 'completed' ? 'bg-blue-500' : hoveredRun.conclusion === 'success' ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="text-2xs text-muted-foreground font-mono">
              Run #{hoveredRun.runNumber} &middot; {formatTimeAgo(hoveredRun.createdAt)}
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs">
          <span className="text-muted-foreground">{t('cards:llmd.model')}</span>
          <span className={`font-mono text-2xs truncate max-w-[140px] ${hoveredRun ? 'text-foreground' : 'text-foreground'}`} title={displayModel}>{displayModel}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs">
          <span className="text-muted-foreground">{t('cards:llmd.gpu')}</span>
          <span className={`font-mono text-2xs ${hoveredRun ? 'text-foreground' : 'text-foreground'}`}>
            {displayGpuCount > 0 ? `${displayGpuCount}× ${displayGpuType}` : displayGpuType}
          </span>
        </div>
        {hoveredRun && runDur !== null ? (
          <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs">
            <span className="text-muted-foreground">{t('cards:llmd.duration')}</span>
            <span className="text-foreground font-mono">{formatDuration(runDur)}</span>
          </div>
        ) : avgDur !== null ? (
          <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs">
            <span className="text-muted-foreground">{t('cards:llmd.avgDuration')}</span>
            <span className="text-foreground font-mono">{formatDuration(avgDur)}</span>
          </div>
        ) : null}
        <div className="h-px bg-border/30 my-0.5" />
        {lastSuccess && (
          <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs">
            <span className="text-muted-foreground">{t('cards:llmd.lastPass')}</span>
            <span className="text-green-400 font-mono">{formatTimeAgo(lastSuccess.updatedAt)}</span>
          </div>
        )}
        {lastFailure && (
          <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs">
            <span className="text-muted-foreground">{t('cards:llmd.lastFail')}</span>
            <span className="text-red-400 font-mono">{formatTimeAgo(lastFailure.updatedAt)}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs">
          <span className="text-muted-foreground">{t('cards:llmd.totalRuns')}</span>
          <span className="text-foreground font-mono">{guide.runs.length}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs">
          <span className="text-muted-foreground">{t('cards:llmd.trend')}</span>
          <TrendIndicator trend={guide.trend} passRate={guide.passRate} />
        </div>
      </div>

      {/* Run history dots — hover to see per-run details above */}
      <div className="mt-auto pt-2 border-t border-border/30">
        <div className="text-2xs text-muted-foreground mb-1.5">
          {hoveredRun ? t('cards:llmd.runHistoryNewest') : `${t('cards:llmd.runHistoryNewest')} — ${t('cards:llmd.hoverDotForDetails')}`}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {guide.runs.map((run) => (
            <RunDot
              key={run.id}
              run={run}
              guide={guide}
              isDemoMode={isDemoMode}
              isHighlighted={hoveredRun?.id === run.id}
              onMouseEnter={() => onRunHover(run)}
              onMouseLeave={() => onRunHover(null)}
            />
          ))}
        </div>
      </div>
    </motion.div>
  )
}

export function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-secondary/40 border border-border/30 rounded-lg p-2 text-center">
      <div className={`text-base font-bold ${color}`}>{value}</div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  )
}

