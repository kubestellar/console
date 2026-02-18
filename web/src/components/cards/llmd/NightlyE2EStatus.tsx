/**
 * NightlyE2EStatus — Report card for llm-d nightly E2E workflow status
 *
 * Shows per-guide pass/fail history with colored run dots, trend indicators,
 * and aggregate statistics. Grouped by platform (OCP, GKE).
 * Fetches from GitHub Actions API; falls back to demo data without a token.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  TestTube2, ExternalLink, TrendingUp, TrendingDown, Minus,
  CheckCircle, XCircle, Loader2, AlertTriangle, Sparkles,
} from 'lucide-react'
import { useCardLoadingState } from '../CardDataContext'
import { Skeleton } from '../../ui/Skeleton'
import { useNightlyE2EData } from '../../../hooks/useNightlyE2EData'
import { useAIMode } from '../../../hooks/useAIMode'
import type { NightlyGuideStatus, NightlyRun } from '../../../lib/llmd/nightlyE2EDemoData'
import { useTranslation } from 'react-i18next'

const PLATFORM_ORDER = ['OCP', 'GKE', 'CKS'] as const

const PLATFORM_COLORS: Record<string, string> = {
  OCP: '#ef4444',  // red
  GKE: '#3b82f6',  // blue
  CKS: '#a855f7',  // purple
}

/** Get metadata from the guide's API response (model, gpuType, gpuCount are now server-provided) */
function getGuideMeta(guide: NightlyGuideStatus) {
  return {
    model: guide.model || 'Unknown',
    gpuType: guide.gpuType || 'Unknown',
    gpuCount: guide.gpuCount || 0,
  }
}

