import { useMemo } from 'react'
import { useDemoMode } from '../../../lib/demoMode'
import { motion } from 'framer-motion'
import { ExternalLink, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatTimeAgo } from '../../../lib/formatters'
import type { NightlyGuideStatus, NightlyRun } from '../../../lib/llmd/nightlyE2EDemoData'
import { sanitizeUrl } from '../../../lib/utils/sanitizeUrl'
import {
  MIN_RUNS_FOR_RATE,
  PLATFORM_COLORS,
  TREND_CHART_AXIS_COLOR,
  TREND_CHART_AXIS_STROKE_WIDTH,
  TREND_CHART_AXIS_TICK_LENGTH,
  TREND_CHART_GRID_COLOR,
  TREND_CHART_GRID_STROKE_WIDTH,
  TREND_CHART_HEIGHT,
  TREND_CHART_LABEL_COLOR,
  TREND_CHART_LABEL_FONT_SIZE,
  TREND_CHART_LATEST_POINT_RADIUS,
  TREND_CHART_LINE_STROKE_WIDTH,
  TREND_CHART_MUTED_LABEL_COLOR,
  TREND_CHART_PADDING_BOTTOM,
  TREND_CHART_PADDING_LEFT,
  TREND_CHART_PADDING_RIGHT,
  TREND_CHART_PADDING_TOP,
  TREND_CHART_POINT_RADIUS,
  TREND_CHART_POINT_STROKE_COLOR,
  TREND_CHART_POINT_STROKE_WIDTH,
  TREND_CHART_WIDTH,
  TREND_CHART_X_LABEL_FONT_SIZE,
  computeAvgDurationMin,
  formatDuration,
  getGuideMeta,
} from './nightlyE2E.constants'
import { RunDot, TrendIndicator } from './NightlyE2EGuideRow'

