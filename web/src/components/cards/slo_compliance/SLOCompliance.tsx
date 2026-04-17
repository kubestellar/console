/**
 * SLO Compliance Tracker — displays Service Level Objective compliance
 * with donut gauges for budget remaining, burn rate indicators, and
 * per-target compliance rows.
 */

import { Target, TrendingDown, TrendingUp, Shield } from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { useSLOCompliance } from './useSLOCompliance'
import type { SLOTarget } from './demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Thresholds for gauge coloring (percentage of budget remaining) */
const BUDGET_GREEN_THRESHOLD = 50
const BUDGET_YELLOW_THRESHOLD = 20

/** SVG gauge dimensions */
const GAUGE_SIZE = 64
const GAUGE_STROKE_WIDTH = 6
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE_WIDTH) / 2
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS
const GAUGE_VIEW_BOX = `0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`
const GAUGE_CENTER = GAUGE_SIZE / 2

/** Burn rate thresholds */
const BURN_RATE_NORMAL = 1.0
const BURN_RATE_WARNING = 2.0
const FULL_COMPLIANCE = 100

/** Skeleton layout */
const SKELETON_GAUGE_COUNT = 3
const SKELETON_GAUGE_HEIGHT = 64
const SKELETON_ROW_COUNT = 3
const SKELETON_ROW_HEIGHT = 32

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBudgetColor(remaining: number): string {
  if (remaining > BUDGET_GREEN_THRESHOLD) return 'text-green-400'
  if (remaining > BUDGET_YELLOW_THRESHOLD) return 'text-yellow-400'
  return 'text-red-400'
}

function getBudgetStrokeColor(remaining: number): string {
  if (remaining > BUDGET_GREEN_THRESHOLD) return 'stroke-green-400'
  if (remaining > BUDGET_YELLOW_THRESHOLD) return 'stroke-yellow-400'
  return 'stroke-red-400'
}

function calculateBurnRate(target: SLOTarget): number {
  // Burn rate only applies to percentage-based SLO targets (e.g. 99.9% availability).
  // For latency/duration thresholds (unit !== '%'), burn rate isn't meaningful.
  if (target.unit && target.unit !== '%') return 0
  const budgetUsed = FULL_COMPLIANCE - target.currentCompliance
  const budgetAllowed = FULL_COMPLIANCE - target.threshold
  if (budgetAllowed <= 0) return 0
  return budgetUsed / budgetAllowed
}