function computeAvgDurationMin(runs: NightlyRun[]): number | null {
  const completed = runs.filter(r => r.status === 'completed' && r.createdAt && r.updatedAt)
  if (completed.length === 0) return null
  const totalMs = completed.reduce((sum, r) => {
    return sum + (new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime())
  }, 0)
  return Math.round(totalMs / completed.length / 60_000)
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatTimeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function RunDot({ run, isHighlighted, onMouseEnter, onMouseLeave }: {
  run: NightlyRun
  isHighlighted?: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  const [showPopup, setShowPopup] = useState(false)
  const isRunning = run.status !== 'completed'
  const isFailed = run.conclusion === 'failure'
  const isGPUFailure = isFailed && run.failureReason === 'gpu_unavailable'
  const color = isRunning
    ? 'bg-blue-400'
    : run.conclusion === 'success'
      ? 'bg-emerald-400'
      : isGPUFailure
        ? 'bg-amber-400'
        : isFailed
          ? 'bg-red-400'
          : run.conclusion === 'cancelled'
            ? 'bg-slate-500'
            : 'bg-yellow-400'

  const reasonLabel = isGPUFailure ? 'GPU unavailable' : ''
  const title = isRunning
    ? `Running (started ${formatTimeAgo(run.createdAt)})`
    : reasonLabel
      ? `${run.conclusion} (${reasonLabel}) — ${formatTimeAgo(run.createdAt)}`
      : `${run.conclusion} — ${formatTimeAgo(run.createdAt)}`

  const logsUrl = `${run.htmlUrl}#logs`

  return (
    <div
      className="group relative"
      onMouseEnter={() => { setShowPopup(true); onMouseEnter?.() }}
      onMouseLeave={() => { setShowPopup(false); onMouseLeave?.() }}
    >
      <a
        href={run.htmlUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={!isFailed ? title : undefined}
        onClick={e => e.stopPropagation()}
      >
        <div className={`w-3 h-3 rounded-full ${color} ${isRunning ? 'animate-pulse' : ''} ${
          isHighlighted ? 'ring-2 ring-white/50 scale-125' : 'group-hover:ring-2 group-hover:ring-white/30'
        } transition-all`} />
      </a>
      {isFailed && showPopup && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 pointer-events-auto">
          <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl px-2.5 py-1.5 whitespace-nowrap text-[10px]">
            <div className="text-slate-300 mb-1">
              Run #{run.runNumber} &middot; {isGPUFailure ? <span className="text-amber-400">GPU unavailable</span> : <span className="text-red-400">failed</span>} &middot; {formatTimeAgo(run.createdAt)}
            </div>
            <a href={logsUrl} target="_blank" rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-0.5"
              onClick={e => e.stopPropagation()}>
              View Logs <ExternalLink size={8} />
            </a>
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-600" />
          </div>
        </div>
      )}
    </div>
  )
}

function TrendIndicator({ trend, passRate }: { trend: 'up' | 'down' | 'steady'; passRate: number }) {
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const color = passRate === 100
    ? 'text-emerald-400'
    : passRate >= 70
      ? 'text-yellow-400'
      : 'text-red-400'

  return (
    <div className={`flex items-center gap-1 ${color}`}>
      <Icon size={12} />
      <span className="text-xs font-mono">{passRate}%</span>
    </div>
  )
}

function GuideRow({ guide, delay, isSelected, onMouseEnter, onRunHover }: {
  guide: NightlyGuideStatus
  delay: number
  isSelected: boolean
  onMouseEnter: () => void
  onRunHover: (run: NightlyRun | null) => void
}) {
  const workflowUrl = `https://github.com/${guide.repo}/actions/workflows/${guide.workflowFile}`
  const StatusIcon = guide.latestConclusion === 'success'
    ? CheckCircle
    : guide.latestConclusion === 'failure'
      ? XCircle
      : guide.latestConclusion === 'in_progress'
        ? Loader2
        : AlertTriangle

  const iconColor = guide.latestConclusion === 'success'
    ? 'text-emerald-400'
    : guide.latestConclusion === 'failure'
      ? 'text-red-400'
      : guide.latestConclusion === 'in_progress'
        ? 'text-blue-400 animate-spin'
        : 'text-slate-400'

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay }}
      className={`flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors group cursor-pointer ${
        isSelected ? 'bg-slate-700/50 ring-1 ring-slate-600/50' : 'hover:bg-slate-800/40'
      }`}
      onMouseEnter={onMouseEnter}
    >
      <StatusIcon size={14} className={`shrink-0 ${iconColor}`} />
      <span className="text-xs text-slate-200 w-48 truncate shrink-0" title={guide.guide}>
        <span className="font-mono font-semibold text-slate-400 mr-1.5">{guide.acronym}</span>
        {guide.guide}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        {guide.runs.map((run) => (
          <RunDot key={run.id} run={run}
            onMouseEnter={() => { onMouseEnter(); onRunHover(run) }}
            onMouseLeave={() => onRunHover(null)}
          />
        ))}
        {/* Pad with empty dots if fewer than 7 runs */}
        {Array.from({ length: Math.max(0, 7 - guide.runs.length) }).map((_, i) => (
          <div key={`empty-${i}`} className="w-3 h-3 rounded-full bg-slate-700/50" />
        ))}
      </div>
      <TrendIndicator trend={guide.trend} passRate={guide.passRate} />
      <a
        href={workflowUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-700"
        onClick={e => e.stopPropagation()}
      >
        <ExternalLink size={12} className="text-slate-400" />
      </a>
    </motion.div>
  )
}

