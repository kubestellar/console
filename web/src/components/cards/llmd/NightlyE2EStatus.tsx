/**
 * NightlyE2EStatus — Report card for llm-d nightly E2E workflow status
 *
 * Shows per-guide pass/fail history with colored run dots, trend indicators,
 * and aggregate statistics. Grouped by platform (OCP, GKE).
 * Fetches from GitHub Actions API; falls back to demo data without a token.
 */
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  TestTube2, ExternalLink, TrendingUp, TrendingDown, Minus,
  CheckCircle, XCircle, Loader2, AlertTriangle,
} from 'lucide-react'
import { useReportCardDataState } from '../CardDataContext'
import { useNightlyE2EData } from '../../../hooks/useNightlyE2EData'
import type { NightlyGuideStatus, NightlyRun } from '../../../lib/llmd/nightlyE2EDemoData'

const PLATFORM_ORDER = ['OCP', 'GKE'] as const

const PLATFORM_COLORS: Record<string, string> = {
  OCP: '#ef4444',  // red
  GKE: '#3b82f6',  // blue
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

function RunDot({ run }: { run: NightlyRun }) {
  const isRunning = run.status === 'in_progress'
  const color = isRunning
    ? 'bg-blue-400'
    : run.conclusion === 'success'
      ? 'bg-emerald-400'
      : run.conclusion === 'failure'
        ? 'bg-red-400'
        : run.conclusion === 'cancelled'
          ? 'bg-slate-500'
          : 'bg-yellow-400'

  const title = isRunning
    ? `Running (started ${formatTimeAgo(run.createdAt)})`
    : `${run.conclusion} — ${formatTimeAgo(run.createdAt)}`

  return (
    <a
      href={run.htmlUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className="group relative"
      onClick={e => e.stopPropagation()}
    >
      <div className={`w-3 h-3 rounded-full ${color} ${isRunning ? 'animate-pulse' : ''} group-hover:ring-2 group-hover:ring-white/30 transition-all`} />
    </a>
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

function GuideRow({ guide, delay }: { guide: NightlyGuideStatus; delay: number }) {
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
      className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-slate-800/40 transition-colors group"
    >
      <StatusIcon size={14} className={`shrink-0 ${iconColor}`} />
      <span className="text-xs text-slate-200 w-40 truncate shrink-0" title={guide.guide}>
        {guide.guide}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        {guide.runs.map((run) => (
          <RunDot key={run.id} run={run} />
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

export function NightlyE2EStatus() {
  const { guides, isDemoFallback, isFailed, consecutiveFailures, isLoading } = useNightlyE2EData()

  useReportCardDataState({
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
    isLoading,
    hasData: guides.length > 0,
  })

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
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">Pass Rate</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-center"
        >
          <div className="text-xl font-bold text-white">{stats.total}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">Guides</div>
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
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">Failing</div>
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
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">Last Run</div>
        </motion.div>
      </div>

      {/* Guide rows grouped by platform */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
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
                {platformGuides.filter(g => g.latestConclusion === 'success').length}/{platformGuides.length} passing
              </span>
            </div>
            {platformGuides.map((guide, gi) => (
              <GuideRow
                key={`${guide.guide}-${guide.platform}`}
                guide={guide}
                delay={0.25 + gi * 0.04}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-[10px] text-slate-500 pt-1 border-t border-slate-700/30">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>pass</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <span>fail</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-400" />
          <span>running</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-slate-500" />
          <span>cancelled</span>
        </div>
        <span className="text-slate-600">|</span>
        <span>newest run on left</span>
      </div>
    </div>
  )
}

export default NightlyE2EStatus