function formatBurnRate(rate: number): string {
  return `${rate.toFixed(1)}x burn rate`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SLOCompliance() {
  const { data, showSkeleton, showEmptyState } = useSLOCompliance()

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-3 p-1">
        <div className="flex justify-center gap-4">
          {Array.from({ length: SKELETON_GAUGE_COUNT }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={SKELETON_GAUGE_HEIGHT} className="w-16" />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={SKELETON_ROW_HEIGHT} />
          ))}
        </div>
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Shield className="w-8 h-8 opacity-40" />
        <p className="text-sm">No SLO targets configured</p>
        <p className="text-xs opacity-60">Configure SLO targets via Prometheus to track compliance</p>
      </div>
    )
  }

  const targets = data.targets || []
  const overallBudgetRemaining = data.overallBudgetRemaining ?? 0

  return (
    <div className="h-full flex flex-col min-h-card gap-3 p-1 overflow-hidden">
      {/* Overall budget + per-target gauges */}
      <div className="flex items-center justify-center gap-4">
        {(targets || []).map((target) => {
          const budgetRemaining = FULL_COMPLIANCE - (FULL_COMPLIANCE - target.currentCompliance)
          const burnRate = calculateBurnRate(target)
          return (
            <DonutGauge
              key={target.metric}
              // Do not manually truncate the label with
              // .split(' ').slice(0, 2).join(' '). That loses meaningful
              // content in non-English locales (and even English phrases
              // like "P99 Latency (API)"). The DonutGauge label span
              // already uses CSS `truncate max-w-16` to clip overflow.
              label={target.name}
              value={budgetRemaining}
              burnRate={burnRate}
            />
          )
        })}
      </div>

      {/* Overall budget remaining bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-secondary/30">
        <Shield className={`w-4 h-4 flex-shrink-0 ${getBudgetColor(overallBudgetRemaining)}`} />
        <span className="text-xs text-muted-foreground">Overall Error Budget</span>
        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              overallBudgetRemaining > BUDGET_GREEN_THRESHOLD
                ? 'bg-green-400'
                : overallBudgetRemaining > BUDGET_YELLOW_THRESHOLD
                  ? 'bg-yellow-400'
                  : 'bg-red-400'
            }`}
            style={{ width: `${Math.min(overallBudgetRemaining, FULL_COMPLIANCE)}%` }}
          />
        </div>
        <span className={`text-xs font-medium ${getBudgetColor(overallBudgetRemaining)}`}>
          {overallBudgetRemaining.toFixed(1)}%
        </span>
      </div>

      {/* Per-target compliance rows */}
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {(targets || []).map((target) => {
          const burnRate = calculateBurnRate(target)
          const isOverBurning = burnRate > BURN_RATE_NORMAL
          return (
            <div
              key={target.metric}
              className="flex items-center justify-between px-2 py-1.5 rounded bg-secondary/30 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Target className={`w-3 h-3 flex-shrink-0 ${getBudgetColor(target.currentCompliance)}`} />
                <span className="truncate font-medium">{target.name}</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground flex-shrink-0">
                <span className="text-2xs">
                  {target.unit === 'ms' ? `< ${target.threshold}${target.unit}` : `${target.threshold}${target.unit}`}
                </span>
                <span className={getBudgetColor(target.currentCompliance)}>
                  {target.currentCompliance.toFixed(1)}%
                </span>
                <span className={`flex items-center gap-0.5 ${isOverBurning ? 'text-red-400' : 'text-green-400'}`}>
                  {isOverBurning
                    ? <TrendingUp className="w-3 h-3" />
                    : <TrendingDown className="w-3 h-3" />}
                  <span className="text-2xs">{formatBurnRate(burnRate)}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DonutGauge({
  label,
  value,
  burnRate,
}: {
  label: string
  value: number
  burnRate: number
}) {
  const clampedValue = Math.max(0, Math.min(FULL_COMPLIANCE, value))
  const dashOffset = GAUGE_CIRCUMFERENCE * (1 - clampedValue / FULL_COMPLIANCE)
  const strokeColor = getBudgetStrokeColor(clampedValue)
  const isOverBurning = burnRate > BURN_RATE_NORMAL
  const isHighBurn = burnRate > BURN_RATE_WARNING

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: GAUGE_SIZE, height: GAUGE_SIZE }}>
        <svg viewBox={GAUGE_VIEW_BOX} className="w-full h-full -rotate-90">
          {/* Background track */}
          <circle
            cx={GAUGE_CENTER}
            cy={GAUGE_CENTER}
            r={GAUGE_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={GAUGE_STROKE_WIDTH}
            className="text-secondary"
          />
          {/* Value arc */}
          <circle
            cx={GAUGE_CENTER}
            cy={GAUGE_CENTER}
            r={GAUGE_RADIUS}
            fill="none"
            strokeWidth={GAUGE_STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={GAUGE_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            className={`${strokeColor} transition-all duration-500`}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xs font-bold ${getBudgetColor(clampedValue)}`}>
            {clampedValue.toFixed(0)}%
          </span>
        </div>
      </div>
      <span className="text-2xs text-muted-foreground text-center truncate max-w-16">{label}</span>
      <span className={`text-2xs ${isHighBurn ? 'text-red-400' : isOverBurning ? 'text-yellow-400' : 'text-green-400'}`}>
        {formatBurnRate(burnRate)}
      </span>
    </div>
  )
}