function TrendSparkline({ runs }: { runs: NightlyRun[] }) {
  const { t } = useTranslation(['cards'])
  // Build data points: 1 = success, 0 = failure/cancelled, 0.5 = in_progress
  // Newest on left, oldest on right (matches run history dots)
  const points = runs.map(r => {
    if (r.status === 'in_progress') return 0.5
    return r.conclusion === 'success' ? 1 : 0
  })

  if (points.length < 2) return null

  const width = 200
  const height = 52
  const padX = 12
  const padY = 8
  const chartW = width - padX * 2
  const chartH = height - padY * 2

  // Build SVG path + area
  const xStep = chartW / (points.length - 1)
  const pathPoints = points.map((val, i) => ({
    x: padX + i * xStep,
    y: padY + (1 - val) * chartH,
  }))

  // Smooth curve using cardinal spline approximation
  let linePath = `M ${pathPoints[0].x} ${pathPoints[0].y}`
  for (let i = 1; i < pathPoints.length; i++) {
    const prev = pathPoints[i - 1]
    const curr = pathPoints[i]
    const cpx = (prev.x + curr.x) / 2
    linePath += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`
  }

  // Area fill path (same curve, closed at bottom)
  const areaPath = `${linePath} L ${pathPoints[pathPoints.length - 1].x} ${height - padY + 4} L ${pathPoints[0].x} ${height - padY + 4} Z`

  // Gradient color based on latest (newest) point — now at index 0
  const latest = points[0]
  const gradientId = `sparkGrad-${latest}`
  const strokeColor = latest >= 1 ? '#34d399' : latest > 0 ? '#fbbf24' : '#f87171'
  const fillOpacity = 0.15

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-2">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{t('cards:llmd.passFailTrend')}</div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity={fillOpacity} />
            <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        <line x1={padX} y1={padY} x2={width - padX} y2={padY} stroke="#334155" strokeWidth="0.5" strokeDasharray="3 3" />
        <line x1={padX} y1={padY + chartH / 2} x2={width - padX} y2={padY + chartH / 2} stroke="#334155" strokeWidth="0.5" strokeDasharray="3 3" />
        <line x1={padX} y1={padY + chartH} x2={width - padX} y2={padY + chartH} stroke="#334155" strokeWidth="0.5" strokeDasharray="3 3" />
        {/* Y-axis labels */}
        <text x={padX - 2} y={padY + 3} textAnchor="end" fontSize="7" fill="#64748b">{t('cards:llmd.pass')}</text>
        <text x={padX - 2} y={padY + chartH + 3} textAnchor="end" fontSize="7" fill="#64748b">{t('cards:llmd.fail')}</text>
        {/* X-axis direction labels */}
        <text x={padX} y={height - 2} textAnchor="start" fontSize="6" fill="#475569">new</text>
        <text x={width - padX} y={height - 2} textAnchor="end" fontSize="6" fill="#475569">old</text>
        {/* Area fill */}
        <path d={areaPath} fill={`url(#${gradientId})`} />
        {/* Line */}
        <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Data points */}
        {pathPoints.map((pt, i) => {
          const val = points[i]
          const dotColor = val >= 1 ? '#34d399' : val > 0 ? '#fbbf24' : '#f87171'
          return (
            <circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r={i === 0 ? 3.5 : 2.5}
              fill={dotColor}
              stroke="#0f172a"
              strokeWidth="1.5"
            />
          )
        })}
      </svg>
    </div>
  )
}