export function TrendSparkline({ runs }: { runs: NightlyRun[] }) {
  const { t } = useTranslation(['cards', 'common'])
  // Build data points: 1 = success, 0 = failure/cancelled, 0.5 = in_progress
  // Newest on left, oldest on right (matches run history dots)
  const points = runs.map(r => {
    if (r.status === 'in_progress') return 0.5
    return r.conclusion === 'success' ? 1 : 0
  })

  if (points.length < 2) return null

  const chartWidth = TREND_CHART_WIDTH - TREND_CHART_PADDING_LEFT - TREND_CHART_PADDING_RIGHT
  const chartHeight = TREND_CHART_HEIGHT - TREND_CHART_PADDING_TOP - TREND_CHART_PADDING_BOTTOM
  const chartBottom = TREND_CHART_PADDING_TOP + chartHeight
  const yAxisLevels = [
    { label: t('cards:llmd.pass'), value: 1 },
    { label: t('common:common.running'), value: 0.5 },
    { label: t('cards:llmd.fail'), value: 0 },
  ]

  // Build SVG path + area
  const xStep = chartWidth / (points.length - 1)
  const pathPoints = points.map((value, index) => ({
    x: TREND_CHART_PADDING_LEFT + index * xStep,
    y: TREND_CHART_PADDING_TOP + (1 - value) * chartHeight,
  }))

  // Smooth curve using cardinal spline approximation
  let linePath = `M ${pathPoints[0].x} ${pathPoints[0].y}`
  for (let index = 1; index < pathPoints.length; index++) {
    const previousPoint = pathPoints[index - 1]
    const currentPoint = pathPoints[index]
    const controlPointX = (previousPoint.x + currentPoint.x) / 2
    linePath += ` C ${controlPointX} ${previousPoint.y}, ${controlPointX} ${currentPoint.y}, ${currentPoint.x} ${currentPoint.y}`
  }

  const areaPath = `${linePath} L ${pathPoints[pathPoints.length - 1].x} ${chartBottom} L ${pathPoints[0].x} ${chartBottom} Z`

  const latest = points[0]
  const gradientId = `sparkGrad-${latest}`
  const strokeColor = latest >= 1 ? '#34d399' : latest > 0 ? '#fbbf24' : '#f87171'
  const fillOpacity = 0.15

  return (
    <div className="bg-secondary/60 border border-border/50 rounded-lg p-2">
      <div className="text-2xs text-muted-foreground uppercase tracking-wider mb-1">{t('cards:llmd.passFailTrend')}</div>
      <svg width="100%" height={TREND_CHART_HEIGHT} viewBox={`0 0 ${TREND_CHART_WIDTH} ${TREND_CHART_HEIGHT}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity={fillOpacity} />
            <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
          </linearGradient>
        </defs>

        {yAxisLevels.map(({ label, value }) => {
          const y = TREND_CHART_PADDING_TOP + (1 - value) * chartHeight
          return (
            <g key={label}>
              <line
                x1={TREND_CHART_PADDING_LEFT}
                y1={y}
                x2={TREND_CHART_WIDTH - TREND_CHART_PADDING_RIGHT}
                y2={y}
                stroke={TREND_CHART_GRID_COLOR}
                strokeWidth={TREND_CHART_GRID_STROKE_WIDTH}
                strokeOpacity={0.45}
                strokeDasharray="3 3"
              />
              <line
                x1={TREND_CHART_PADDING_LEFT - TREND_CHART_AXIS_TICK_LENGTH}
                y1={y}
                x2={TREND_CHART_PADDING_LEFT}
                y2={y}
                stroke={TREND_CHART_AXIS_COLOR}
                strokeWidth={TREND_CHART_AXIS_STROKE_WIDTH}
                strokeOpacity={0.9}
              />
              <text
                x={TREND_CHART_PADDING_LEFT - TREND_CHART_AXIS_TICK_LENGTH - 2}
                y={y + TREND_CHART_LABEL_FONT_SIZE / 2 - 1}
                textAnchor="end"
                fontSize={TREND_CHART_LABEL_FONT_SIZE}
                fill={TREND_CHART_LABEL_COLOR}
                fillOpacity={0.92}
              >
                {label}
              </text>
            </g>
          )
        })}

        <line
          x1={TREND_CHART_PADDING_LEFT}
          y1={TREND_CHART_PADDING_TOP}
          x2={TREND_CHART_PADDING_LEFT}
          y2={chartBottom}
          stroke={TREND_CHART_AXIS_COLOR}
          strokeWidth={TREND_CHART_AXIS_STROKE_WIDTH}
          strokeOpacity={0.9}
        />
        <line
          x1={TREND_CHART_PADDING_LEFT}
          y1={chartBottom}
          x2={TREND_CHART_WIDTH - TREND_CHART_PADDING_RIGHT}
          y2={chartBottom}
          stroke={TREND_CHART_AXIS_COLOR}
          strokeWidth={TREND_CHART_AXIS_STROKE_WIDTH}
          strokeOpacity={0.9}
        />
        <line
          x1={TREND_CHART_PADDING_LEFT}
          y1={chartBottom}
          x2={TREND_CHART_PADDING_LEFT}
          y2={chartBottom + TREND_CHART_AXIS_TICK_LENGTH}
          stroke={TREND_CHART_AXIS_COLOR}
          strokeWidth={TREND_CHART_AXIS_STROKE_WIDTH}
          strokeOpacity={0.9}
        />
        <line
          x1={TREND_CHART_WIDTH - TREND_CHART_PADDING_RIGHT}
          y1={chartBottom}
          x2={TREND_CHART_WIDTH - TREND_CHART_PADDING_RIGHT}
          y2={chartBottom + TREND_CHART_AXIS_TICK_LENGTH}
          stroke={TREND_CHART_AXIS_COLOR}
          strokeWidth={TREND_CHART_AXIS_STROKE_WIDTH}
          strokeOpacity={0.9}
        />
        <text
          x={TREND_CHART_PADDING_LEFT}
          y={TREND_CHART_HEIGHT - 3}
          textAnchor="start"
          fontSize={TREND_CHART_X_LABEL_FONT_SIZE}
          fill={TREND_CHART_MUTED_LABEL_COLOR}
          fillOpacity={0.95}
        >
          {t('common:common.newest')}
        </text>
        <text
          x={TREND_CHART_WIDTH - TREND_CHART_PADDING_RIGHT}
          y={TREND_CHART_HEIGHT - 3}
          textAnchor="end"
          fontSize={TREND_CHART_X_LABEL_FONT_SIZE}
          fill={TREND_CHART_MUTED_LABEL_COLOR}
          fillOpacity={0.95}
        >
          {t('common:common.oldest')}
        </text>

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={TREND_CHART_LINE_STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {pathPoints.map((point, index) => {
          const value = points[index]
          const dotColor = value >= 1 ? '#34d399' : value > 0 ? '#fbbf24' : '#f87171'
          return (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={index === 0 ? TREND_CHART_LATEST_POINT_RADIUS : TREND_CHART_POINT_RADIUS}
              fill={dotColor}
              stroke={TREND_CHART_POINT_STROKE_COLOR}
              strokeWidth={TREND_CHART_POINT_STROKE_WIDTH}
            />
          )
        })}
      </svg>
    </div>
  )
}

export function generateNightlySummary(guides: NightlyGuideStatus[]): [string, string] {
  if (guides.length === 0) return ['No nightly E2E data available yet.', '']

  // Group by platform
  const byPlatform = new Map<string, NightlyGuideStatus[]>()
  for (const g of guides) {
    const list = byPlatform.get(g.platform) || []
    list.push(g)
    byPlatform.set(g.platform, list)
  }

  const allWithRuns = guides.filter(g => g.runs.length > 0)
  const totalPassing = allWithRuns.filter(g => g.latestConclusion === 'success').length
  const totalWithRuns = allWithRuns.length
  const overallPct = totalWithRuns > 0
    ? Math.round((allWithRuns.reduce((s, g) => s + g.passRate, 0)) / totalWithRuns)
    : 0

  // Compute duration stats across all completed runs
  const allCompletedRuns = allWithRuns.flatMap(g => g.runs.filter(r => r.status === 'completed'))
  const avgDuration = computeAvgDurationMin(allCompletedRuns)

  // Collect unique models and GPU types across active guides
  const modelSet = new Set<string>()
  const gpuTypeSet = new Set<string>()
  let totalGpus = 0
  for (const g of allWithRuns) {
    const meta = getGuideMeta(g)
    if (meta.model !== 'Unknown' && meta.model !== 'Simulated') modelSet.add(meta.model)
    if (meta.gpuType !== 'Unknown' && meta.gpuType !== 'CPU' && meta.gpuType !== 'TBD') gpuTypeSet.add(meta.gpuType)
    totalGpus += meta.gpuCount
  }

  // Paragraph 1: Overall health + infrastructure context
  const para1Parts: string[] = []

  if (totalWithRuns === 0) {
    para1Parts.push('No workflow runs have been recorded yet across any platform.')
  } else {
    para1Parts.push(`Across ${totalWithRuns} active guides, ${totalPassing} are currently passing with an average pass rate of ${overallPct}%.`)

    // Duration + infrastructure sentence
    const infraParts: string[] = []
    if (avgDuration !== null) infraParts.push(`Tests average ${formatDuration(avgDuration)} to complete`)
    if (modelSet.size > 0) infraParts.push(`exercising ${modelSet.size} model${modelSet.size > 1 ? 's' : ''} (${[...modelSet].slice(0, 3).join(', ')}${modelSet.size > 3 ? '…' : ''})`)
    if (gpuTypeSet.size > 0) infraParts.push(`across ${totalGpus} ${[...gpuTypeSet].join('/')} GPUs`)
    if (infraParts.length > 0) para1Parts.push(infraParts.join(' ') + '.')

    for (const [platform, pGuides] of byPlatform) {
      const withRuns = pGuides.filter(g => g.runs.length > 0)
      if (withRuns.length === 0) {
        para1Parts.push(`${platform} has no workflows created yet.`)
        continue
      }
      const passing = withRuns.filter(g => g.latestConclusion === 'success').length
      const total = withRuns.length
      const avgRate = Math.round(withRuns.reduce((s, g) => s + g.passRate, 0) / total)
      const trendingUp = withRuns.filter(g => g.trend === 'up').length
      const running = withRuns.filter(g => g.runs.some(r => r.status === 'in_progress')).length

      if (passing === 0 && total > 1) {
        const suffix = running > 0 ? `, though ${running} ${running === 1 ? 'is' : 'are'} currently running` : ''
        para1Parts.push(`${platform} is at 0% across all ${total} guides${suffix} — likely an infrastructure issue.`)
      } else if (passing === total) {
        para1Parts.push(`${platform} is fully green with all ${total} guides passing (avg ${avgRate}%).`)
      } else {
        const trendNote = trendingUp > 0 ? ` with ${trendingUp} trending upward` : ''
        para1Parts.push(`${platform} has ${passing}/${total} guides passing (avg ${avgRate}%)${trendNote}.`)
      }
    }
  }

  // Count GPU failures across all runs
  const gpuFailCount = allWithRuns.flatMap(g => g.runs)
    .filter(r => r.failureReason === 'gpu_unavailable').length
  if (gpuFailCount > 0) {
    para1Parts.push(`${gpuFailCount} recent failure${gpuFailCount > 1 ? 's were' : ' was'} due to GPU unavailability (shown in amber).`)
  }

  // Paragraph 2: Notable patterns + per-guide duration outliers
  const para2Parts: string[] = []

  if (allWithRuns.length > 0) {
    const best = allWithRuns.reduce((a, b) => a.passRate > b.passRate ? a : b)
    const worst = allWithRuns.filter(g => g.runs.length >= MIN_RUNS_FOR_RATE).reduce(
      (a, b) => a.passRate < b.passRate ? a : b, allWithRuns[0]
    )

    if (best.passRate > 0) {
      const meta = getGuideMeta(best)
      const dur = computeAvgDurationMin(best.runs.filter(r => r.status === 'completed'))
      const durStr = dur !== null ? ` (avg ${formatDuration(dur)}, ${meta.model} on ${meta.gpuCount}× ${meta.gpuType})` : ''
      para2Parts.push(`${best.acronym} (${best.platform}) leads at ${best.passRate}%${durStr}.`)
    }
    if (worst.passRate === 0 && worst.runs.length >= MIN_RUNS_FOR_RATE) {
      para2Parts.push(`${worst.acronym} (${worst.platform}) has never passed in ${worst.runs.length} runs and needs investigation.`)
    }

    // Find slowest guide
    if (avgDuration !== null) {
      let slowest: { g: NightlyGuideStatus; dur: number } | null = null
      for (const g of allWithRuns) {
        const d = computeAvgDurationMin(g.runs.filter(r => r.status === 'completed'))
        if (d !== null && (slowest === null || d > slowest.dur)) slowest = { g, dur: d }
      }
      if (slowest && slowest.dur > avgDuration * 1.5) {
        const meta = getGuideMeta(slowest.g)
        para2Parts.push(`${slowest.g.acronym} (${slowest.g.platform}) is the slowest at ${formatDuration(slowest.dur)} avg, running ${meta.model} on ${meta.gpuCount}× ${meta.gpuType}.`)
      }
    }
  }

  // Streaks
  for (const g of allWithRuns) {
    let streak = 0
    let sType: 'success' | 'failure' | null = null
    for (const r of g.runs) {
      if (r.status !== 'completed') continue
      if (!sType) sType = r.conclusion === 'success' ? 'success' : 'failure'
      if ((sType === 'success' && r.conclusion === 'success') ||
          (sType === 'failure' && r.conclusion !== 'success')) {
        streak++
      } else break
    }
    if (sType === 'success' && streak >= 3) {
      para2Parts.push(`${g.acronym} (${g.platform}) has ${streak} consecutive ${streak === 1 ? 'pass' : 'passes'}.`)
    } else if (sType === 'failure' && streak >= 3 && g.runs.some(r => r.conclusion === 'success')) {
      para2Parts.push(`${g.acronym} (${g.platform}) has regressed with ${streak} consecutive ${streak === 1 ? 'failure' : 'failures'}.`)
    }
  }

  // Currently running
  const runningGuides = allWithRuns.filter(g => g.runs.some(r => r.status === 'in_progress'))
  if (runningGuides.length > 0) {
    const names = runningGuides.map(g => {
      const meta = getGuideMeta(g)
      return `${g.acronym} (${g.platform}, ${meta.model})`
    }).join(', ')
    para2Parts.push(`Currently running: ${names}.`)
  }

  const p1 = para1Parts.join(' ')
  const p2 = para2Parts.length > 0 ? para2Parts.join(' ') : 'No notable patterns detected in recent runs.'

  return [p1, p2]
}

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
        <p className="text-[11px] text-muted-foreground leading-relaxed">{para1}</p>
        {para2 && <p className="text-[11px] text-muted-foreground leading-relaxed">{para2}</p>}
      </div>
      <div className="mt-auto pt-3 border-t border-border/30">
        <p className="text-2xs text-muted-foreground text-center">{t('cards:llmd.hoverTestDetails')}</p>
      </div>
    </div>
  )
}

export function computeRunDurationMin(run: NightlyRun): number | null {
  if (run.status !== 'completed' || !run.createdAt || !run.updatedAt) return null
  return Math.round((new Date(run.updatedAt).getTime() - new Date(run.createdAt).getTime()) / 60_000)
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
              hoveredRun.status !== 'completed' ? 'bg-blue-400' : hoveredRun.conclusion === 'success' ? 'bg-green-400' : 'bg-red-400'
            }`} />
            <span className="text-2xs text-muted-foreground font-mono">
              Run #{hoveredRun.runNumber} &middot; {formatTimeAgo(hoveredRun.createdAt)}
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-y-2 text-[11px]">
          <span className="text-muted-foreground">{t('cards:llmd.model')}</span>
          <span className={`font-mono text-2xs truncate max-w-[140px] ${hoveredRun ? 'text-foreground' : 'text-foreground'}`} title={displayModel}>{displayModel}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-y-2 text-[11px]">
          <span className="text-muted-foreground">{t('cards:llmd.gpu')}</span>
          <span className={`font-mono text-2xs ${hoveredRun ? 'text-foreground' : 'text-foreground'}`}>
            {displayGpuCount > 0 ? `${displayGpuCount}× ${displayGpuType}` : displayGpuType}
          </span>
        </div>
        {hoveredRun && runDur !== null ? (
          <div className="flex flex-wrap items-center justify-between gap-y-2 text-[11px]">
            <span className="text-muted-foreground">{t('cards:llmd.duration')}</span>
            <span className="text-foreground font-mono">{formatDuration(runDur)}</span>
          </div>
        ) : avgDur !== null ? (
          <div className="flex flex-wrap items-center justify-between gap-y-2 text-[11px]">
            <span className="text-muted-foreground">{t('cards:llmd.avgDuration')}</span>
            <span className="text-foreground font-mono">{formatDuration(avgDur)}</span>
          </div>
        ) : null}
        <div className="h-px bg-border/30 my-0.5" />
        {lastSuccess && (
          <div className="flex flex-wrap items-center justify-between gap-y-2 text-[11px]">
            <span className="text-muted-foreground">{t('cards:llmd.lastPass')}</span>
            <span className="text-green-400 font-mono">{formatTimeAgo(lastSuccess.updatedAt)}</span>
          </div>
        )}
        {lastFailure && (
          <div className="flex flex-wrap items-center justify-between gap-y-2 text-[11px]">
            <span className="text-muted-foreground">{t('cards:llmd.lastFail')}</span>
            <span className="text-red-400 font-mono">{formatTimeAgo(lastFailure.updatedAt)}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-y-2 text-[11px]">
          <span className="text-muted-foreground">{t('cards:llmd.totalRuns')}</span>
          <span className="text-foreground font-mono">{guide.runs.length}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-y-2 text-[11px]">
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
