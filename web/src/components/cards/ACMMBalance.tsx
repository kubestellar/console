/**
 * ACMM Balance Card
 *
 * Weekly AI-vs-human contribution trend for the selected repo, with a
 * balance-target slider that lets the user set their desired AI share
 * and see drift bands relative to that target.
 */

import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useCardLoadingState } from './CardDataContext'
import { CardSkeleton } from '../../lib/cards/CardComponents'
import { useACMM } from '../acmm/ACMMProvider'

const DEFAULT_TARGET_PCT = 80
const DRIFT_BAND_PCT = 10

/**
 * Recommended AI-share targets per ACMM level.
 *
 * L1 Assisted — human is Executor, AI is a tool → low AI share
 * L2 Instructed — human is Rule-writer, drafting instruction files → rises
 * L3 Measured — human is Analyst, feedback loops form → crosses the midpoint
 * L4 Adaptive — human is Governor, system handles routine → dominant AI share
 * L5 Self-Sustaining — human is Strategist, holds ~15–20% for judgment → plateau
 *
 * These anchor points come from the paper's framing that higher AI share is
 * NOT automatically better; each level has a natural resting point.
 */
const LEVEL_TARGETS: { level: number; pct: number; label: string }[] = [
  { level: 1, pct: 25, label: 'L1' },
  { level: 2, pct: 45, label: 'L2' },
  { level: 3, pct: 60, label: 'L3' },
  { level: 4, pct: 75, label: 'L4' },
  { level: 5, pct: 85, label: 'L5' },
]

function recommendedTargetForLevel(level: number): number {
  const match = LEVEL_TARGETS.find((l) => l.level === level)
  return match?.pct ?? DEFAULT_TARGET_PCT
}

function targetKey(repo: string) {
  return `kubestellar-acmm-balance-target-${repo}`
}

function readTarget(repo: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(targetKey(repo))
    const n = raw ? parseInt(raw, 10) : NaN
    return Number.isFinite(n) ? n : fallback
  } catch {
    return fallback
  }
}

function writeTarget(repo: string, value: number) {
  try {
    localStorage.setItem(targetKey(repo), String(value))
  } catch {
    // ignore
  }
}

export function ACMMBalance() {
  const { repo, scan } = useACMM()
  const { data, level, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures, lastRefresh } = scan
  const recommendedTarget = recommendedTargetForLevel(level.level)

  const hasData = data.weeklyActivity.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  })

  const [target, setTarget] = useState<number>(() => readTarget(repo, recommendedTarget))
  useEffect(() => {
    setTarget(readTarget(repo, recommendedTarget))
  }, [repo, recommendedTarget])

  const weekly = useMemo(() => {
    return data.weeklyActivity.map((w) => {
      const totalPrs = w.aiPrs + w.humanPrs
      const aiShare = totalPrs > 0 ? (w.aiPrs / totalPrs) * 100 : 0
      return { ...w, totalPrs, aiShare }
    })
  }, [data.weeklyActivity])

  const currentWeek = weekly[weekly.length - 1]
  const fourWeeksAgo = weekly[weekly.length - 5]
  const trend =
    currentWeek && fourWeeksAgo
      ? currentWeek.aiShare - fourWeeksAgo.aiShare
      : 0
  const totalMerged = weekly.reduce((sum, w) => sum + w.totalPrs, 0)

  if (showSkeleton) {
    return <CardSkeleton type="chart" />
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm">
        No contribution data yet
      </div>
    )
  }

  const maxTotal = Math.max(1, ...weekly.map((w) => w.totalPrs))
  const currentShare = currentWeek?.aiShare ?? 0
  const drift = currentShare - target
  const driftColor =
    Math.abs(drift) <= DRIFT_BAND_PCT
      ? 'text-green-400'
      : Math.abs(drift) <= DRIFT_BAND_PCT * 2
        ? 'text-yellow-400'
        : 'text-red-400'

  const TrendIcon = trend > 1 ? TrendingUp : trend < -1 ? TrendingDown : Minus

  return (
    <div className="h-full flex flex-col p-2 gap-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded-lg bg-muted/20">
          <div className="text-[10px] text-muted-foreground uppercase">This week AI</div>
          <div className="text-lg font-bold">{currentShare.toFixed(0)}%</div>
        </div>
        <div className="p-2 rounded-lg bg-muted/20">
          <div className="text-[10px] text-muted-foreground uppercase">4-wk trend</div>
          <div className="text-lg font-bold flex items-center justify-center gap-1">
            <TrendIcon className="w-4 h-4" />
            {trend > 0 ? '+' : ''}
            {trend.toFixed(0)}
          </div>
        </div>
        <div className="p-2 rounded-lg bg-muted/20">
          <div className="text-[10px] text-muted-foreground uppercase">Merged (16w)</div>
          <div className="text-lg font-bold">{totalMerged}</div>
        </div>
      </div>

      <div className="flex-1 flex items-end gap-0.5 min-h-[80px]">
        {weekly.map((w) => {
          const aiH = (w.aiPrs / maxTotal) * 100
          const humanH = (w.humanPrs / maxTotal) * 100
          return (
            <div
              key={w.week}
              className="flex-1 flex flex-col justify-end"
              title={`${w.week}: ${w.aiPrs} AI + ${w.humanPrs} human`}
            >
              <div className="bg-primary/70" style={{ height: `${aiH}%` }} />
              <div className="bg-cyan-500/50" style={{ height: `${humanH}%` }} />
            </div>
          )
        })}
      </div>

      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">Target AI share</span>
          <span className="flex items-center gap-2">
            <span className="font-mono">{target}%</span>
            <span className={`font-mono ${driftColor}`}>
              {drift >= 0 ? '+' : ''}
              {drift.toFixed(0)}
            </span>
            <button
              type="button"
              onClick={() => {
                setTarget(recommendedTarget)
                writeTarget(repo, recommendedTarget)
              }}
              className="px-1.5 py-0.5 text-[9px] rounded-full bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
              title={`Snap to ACMM L${level.level} recommended target`}
            >
              Use L{level.level} ({recommendedTarget}%)
            </button>
          </span>
        </div>
        <div className="relative">
          <input
            type="range"
            min={0}
            max={100}
            value={target}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              setTarget(v)
              writeTarget(repo, v)
            }}
            className="w-full accent-primary relative z-10"
            aria-label="Target AI contribution percentage" // ai-quality-ignore
          />
          <div className="absolute inset-x-0 top-[50%] h-0 pointer-events-none">
            {LEVEL_TARGETS.map((anchor) => (
              <div
                key={anchor.level}
                className="absolute flex flex-col items-center"
                style={{ left: `${anchor.pct}%`, transform: 'translateX(-50%)' }}
                title={`L${anchor.level} recommended: ${anchor.pct}% AI`}
              >
                <div
                  className={`w-0.5 h-3 -mt-1.5 ${
                    anchor.level === level.level ? 'bg-primary' : 'bg-muted-foreground/40'
                  }`}
                />
                <div
                  className={`text-[8px] font-mono mt-0.5 ${
                    anchor.level === level.level ? 'text-primary font-bold' : 'text-muted-foreground/60'
                  }`}
                >
                  {anchor.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ACMMBalance