function generateNightlySummary(guides: NightlyGuideStatus[]): [string, string] {
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
    const worst = allWithRuns.filter(g => g.runs.length >= 3).reduce(
      (a, b) => a.passRate < b.passRate ? a : b, allWithRuns[0]
    )

    if (best.passRate > 0) {
      const meta = getGuideMeta(best)
      const dur = computeAvgDurationMin(best.runs.filter(r => r.status === 'completed'))
      const durStr = dur !== null ? ` (avg ${formatDuration(dur)}, ${meta.model} on ${meta.gpuCount}× ${meta.gpuType})` : ''
      para2Parts.push(`${best.acronym} (${best.platform}) leads at ${best.passRate}%${durStr}.`)
    }
    if (worst.passRate === 0 && worst.runs.length >= 3) {
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
      para2Parts.push(`${g.acronym} (${g.platform}) has ${streak} consecutive passes.`)
    } else if (sType === 'failure' && streak >= 3 && g.runs.some(r => r.conclusion === 'success')) {
      para2Parts.push(`${g.acronym} (${g.platform}) has regressed with ${streak} consecutive failures.`)
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

function NightlySummaryPanel({ guides }: { guides: NightlyGuideStatus[] }) {
  const { t } = useTranslation(['cards'])
  const [para1, para2] = useMemo(() => generateNightlySummary(guides), [guides])

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-purple-400" />
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{t('cards:llmd.aiSummary')}</span>
      </div>
      <div className="flex-1 space-y-3">
        <p className="text-[11px] text-slate-400 leading-relaxed">{para1}</p>
        {para2 && <p className="text-[11px] text-slate-400 leading-relaxed">{para2}</p>}
      </div>
      <div className="mt-auto pt-3 border-t border-slate-700/30">
        <p className="text-[10px] text-slate-600 text-center">{t('cards:llmd.hoverTestDetails')}</p>
      </div>
    </div>
  )
}

function computeRunDurationMin(run: NightlyRun): number | null {
  if (run.status !== 'completed' || !run.createdAt || !run.updatedAt) return null
  return Math.round((new Date(run.updatedAt).getTime() - new Date(run.createdAt).getTime()) / 60_000)
}

function GuideDetailPanel({ guide, hoveredRun, onRunHover }: {
  guide: NightlyGuideStatus
  hoveredRun: NightlyRun | null
  onRunHover: (run: NightlyRun | null) => void
}) {
  const { t } = useTranslation(['cards', 'common'])
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
          <span className="text-sm font-semibold text-slate-200 truncate">{guide.guide}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span style={{ color: PLATFORM_COLORS[guide.platform] }}>{guide.platform}</span>
          <span>&middot;</span>
          <a href={workflowUrl} target="_blank" rel="noopener noreferrer"
            className="hover:text-slate-300 transition-colors flex items-center gap-0.5">
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
        <div className="col-span-1 bg-slate-800/60 border border-slate-700/50 rounded-lg p-2 text-center">
          <div className={`text-lg font-bold ${
            guide.passRate >= 90 ? 'text-emerald-400' : guide.passRate >= 70 ? 'text-yellow-400' : guide.passRate > 0 ? 'text-red-400' : 'text-slate-500'
          }`}>
            {guide.passRate}%
          </div>
          <div className="text-[8px] text-slate-500 uppercase tracking-wider">{t('common:common.rate')}</div>
        </div>
        <StatBox label={t('cards:llmd.pass')} value={String(passed)} color="text-emerald-400" />
        <StatBox label={t('cards:llmd.fail')} value={String(failed)} color="text-red-400" />
        {gpuFails > 0 && <StatBox label="GPU" value={String(gpuFails)} color="text-amber-400" />}
        <StatBox label={t('cards:llmd.skip')} value={String(cancelled)} color="text-slate-400" />
        <StatBox label={t('cards:llmd.run')} value={String(running)} color="text-blue-400" />
      </div>

      {/* Streak */}
      {streakType && streak > 0 && (
        <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border mb-2 ${
          streakType === 'success'
            ? 'bg-emerald-950/30 border-emerald-800/40'
            : 'bg-red-950/30 border-red-800/40'
        }`}>
          {streakType === 'success' ? (
            <TrendingUp size={13} className="text-emerald-400" />
          ) : (
            <TrendingDown size={13} className="text-red-400" />
          )}
          <span className="text-xs text-slate-300">
            {streak} {streakType === 'success' ? t('cards:llmd.consecutivePasses') : t('cards:llmd.consecutiveFailures')}
          </span>
        </div>
      )}

      {/* Infrastructure + timestamps */}
      <div className="space-y-1 flex-1">
        {hoveredRun && (
          <div className="flex items-center gap-1.5 mb-1">
            <div className={`w-1.5 h-1.5 rounded-full ${
              hoveredRun.status !== 'completed' ? 'bg-blue-400' : hoveredRun.conclusion === 'success' ? 'bg-emerald-400' : 'bg-red-400'
            }`} />
            <span className="text-[10px] text-slate-400 font-mono">
              Run #{hoveredRun.runNumber} &middot; {formatTimeAgo(hoveredRun.createdAt)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500">{t('cards:llmd.model')}</span>
          <span className={`font-mono text-[10px] truncate max-w-[140px] ${hoveredRun ? 'text-slate-200' : 'text-slate-300'}`} title={displayModel}>{displayModel}</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500">{t('cards:llmd.gpu')}</span>
          <span className={`font-mono text-[10px] ${hoveredRun ? 'text-slate-200' : 'text-slate-300'}`}>
            {displayGpuCount > 0 ? `${displayGpuCount}× ${displayGpuType}` : displayGpuType}
          </span>
        </div>
        {hoveredRun && runDur !== null ? (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">{t('cards:llmd.duration')}</span>
            <span className="text-slate-200 font-mono">{formatDuration(runDur)}</span>
          </div>
        ) : avgDur !== null ? (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">{t('cards:llmd.avgDuration')}</span>
            <span className="text-slate-300 font-mono">{formatDuration(avgDur)}</span>
          </div>
        ) : null}
        <div className="h-px bg-slate-700/30 my-0.5" />
        {lastSuccess && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">{t('cards:llmd.lastPass')}</span>
            <span className="text-emerald-400 font-mono">{formatTimeAgo(lastSuccess.updatedAt)}</span>
          </div>
        )}
        {lastFailure && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">{t('cards:llmd.lastFail')}</span>
            <span className="text-red-400 font-mono">{formatTimeAgo(lastFailure.updatedAt)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500">{t('cards:llmd.totalRuns')}</span>
          <span className="text-slate-300 font-mono">{guide.runs.length}</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500">{t('cards:llmd.trend')}</span>
          <TrendIndicator trend={guide.trend} passRate={guide.passRate} />
        </div>
      </div>

      {/* Run history dots — hover to see per-run details above */}
      <div className="mt-auto pt-2 border-t border-slate-700/30">
        <div className="text-[10px] text-slate-500 mb-1.5">
          {hoveredRun ? t('cards:llmd.runHistoryNewest') : `${t('cards:llmd.runHistoryNewest')} — ${t('cards:llmd.hoverDotForDetails')}`}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {guide.runs.map((run) => (
            <RunDot
              key={run.id}
              run={run}
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

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-2 text-center">
      <div className={`text-base font-bold ${color}`}>{value}</div>
      <div className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</div>
    </div>
  )
}

export function NightlyE2EStatus() {
  const { t } = useTranslation(['cards', 'common'])
  const { guides, isDemoFallback, isFailed, consecutiveFailures, isLoading } = useNightlyE2EData()
  const { shouldSummarize } = useAIMode()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [hoveredRun, setHoveredRun] = useState<NightlyRun | null>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleRunHover = useCallback((run: NightlyRun | null) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    if (run) {
      setHoveredRun(run)
    } else {
      // Delay clearing so moving between adjacent dots doesn't flash to null
      hoverTimeoutRef.current = setTimeout(() => setHoveredRun(null), 50)
    }
  }, [])

  const { showSkeleton } = useCardLoadingState({
    isLoading,
    hasAnyData: guides.length > 0,
    isFailed,
    consecutiveFailures,
    isDemoData: isDemoFallback,
  })

  const selectedGuide = useMemo(() => {
    if (!selectedKey) return null
    return guides.find(g => `${g.guide}-${g.platform}` === selectedKey) ?? null
  }, [guides, selectedKey])

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
      lastRunTime: mostRecent ? new Date(mostRecent).toISOString() : null,
    }
  }, [guides])

  if (showSkeleton) {
    return (
      <div className="p-4 h-full flex flex-col gap-3 overflow-hidden">
        <div className="grid grid-cols-4 gap-3">
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
      <div className="grid grid-cols-4 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-center"
        >
          <div className={`text-xl font-bold ${stats.overallPassRate >= 90 ? 'text-emerald-400' : stats.overallPassRate >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
            {stats.overallPassRate}%
          </div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">{t('cards:llmd.passRate')}</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-center"
        >
          <div className="text-xl font-bold text-white">{stats.total}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">{t('cards:llmd.guides')}</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-center"
        >
          <div className={`text-xl font-bold ${stats.failing > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {stats.failing}
          </div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">{t('cards:llmd.failing')}</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-center"
        >
          <div className="text-xl font-bold text-slate-200">
            {lastRunTime ? formatTimeAgo(lastRunTime) : '—'}
          </div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">{t('cards:llmd.lastRun')}</div>
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
                <span className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: PLATFORM_COLORS[platform] }}>
                  {platform}
                </span>
                <div className="flex-1 h-px bg-slate-700/50" />
                <span className="text-[10px] text-slate-500">
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
        <div className="w-[420px] shrink-0 bg-slate-800/30 border border-slate-700/40 rounded-xl p-3 overflow-y-auto">
          {selectedGuide ? (
            <GuideDetailPanel guide={selectedGuide} hoveredRun={hoveredRun} onRunHover={handleRunHover} />
          ) : shouldSummarize ? (
            <NightlySummaryPanel guides={guides} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2">
              <TestTube2 size={20} className="text-slate-600" />
              <p className="text-[11px] text-slate-500">{t('cards:llmd.hoverTestDetails')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-[10px] text-slate-500 pt-1 border-t border-slate-700/30">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{t('cards:llmd.pass')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <span>{t('cards:llmd.fail')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <span>GPU</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-400" />
          <span>{t('common:common.running').toLowerCase()}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-slate-500" />
          <span>{t('cards:llmd.cancelled')}</span>
        </div>
        <span className="text-slate-600">|</span>
        <span>{t('cards:llmd.newestRunOnLeft')}</span>
      </div>
    </div>
  )
}

export default NightlyE2EStatus
