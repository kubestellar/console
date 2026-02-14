/**
 * NightlyE2EStatus — Report card for llm-d nightly E2E workflow status
 *
 * Shows per-guide pass/fail history with colored run dots, trend indicators,
 * and aggregate statistics. Grouped by platform (OCP, GKE).
 * Fetches from GitHub Actions API; falls back to demo data without a token.
 */
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  TestTube2, ExternalLink, TrendingUp, TrendingDown, Minus,
  CheckCircle, XCircle, Loader2, AlertTriangle,
} from 'lucide-react'
import { useReportCardDataState } from '../CardDataContext'
import { useNightlyE2EData } from '../../../hooks/useNightlyE2EData'
import type { NightlyGuideStatus, NightlyRun } from '../../../lib/llmd/nightlyE2EDemoData'

const PLATFORM_ORDER = ['OCP', 'GKE', 'CKS'] as const

const PLATFORM_COLORS: Record<string, string> = {
  OCP: '#ef4444',  // red
  GKE: '#3b82f6',  // blue
  CKS: '#a855f7',  // purple
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

function GuideRow({ guide, delay, isSelected, onMouseEnter }: {
  guide: NightlyGuideStatus
  delay: number
  isSelected: boolean
  onMouseEnter: () => void
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

function GuideDetailPanel({ guide }: { guide: NightlyGuideStatus }) {
  const completedRuns = guide.runs.filter(r => r.status === 'completed')
  const passed = completedRuns.filter(r => r.conclusion === 'success').length
  const failed = completedRuns.filter(r => r.conclusion === 'failure').length
  const cancelled = completedRuns.filter(r => r.conclusion === 'cancelled').length
  const running = guide.runs.filter(r => r.status === 'in_progress').length

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
      <div className="mb-3">
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

      {/* Pass rate big number */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 mb-3 text-center">
        <div className={`text-2xl font-bold ${
          guide.passRate >= 90 ? 'text-emerald-400' : guide.passRate >= 70 ? 'text-yellow-400' : guide.passRate > 0 ? 'text-red-400' : 'text-slate-500'
        }`}>
          {guide.passRate}%
        </div>
        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Pass Rate</div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatBox label="Passed" value={String(passed)} color="text-emerald-400" />
        <StatBox label="Failed" value={String(failed)} color="text-red-400" />
        <StatBox label="Cancelled" value={String(cancelled)} color="text-slate-400" />
        <StatBox label="Running" value={String(running)} color="text-blue-400" />
      </div>

      {/* Streak */}
      {streakType && streak > 0 && (
        <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border mb-3 ${
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
            {streak} consecutive {streakType === 'success' ? 'passes' : 'failures'}
          </span>
        </div>
      )}

      {/* Timestamps */}
      <div className="space-y-1.5 flex-1">
        {lastSuccess && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Last pass</span>
            <span className="text-emerald-400 font-mono">{formatTimeAgo(lastSuccess.updatedAt)}</span>
          </div>
        )}
        {lastFailure && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Last fail</span>
            <span className="text-red-400 font-mono">{formatTimeAgo(lastFailure.updatedAt)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500">Total runs</span>
          <span className="text-slate-300 font-mono">{guide.runs.length}</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500">Trend</span>
          <TrendIndicator trend={guide.trend} passRate={guide.passRate} />
        </div>
      </div>

      {/* Run history visual */}
      <div className="mt-auto pt-2 border-t border-slate-700/30">
        <div className="text-[10px] text-slate-500 mb-1.5">Run history (newest first)</div>
        <div className="flex items-center gap-1 flex-wrap">
          {guide.runs.map((run) => (
            <RunDot key={run.id} run={run} />
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
  const { guides, isDemoFallback, isFailed, consecutiveFailures, isLoading, isRefreshing } = useNightlyE2EData()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  useReportCardDataState({
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
    isLoading,
    isRefreshing,
    hasData: guides.length > 0,
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

      {/* Two-column layout: guide rows (left) + detail panel (right) */}
      <div className="flex flex-1 min-h-0 gap-3">
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
              {platformGuides.map((guide, gi) => {
                const key = `${guide.guide}-${guide.platform}`
                return (
                  <GuideRow
                    key={key}
                    guide={guide}
                    delay={0.25 + gi * 0.04}
                    isSelected={selectedKey === key}
                    onMouseEnter={() => setSelectedKey(key)}
                  />
                )
              })}
            </div>
          ))}
        </div>

        {/* Detail panel (right side) */}
        <div className="w-52 shrink-0 bg-slate-800/30 border border-slate-700/40 rounded-xl p-3 overflow-y-auto">
          {selectedGuide ? (
            <GuideDetailPanel guide={selectedGuide} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2">
              <TestTube2 size={20} className="text-slate-600" />
              <p className="text-[11px] text-slate-500">Hover over a test to see detailed statistics</p>
            </div>
          )}
        </div>
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
