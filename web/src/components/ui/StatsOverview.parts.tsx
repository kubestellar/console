import { memo, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Server, CheckCircle2, XCircle, WifiOff, Box, Cpu, MemoryStick, HardDrive, Zap, Layers,
  FolderOpen, AlertCircle, AlertTriangle, AlertOctagon, Package, Ship, Settings, Clock,
  MoreHorizontal, Database, Workflow, Globe, Network, ArrowRightLeft, CircleDot,
  ShieldAlert, ShieldOff, User, Info, Percent, ClipboardList, Sparkles, Activity,
  List, DollarSign, FlaskConical } from 'lucide-react'
import { safeLazy } from '../../lib/safeLazy'
import { Skeleton } from './Skeleton'
import type { StatBlockConfig, StatDisplayMode } from './StatsBlockDefinitions'
import { StatBlockModePicker } from './StatBlockModePicker'
import { ROUTES } from '../../config/routes'
// Lazy-load Sparkline to defer the echarts vendor chunk from the critical path.
// The Gauge and CircularProgress components are smaller and less common, but they
// share the same echarts import chain, so lazy-loading them too is low-cost.
const LazySparkline = safeLazy(() => import('../charts/Sparkline'), 'Sparkline')
import { Gauge } from '../charts/Gauge'
import { CircularProgress } from '../charts/ProgressBar'
import { MIN_SPARKLINE_POINTS } from '../../hooks/useStatHistory'
import { wrapAbbreviations } from '../shared/TechnicalAcronym'
import { STAT_BLOCK_COLORS as COLOR_HEX } from '../../lib/tokens'
import type { StatBlockValue } from './StatsOverview.types'
import {
  COLOR_CLASSES, VALUE_COLORS, DEFAULT_PROGRESS_MAX, PERCENTAGE_STAT_IDS, PROGRESS_DISPLAY_MODES,
  hasExplicitProgressMax, isPercentageLikeStat, supportsProgressScale, getAvailableModes,
  MINI_BAR_HEIGHT_PX, RING_SIZE_PX, RING_STROKE_PX, HORSESHOE_SIZE_PX, HORSESHOE_STROKE_PX,
  HORSESHOE_ARC_DEG, HEATMAP_CONTRAST_OPACITY_THRESHOLD, HEATMAP_HIGH_CONTRAST_TEXT_CLASSES,
  getHeatmapOpacity } from './StatsOverview.constants'

// Icon mapping for dynamic rendering
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Server, CheckCircle2, XCircle, WifiOff, Box, Cpu, MemoryStick, HardDrive, Zap, Layers,
  FolderOpen, AlertCircle, AlertTriangle, AlertOctagon, Package, Ship, Settings, Clock,
  MoreHorizontal, Database, Workflow, Globe, Network, ArrowRightLeft, CircleDot,
  ShieldAlert, ShieldOff, User, Info, Percent, ClipboardList, Sparkles, Activity,
  List, DollarSign }

/** Inline horseshoe gauge — a 270° arc with value text centered */
const HorseshoeGauge = memo(function HorseshoeGauge({ value, max = 100, size, strokeWidth, color }: {
  value: number; max?: number; size: number; strokeWidth: number; color: string
}) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const arcFraction = HORSESHOE_ARC_DEG / 360
  const arcLength = circumference * arcFraction
  const offset = arcLength - (percentage / 100) * arcLength
  /** Rotation to center the gap at the bottom: -(90 + half of gap angle) */
  const gapDeg = 360 - HORSESHOE_ARC_DEG
  const rotationDeg = 90 + gapDeg / 2

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: `rotate(${rotationDeg}deg)` }}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="currentColor" strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          className="text-secondary"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={offset}
          className="[transition:stroke-dashoffset_0.5s_ease]"
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-foreground">{Math.round(percentage)}%</span>
      </div>
    </div>
  )
})

interface StatBlockProps {
  block: StatBlockConfig
  data: StatBlockValue
  hasData: boolean
  isLoading?: boolean
  history?: number[]
  onDisplayModeChange?: (mode: StatDisplayMode) => void
}

