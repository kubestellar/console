import { BarChart3, ExternalLink } from 'lucide-react'
import { useCardLoadingState } from './CardDataContext'
import { CardSkeleton } from '../../lib/cards/CardComponents'
import { useACMM } from '../acmm/ACMMProvider'
import { acmmSource } from '../../lib/acmm/sources/acmm'

const MAX_LEVEL = 5
const GAUGE_SIZE = 120
const GAUGE_STROKE = 10
const PAPER_URL = 'https://arxiv.org/abs/2604.09388'

const ALL_LEVELS = acmmSource.levels ?? []

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
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground font-mono truncate">{repo}</div>
        <a
          href={PAPER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors shrink-0 ml-2"
        >
          <ExternalLink className="w-3 h-3" />
          Source
        </a>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-shrink-0">
          <LevelRing level={level.level} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-2xl font-bold leading-none">L{level.level}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
              {level.levelName}
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <BarChart3 className="w-3.5 h-3.5 text-primary" />
            <div className="text-xs text-muted-foreground">
              Role: <span className="text-foreground font-medium">{level.role}</span>
            </div>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground line-clamp-3">
            {level.characteristic}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-0.5 mb-2">
        {ALL_LEVELS.map((lvl) => {
          const isCurrent = lvl.n === level.level
          const isPast = lvl.n < level.level
          return (
            <div
              key={lvl.n}
              className={`flex items-center gap-2 px-2 py-0.5 rounded text-xs transition-colors ${
                isCurrent
                  ? 'bg-primary/15 text-foreground font-semibold'
                  : isPast
                    ? 'text-muted-foreground/70'
                    : 'text-muted-foreground/40'
              }`}
            >
              <span className="font-mono w-5 text-right shrink-0">L{lvl.n}</span>
              <span className="truncate">{lvl.name}</span>
              <span className="ml-auto text-[10px] truncate">{lvl.role}</span>
            </div>
          )
        })}
      </div>

      {nextLevel && (
        <div className="mt-auto pt-2 border-t border-border/50">
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
