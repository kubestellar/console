/**
 * ACMM Level Gauge Card
 *
 * Shows the selected repo's current ACMM level (1-5) with a progress
 * ring, level name, role, characteristic, and detected-vs-required loop
 * count for the next level.
 */

import { BarChart3 } from 'lucide-react'
import { useCardLoadingState } from './CardDataContext'
import { CardSkeleton } from '../../lib/cards/CardComponents'
import { useACMM } from '../acmm/ACMMProvider'

const MAX_LEVEL = 5
const GAUGE_SIZE = 140
const GAUGE_STROKE = 12

function LevelRing({ level }: { level: number }) {
  const radius = (GAUGE_SIZE - GAUGE_STROKE) / 2
  const circumference = 2 * Math.PI * radius
  const pct = Math.min(level / MAX_LEVEL, 1)
  const offset = circumference - pct * circumference

  return (
    <svg width={GAUGE_SIZE} height={GAUGE_SIZE} className="-rotate-90">
      <circle
        cx={GAUGE_SIZE / 2}
        cy={GAUGE_SIZE / 2}
        r={radius}
        stroke="currentColor"
        strokeWidth={GAUGE_STROKE}
        fill="none"
        className="text-muted/30"
      />
      <circle
        cx={GAUGE_SIZE / 2}
        cy={GAUGE_SIZE / 2}
        r={radius}
        stroke="currentColor"
        strokeWidth={GAUGE_STROKE}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-primary transition-all duration-500"
      />
    </svg>
  )
}

export function ACMMLevel() {
  const { repo, scan } = useACMM()
  const { level, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures, lastRefresh } = scan

  const hasData = scan.data.detectedIds.length > 0
  const { showSkeleton } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  })

  if (showSkeleton) {
    return <CardSkeleton type="metric" />
  }

  const nextLevel = level.level < MAX_LEVEL ? level.level + 1 : null
  const nextRequired = nextLevel ? level.requiredByLevel[nextLevel] ?? 0 : 0
  const nextDetected = nextLevel ? level.detectedByLevel[nextLevel] ?? 0 : 0

  return (
    <div className="h-full flex flex-col p-2">
      <div className="text-xs text-muted-foreground font-mono mb-2 truncate">{repo}</div>

      <div className="flex items-center gap-4 flex-1">
        <div className="relative flex-shrink-0">
          <LevelRing level={level.level} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-3xl font-bold leading-none">L{level.level}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">
              of {MAX_LEVEL}
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <BarChart3 className="w-4 h-4 text-primary" />
            <div className="text-sm font-semibold truncate">{level.levelName}</div>
          </div>
          <div className="text-xs text-muted-foreground mb-2">
            Role: <span className="text-foreground font-medium">{level.role}</span>
          </div>
          <p className="text-xs leading-snug text-muted-foreground line-clamp-3">
            {level.characteristic}
          </p>
        </div>
      </div>

      {nextLevel && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Next level progress</span>
            <span className="font-mono">
              {nextDetected}/{nextRequired}
            </span>
          </div>
          <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${nextRequired ? (nextDetected / nextRequired) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default ACMMLevel