export const StatBlock = memo(function StatBlock({ block, data, hasData, isLoading, history, onDisplayModeChange }: StatBlockProps) {
  const { t } = useTranslation()
  const IconComponent = ICONS[block.icon] || Server
  const colorClass = COLOR_CLASSES[block.color] || 'text-foreground'
  const valueColor = VALUE_COLORS[block.id] || 'text-foreground'
  const hexColor = block.color === 'primary'
    ? 'hsl(var(--primary))'
    : (COLOR_HEX[block.color] || 'hsl(var(--primary))')
  const isClickable = !isLoading && data.isClickable !== false && !!data.onClick
  const isDemo = data.isDemo === true
  const mode: StatDisplayMode = block.displayMode || 'numeric'
  const availableModes = getAvailableModes(block.id, data)

  const rawValue = data.value
  const rawProgressValue = typeof data.progressValue === 'number' ? data.progressValue : rawValue
  const isEmptyValue = !isLoading && (
    rawValue === undefined ||
    rawValue === null ||
    rawValue === '-' ||
    (typeof rawValue === 'string' && rawValue.trim() === '')
  )
  const displayValue = isEmptyValue
    ? '—'
    : (data.format && typeof rawValue === 'number' ? data.format(rawValue) : rawValue)
  const numericValue = typeof rawValue === 'number'
    ? rawValue
    : parseFloat(String(rawValue))
  const progressNumericValue = typeof rawProgressValue === 'number'
    ? rawProgressValue
    : parseFloat(String(rawProgressValue))
  const hasExplicitMax = hasExplicitProgressMax(data)
  const isPercentageStat = isPercentageLikeStat(block.id, rawValue)
  const maxValue = hasExplicitMax ? data.max : DEFAULT_PROGRESS_MAX
  const canScaleProgress = supportsProgressScale(block.id, data)
  const progressPercent = !isNaN(progressNumericValue) && maxValue > 0
    ? Math.min((progressNumericValue / maxValue) * DEFAULT_PROGRESS_MAX, DEFAULT_PROGRESS_MAX)
    : 0
  const progressPercentLabel = hasExplicitMax ? `${Math.round(progressPercent)}%` : null
  const progressDisplayValue = isPercentageStat && !String(displayValue).includes('%')
    ? `${displayValue}%`
    : displayValue
  const progressMaxLabel = hasExplicitMax && !isPercentageStat
    ? (data.format ? data.format(data.max) : data.max)
    : null
  const groundtruthFields = {
    ...(data.groundtruthField ? { [data.groundtruthField]: rawValue } : {}),
    ...(data.groundtruthFields || {}),
  }

  // Sparkline: fall back to numeric if not enough data yet.
  // Progress-style modes also fall back when the stat has no real denominator,
  // which prevents misleading static bars for raw counts.
  const hasEnoughHistory = (history?.length ?? 0) >= MIN_SPARKLINE_POINTS
  const effectiveMode = mode === 'sparkline' && !hasEnoughHistory
    ? 'numeric'
    : (PROGRESS_DISPLAY_MODES.has(mode) && !canScaleProgress ? 'numeric' : mode)
  const isHeatmapMode = effectiveMode === 'heatmap' && !isNaN(numericValue)
  const heatmapOpacity = isHeatmapMode ? getHeatmapOpacity(numericValue) : 0
  const useHeatmapHighContrastText = isHeatmapMode && heatmapOpacity >= HEATMAP_CONTRAST_OPACITY_THRESHOLD
  const iconClass = isLoading
    ? 'text-muted-foreground/30'
    : (useHeatmapHighContrastText ? HEATMAP_HIGH_CONTRAST_TEXT_CLASSES.icon : colorClass)
  const labelClass = useHeatmapHighContrastText ? HEATMAP_HIGH_CONTRAST_TEXT_CLASSES.label : 'text-muted-foreground'

  return (
    <div
      // PR #6574 item A — stable data-testid hooks for e2e selectors. The
      // Dashboard spec asserts cluster-count values; without these hooks it
      // was grepping the page body for digits and false-positiving on
      // substrings (e.g. "3" matching "30 nodes"). Hook name is scoped by
      // block id so each stat is individually addressable.
      data-testid={`stat-block-${block.id}`}
      className={`group relative min-w-0 rounded-lg border border-border/50 bg-card p-4 text-card-foreground shadow-sm min-h-[100px] ${isLoading ? 'animate-pulse' : ''} ${isClickable ? 'cursor-pointer hover:bg-accent/40' : ''} ${isDemo ? 'border-yellow-500/30 bg-yellow-500/5 shadow-[0_0_12px_hsl(var(--warning)/0.15)]' : ''} transition-colors`}
      onClick={() => isClickable && data.onClick?.()}
      {...(isClickable ? {
        role: 'button' as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); data.onClick?.() } },
      } : {})}
    >
      {Object.entries(groundtruthFields).map(([field, value]) => (
        <span key={field} className="sr-only" data-groundtruth-field={field}>
          {value ?? ''}
        </span>
      ))}

      {/* Demo badge */}
      {isDemo && (
        <span className="absolute -top-1 -right-1" title="Demo data">
          <FlaskConical className="w-3.5 h-3.5 text-yellow-400/70" />
        </span>
      )}

      {/* Mode picker gear — appears on hover */}
      {!isLoading && onDisplayModeChange && (
        <StatBlockModePicker
          currentMode={mode}
          availableModes={availableModes}
          onModeChange={onDisplayModeChange}
        />
      )}

      {/* Header: icon + name. Label uses truncate so short stat labels
          ("Clusters", "Healthy") never break mid-word at narrow card widths
          (#11456). The full name is available via title tooltip. */}
      <div className="flex items-start gap-2 mb-2 min-w-0">
        <IconComponent className={`w-5 h-5 shrink-0 mt-0.5 ${iconClass}`} />
        <span className={`text-sm truncate leading-tight min-w-0 ${labelClass}`} title={block.name}>{wrapAbbreviations(block.name)}</span>
      </div>

      {/* Mode-specific content */}
      {isLoading ? (
        <>
          <Skeleton variant="text" width="55%" height={34} className="mb-2" />
          <Skeleton variant="text" width="70%" height={12} />
        </>
      ) : effectiveMode === 'sparkline' && hasEnoughHistory && !isNaN(numericValue) ? (
        <>
          <div className="flex items-end justify-between gap-2">
            <div data-testid={`stat-block-${block.id}-count`} className={`text-2xl font-bold ${isLoading ? 'text-muted-foreground/30' : valueColor}`}>
              {displayValue}
            </div>
            <Suspense fallback={<div style={{ height: 28, width: 64 }} className="bg-secondary/30 rounded" />}>
              <LazySparkline data={history!} color={hexColor} height={28} width={64} fill />
            </Suspense>
          </div>
          {data.sublabel && <div className="text-xs text-muted-foreground mt-1">{wrapAbbreviations(data.sublabel)}</div>}
        </>
      ) : effectiveMode === 'gauge' && !isNaN(progressNumericValue) ? (
        <>
          <div className="flex justify-center">
            <Gauge
              value={progressNumericValue}
              max={maxValue}
              size="xs"
              thresholds={data.thresholds}
              invertColors={PERCENTAGE_STAT_IDS.has(block.id)}
            />
          </div>
          {data.sublabel && <div className="text-xs text-muted-foreground text-center mt-1">{wrapAbbreviations(data.sublabel)}</div>}
        </>
      ) : effectiveMode === 'ring-3' && !isNaN(progressNumericValue) ? (
        <>
          <div className="flex justify-center">
            <CircularProgress
              value={progressNumericValue}
              max={maxValue}
              size={RING_SIZE_PX}
              strokeWidth={RING_STROKE_PX}
              color={hexColor}
              formatValue={data.format && typeof rawValue === 'number' ? () => data.format!(rawValue as number) : undefined}
            />
          </div>
          {data.sublabel && <div className="text-xs text-muted-foreground text-center mt-1">{wrapAbbreviations(data.sublabel)}</div>}
        </>
      ) : effectiveMode === 'mini-bar' && !isNaN(progressNumericValue) ? (
        <>
          <div data-testid={`stat-block-${block.id}-count`} className={`text-2xl font-bold ${isLoading ? 'text-muted-foreground/30' : valueColor}`}>
            {progressDisplayValue}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div data-testid={`stat-block-${block.id}-progress`} className="flex-1 bg-secondary rounded-full overflow-hidden" style={{ height: MINI_BAR_HEIGHT_PX }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: hexColor }}
              />
            </div>
            {progressPercentLabel && <span data-testid={`stat-block-${block.id}-scale`} className="text-2xs text-muted-foreground shrink-0">{progressPercentLabel}</span>}
          </div>
          {data.sublabel && (
            <div className="text-xs text-muted-foreground mt-1">
              {wrapAbbreviations(data.sublabel)}
              {progressMaxLabel && <span className="text-muted-foreground/60"> of {progressMaxLabel}</span>}
            </div>
          )}
        </>
      ) : effectiveMode === 'horseshoe' && !isNaN(progressNumericValue) ? (
        <>
          <div className="flex justify-center">
            <HorseshoeGauge
              value={progressNumericValue}
              max={maxValue}
              size={HORSESHOE_SIZE_PX}
              strokeWidth={HORSESHOE_STROKE_PX}
              color={hexColor}
            />
          </div>
          {data.sublabel && <div className="text-xs text-muted-foreground text-center mt-1">{wrapAbbreviations(data.sublabel)}</div>}
        </>
      ) : effectiveMode === 'trend' && !isNaN(numericValue) ? (
        (() => {
          const prevValue = history && history.length >= 2 ? history[history.length - 2] : undefined
          const delta = prevValue !== undefined ? numericValue - prevValue : undefined
          const deltaPercent = prevValue !== undefined && prevValue !== 0
            ? Math.round(((numericValue - prevValue) / prevValue) * 100)
            : undefined
          return (
            <>
              <div className="flex items-baseline gap-2">
                <div data-testid={`stat-block-${block.id}-count`} className={`text-2xl font-bold ${isLoading ? 'text-muted-foreground/30' : valueColor}`}>
                  {displayValue}
                </div>
                {delta !== undefined && (
                  <span className={`text-sm font-medium ${delta > 0 ? 'text-red-400' : delta < 0 ? 'text-green-400' : 'text-muted-foreground'}`}>
                    {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'}
                    {deltaPercent !== undefined && ` ${Math.abs(deltaPercent)}%`}
                  </span>
                )}
              </div>
              {delta === undefined && !isLoading && hasData && (
                <div className="text-2xs text-muted-foreground/50 mt-0.5">Collecting…</div>
              )}
              {data.sublabel && <div className="text-xs text-muted-foreground mt-1">{wrapAbbreviations(data.sublabel)}</div>}
            </>
          )
        })()
      ) : effectiveMode === 'stacked-bar' && !isNaN(progressNumericValue) ? (
        <>
          <div data-testid={`stat-block-${block.id}-count`} className={`text-2xl font-bold ${isLoading ? 'text-muted-foreground/30' : valueColor}`}>
            {progressDisplayValue}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div data-testid={`stat-block-${block.id}-progress`} className="flex-1 bg-secondary rounded-full overflow-hidden flex" style={{ height: MINI_BAR_HEIGHT_PX }}>
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: hexColor }}
              />
            </div>
            {progressPercentLabel && <span data-testid={`stat-block-${block.id}-scale`} className="text-2xs text-muted-foreground shrink-0">{progressPercentLabel}</span>}
          </div>
          {data.sublabel && (
            <div className="text-xs text-muted-foreground mt-1">
              {wrapAbbreviations(data.sublabel)}
              {progressMaxLabel && <span className="text-muted-foreground/60"> of {progressMaxLabel}</span>}
            </div>
          )}
        </>
      ) : effectiveMode === 'heatmap' && !isNaN(numericValue) ? (
        <>
          <div
            className="absolute inset-0 rounded-lg transition-colors duration-500"
            style={{ backgroundColor: hexColor, opacity: heatmapOpacity }}
          />
          <div className="relative">
            <div data-testid={`stat-block-${block.id}-count`} className={`text-3xl font-bold ${useHeatmapHighContrastText ? HEATMAP_HIGH_CONTRAST_TEXT_CLASSES.value : valueColor}`}>{displayValue}</div>
            {data.sublabel && <div className={`min-w-0 truncate text-xs ${useHeatmapHighContrastText ? HEATMAP_HIGH_CONTRAST_TEXT_CLASSES.sublabel : 'text-muted-foreground'}`} title={data.sublabel}>{wrapAbbreviations(data.sublabel)}</div>}
          </div>
        </>
      ) : (
        /* Default numeric mode */
        <>
          <div
            data-testid={`stat-block-${block.id}-count`}
            className={isEmptyValue
              ? 'text-sm font-medium text-muted-foreground/70'
              : `text-3xl font-bold ${isLoading ? 'text-muted-foreground/30' : valueColor}`}
          >
            {displayValue}
          </div>
          {/* #9708 — Only show "Building trend…" when there is no sublabel.
              Both elements appearing together overflows the card height and
              creates visual inconsistency across stat cards. The sublabel
              (e.g. "healthy pods") is more informative and takes priority. */}
          {mode === 'sparkline' && !hasEnoughHistory && !isLoading && hasData && !data.sublabel && (
            <div className="text-2xs text-muted-foreground/50 mt-0.5">Building trend…</div>
          )}
          {isEmptyValue && (
            <div className="text-2xs text-muted-foreground/70 mt-0.5">
              {t('statsOverview.emptyHint', 'Connect a cluster to populate')}{' '}
              <Link to={ROUTES.LOGIN} className="underline underline-offset-2 hover:text-foreground transition-colors">
                {t('statsOverview.setupWizard', 'Open setup wizard')}
              </Link>
            </div>
          )}
          {data.sublabel && <div className="min-w-0 truncate text-xs text-muted-foreground" title={data.sublabel}>{wrapAbbreviations(data.sublabel)}</div>}
        </>
      )}
    </div>
  )
})
