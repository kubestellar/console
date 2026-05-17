import { useState, memo, Suspense } from 'react'
import { safeLazy } from '../../lib/safeLazy'
import { useModalState } from '../../lib/modals'
import { useTranslation } from 'react-i18next'
import {
  Server, CheckCircle2, XCircle, WifiOff, Box, Cpu, MemoryStick, HardDrive, Zap, Layers,
  FolderOpen, AlertCircle, AlertTriangle, AlertOctagon, Package, Ship, Settings, Clock,
  MoreHorizontal, Database, Workflow, Globe, Network, ArrowRightLeft, CircleDot,
  ShieldAlert, ShieldOff, User, Info, Percent, ClipboardList, Sparkles, Activity,
  List, DollarSign, ChevronDown, ChevronRight, FlaskConical } from 'lucide-react'
import { Button } from './Button'
import { StatusBadge } from './StatusBadge'
import { Skeleton } from './Skeleton'
import { StatBlockConfig, DashboardStatsType, StatDisplayMode } from './StatsBlockDefinitions'
import { StatsConfigModal, useStatsConfig } from './StatsConfig'
import { StatBlockModePicker } from './StatBlockModePicker'
// Lazy-load Sparkline to defer the echarts vendor chunk from the critical path.
// The Gauge and CircularProgress components are smaller and less common, but they
// share the same echarts import chain, so lazy-loading them too is low-cost.
const LazySparkline = safeLazy(() => import('../charts/Sparkline'), 'Sparkline')
import { Gauge } from '../charts/Gauge'
import { CircularProgress } from '../charts/ProgressBar'
import { useLocalAgent, wasAgentEverConnected } from '../../hooks/useLocalAgent'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { useStatHistory, MIN_SPARKLINE_POINTS } from '../../hooks/useStatHistory'
import { wrapAbbreviations } from '../shared/TechnicalAcronym'
import { safeGetJSON, safeSetJSON } from '../../lib/utils/localStorage'
import { STAT_BLOCK_COLORS as COLOR_HEX } from '../../lib/tokens'

// Icon mapping for dynamic rendering
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Server, CheckCircle2, XCircle, WifiOff, Box, Cpu, MemoryStick, HardDrive, Zap, Layers,
  FolderOpen, AlertCircle, AlertTriangle, AlertOctagon, Package, Ship, Settings, Clock,
  MoreHorizontal, Database, Workflow, Globe, Network, ArrowRightLeft, CircleDot,
  ShieldAlert, ShieldOff, User, Info, Percent, ClipboardList, Sparkles, Activity,
  List, DollarSign }

// Color mapping for dynamic rendering
const COLOR_CLASSES: Record<string, string> = {
  primary: 'text-primary',
  purple: 'text-purple-400',
  green: 'text-green-400',
  orange: 'text-orange-400',
  yellow: 'text-yellow-400',
  cyan: 'text-cyan-400',
  blue: 'text-blue-400',
  red: 'text-red-400',
  gray: 'text-muted-foreground' }

// Value color mapping for specific stat types
const VALUE_COLORS: Record<string, string> = {
  healthy: 'text-green-400',
  passing: 'text-green-400',
  deployed: 'text-green-400',
  bound: 'text-green-400',
  normal: 'text-blue-400',
  unhealthy: 'text-red-400',
  warning: 'text-yellow-400',
  pending: 'text-yellow-400',
  unreachable: 'text-yellow-400',
  critical: 'text-red-400',
  failed: 'text-red-400',
  failing: 'text-red-400',
  errors: 'text-red-400',
  issues: 'text-red-400',
  high: 'text-red-400',
  medium: 'text-yellow-400',
  low: 'text-blue-400',
  privileged: 'text-red-400',
  root: 'text-orange-400' }

/** Default denominator for percentage/progress visualizations. */
const DEFAULT_PROGRESS_MAX = 100

/** Stat block IDs that represent percentage-type values (0-100) */
const PERCENTAGE_STAT_IDS = new Set([
  'score', 'cis_score', 'nsa_score', 'pci_score', 'kubescape_score',
  'encryption_score', 'cpu_util', 'memory_util',
  'gdpr_score', 'hipaa_score', 'soc2_score',
])

/** Display modes that require a real denominator to scale correctly. */
const PROGRESS_DISPLAY_MODES = new Set<StatDisplayMode>([
  'gauge',
  'ring-3',
  'mini-bar',
  'stacked-bar',
  'horseshoe',
])

function hasExplicitProgressMax(data: StatBlockValue): data is StatBlockValue & { max: number } {
  return typeof data.max === 'number' && Number.isFinite(data.max) && data.max >= 0
}

function isPercentageLikeStat(blockId: string, value: string | number): boolean {
  return PERCENTAGE_STAT_IDS.has(blockId) || String(value).includes('%')
}

function supportsProgressScale(blockId: string, data: StatBlockValue): boolean {
  return hasExplicitProgressMax(data) || isPercentageLikeStat(blockId, data.value)
}

/** Determine which display modes are appropriate for a given stat block */
function getAvailableModes(blockId: string, data: StatBlockValue): StatDisplayMode[] {
  if (data.modeHints && data.modeHints.length > 0) return data.modeHints

  const modes: StatDisplayMode[] = ['numeric']
  const numericValue = typeof data.value === 'number'
    ? data.value
    : parseFloat(String(data.value))
  const canScaleProgress = supportsProgressScale(blockId, data)

  if (!isNaN(numericValue)) {
    modes.push('sparkline', 'trend', 'heatmap')
    if (canScaleProgress) {
      modes.push('mini-bar', 'stacked-bar', 'gauge', 'horseshoe', 'ring-3')
    }
  }
  return modes
}

/** Height of the mini-bar progress bar in pixels */
const MINI_BAR_HEIGHT_PX = 6

/** Size of the circular ring indicator in pixels */
const RING_SIZE_PX = 64

/** Stroke width of the circular ring indicator in pixels */
const RING_STROKE_PX = 6

/** Size of the horseshoe gauge in pixels */
const HORSESHOE_SIZE_PX = 64

/** Stroke width of the horseshoe gauge */
const HORSESHOE_STROKE_PX = 6

/** Angle span of the horseshoe arc in degrees (270 = 3/4 circle) */
const HORSESHOE_ARC_DEG = 270

/** Heatmap intensity thresholds — maps value ranges to opacity */
const HEATMAP_THRESHOLDS = [
  { max: 0, opacity: 0 },
  { max: 1, opacity: 0.15 },
  { max: 5, opacity: 0.3 },
  { max: 10, opacity: 0.5 },
  { max: 25, opacity: 0.7 },
  { max: 50, opacity: 0.85 },
  { max: Infinity, opacity: 1.0 },
]

/** Minimum heatmap opacity where text should switch to high-contrast classes */
const HEATMAP_CONTRAST_OPACITY_THRESHOLD = 0.5

/** Foreground classes used on high-intensity heatmap cards for readability */
const HEATMAP_HIGH_CONTRAST_TEXT_CLASSES = {
  icon: 'text-white/90 drop-shadow-xs',
  label: 'text-white/90 drop-shadow-xs',
  value: 'text-white drop-shadow-xs',
  sublabel: 'text-white/80 drop-shadow-xs',
} as const

/**
 * Value and metadata for a single stat block
 */
export interface StatBlockValue {
  value: string | number
  sublabel?: string
  onClick?: () => void
  isClickable?: boolean
  /** Whether this stat uses demo/mock data (shows yellow border + badge) */
  isDemo?: boolean
  /** Raw numerator used by progress-style visualizations when the displayed value should stay different. */
  progressValue?: number
  /** For gauge/ring modes: the max value (default 100) */
  max?: number
  /** For gauge mode: threshold config */
  thresholds?: { warning: number; critical: number }
  /** Hint to the display mode picker about what modes are appropriate */
  modeHints?: StatDisplayMode[]
  /** Optional formatter for display — when value is numeric but should display as a string (e.g., "30.5 TB") */
  format?: (value: number) => string
}

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

/** Get heatmap opacity for a value */
function getHeatmapOpacity(value: number): number {
  for (const t of HEATMAP_THRESHOLDS) {
    if (value <= t.max) return t.opacity
  }
  return 1.0
}

interface StatBlockProps {
  block: StatBlockConfig
  data: StatBlockValue
  hasData: boolean
  isLoading?: boolean
  history?: number[]
  onDisplayModeChange?: (mode: StatDisplayMode) => void
}

const StatBlock = memo(function StatBlock({ block, data, hasData, isLoading, history, onDisplayModeChange }: StatBlockProps) {
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
      className={`group relative rounded-lg border border-border/50 bg-card p-4 text-card-foreground shadow-sm min-h-[100px] ${isLoading ? 'animate-pulse' : ''} ${isClickable ? 'cursor-pointer hover:bg-accent/40' : ''} ${isDemo ? 'border-yellow-500/30 bg-yellow-500/5 shadow-[0_0_12px_rgba(234,179,8,0.15)]' : ''} transition-colors`}
      onClick={() => isClickable && data.onClick?.()}
      {...(isClickable ? {
        role: 'button' as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); data.onClick?.() } },
      } : {})}
    >
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
            {data.sublabel && <div className={`text-xs ${useHeatmapHighContrastText ? HEATMAP_HIGH_CONTRAST_TEXT_CLASSES.sublabel : 'text-muted-foreground'}`}>{wrapAbbreviations(data.sublabel)}</div>}
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
              <a href="/login" className="underline underline-offset-2 hover:text-foreground transition-colors">
                {t('statsOverview.setupWizard', 'Open setup wizard')}
              </a>
            </div>
          )}
          {data.sublabel && <div className="text-xs text-muted-foreground">{wrapAbbreviations(data.sublabel)}</div>}
        </>
      )}
    </div>
  )
})

interface StatsOverviewProps {
  /** Dashboard type for loading config */
  dashboardType: DashboardStatsType
  /** Function to get value for each stat block by ID */
  getStatValue: (blockId: string) => StatBlockValue
  /** Whether the dashboard has actual data loaded */
  hasData?: boolean
  /** Whether to show loading skeletons */
  isLoading?: boolean
  /** Whether the stats section is collapsible (default: true) */
  collapsible?: boolean
  /** Whether stats are expanded by default (default: true) */
  defaultExpanded?: boolean
  /** Storage key for collapsed state */
  collapsedStorageKey?: string
  /** Last updated timestamp */
  lastUpdated?: Date | null
  /** Additional class names */
  className?: string
  /** Title for the stats section */
  title?: string
  /** Whether to show the configure button */
  showConfigButton?: boolean
  /** Whether the stats are demo data (shows yellow border + badge) */
  isDemoData?: boolean
}

/**
 * Reusable stats overview component for all dashboards.
 * Provides drag-and-drop reordering, visibility toggles, and persistent configuration.
 */
export function StatsOverview({
  dashboardType,
  getStatValue,
  hasData = true,
  isLoading = false,
  collapsible = true,
  defaultExpanded = true,
  collapsedStorageKey,
  className = '',
  title,
  showConfigButton = true,
  isDemoData = false }: StatsOverviewProps) {
  const { t } = useTranslation()
  const resolvedTitle = title ?? t('statsOverview.title')
  const { blocks, saveBlocks, visibleBlocks, defaultBlocks } = useStatsConfig(dashboardType)
  const { status: agentStatus } = useLocalAgent()
  const { isDemoMode } = useDemoMode()
  const isModeSwitching = useIsModeSwitching()

  // When demo mode is OFF and agent is confirmed disconnected, force skeleton display
  // Don't force skeleton during 'connecting' - show cached data to prevent flicker
  const isAgentOffline = agentStatus === 'disconnected'
  const forceLoadingForOffline = !isDemoMode && !isDemoData && isAgentOffline && !isInClusterMode() && !wasAgentEverConnected()
  // Show skeleton during mode switching for smooth transitions
  const effectiveIsLoading = isLoading || forceLoadingForOffline || isModeSwitching
  const effectiveHasData = forceLoadingForOffline ? false : hasData
  const { isOpen, open: openConfig, close: closeConfig } = useModalState()

  // Sparkline history buffer — accumulates values over the session
  const { getHistory } = useStatHistory(
    dashboardType,
    getStatValue,
    visibleBlocks.map(b => b.id),
    effectiveIsLoading,
  )

  // Handle per-block display mode changes — persists to localStorage (synced to agent)
  const handleDisplayModeChange = (blockId: string, mode: StatDisplayMode) => {
    const updated = blocks.map(b => b.id === blockId ? { ...b, displayMode: mode } : b)
    saveBlocks(updated)
    window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
  }

  // Manage collapsed state with localStorage persistence.
  // Storage key ends in "-stats-collapsed", so the stored value represents
  // the COLLAPSED state (true = collapsed). Previously this file stored
  // `isExpanded` under the same key, which inverted across reloads and
  // disagreed with sibling components that use the collapsed sense.
  const storageKey = collapsedStorageKey || `kubestellar-${dashboardType}-stats-collapsed`
  const [isExpanded, setIsExpanded] = useState(() => {
    const savedCollapsed = safeGetJSON<boolean>(storageKey)
    return savedCollapsed === null || savedCollapsed === undefined
      ? defaultExpanded
      : !savedCollapsed
  })

  const toggleExpanded = () => {
    const newValue = !isExpanded
    setIsExpanded(newValue)
    // Store COLLAPSED state to match the storage-key semantics.
    safeSetJSON(storageKey, !newValue)
  }

  // Dynamic grid columns based on visible blocks.
  // Mobile: max 2 columns, tablet+: responsive based on count.
  // - ≤4 blocks: 4 columns at md+.
  // - 5 blocks: 5 columns at lg+.
  // - 6 blocks: keep 3x2 through lg, switch to 6 across at xl to avoid a
  //   5+1 orphan layout at 1440px.
  // - 7+ blocks: cap at 4 columns at lg, expand to 5 at xl for readability.
  const gridCols = visibleBlocks.length <= 4 ? 'grid-cols-2 md:grid-cols-4' :
    visibleBlocks.length <= 5 ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5' :
    visibleBlocks.length === 6 ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6' :
    'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

  return (
    <div className={`mb-6 ${className}`}>
      {/* Header with collapse toggle and settings */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {collapsible ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleExpanded}
              className="font-medium"
              icon={<Activity className="w-4 h-4" />}
              iconRight={isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            >
              {resolvedTitle}
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Activity className="w-4 h-4" />
              <span>{resolvedTitle}</span>
            </div>
          )}
          {isDemoData && (
            <StatusBadge
              color="yellow"
              size="xs"
              variant="outline"
              rounded="full"
              icon={<FlaskConical className="w-2.5 h-2.5" />}
              title={t('statsOverview.demoTooltip', 'Showing sample data — connect clusters to see live metrics')}
            >
              {t('statsOverview.demo')}
            </StatusBadge>
          )}

        </div>
        {showConfigButton && isExpanded && (
          <Button
            variant="ghost"
            size="sm"
            onClick={openConfig}
            className="p-1"
            title={t('statsOverview.configureStats')}
            icon={<Settings className="w-4 h-4" />}
          />
        )}
      </div>

      {/* Stats grid */}
      {(!collapsible || isExpanded) && (
        <div className={`grid ${gridCols} gap-4`}>
          {visibleBlocks.map(block => {
            const statValue = effectiveIsLoading ? undefined : getStatValue(block.id)
            const data: StatBlockValue = effectiveIsLoading
              ? { value: '', sublabel: undefined }
              : (statValue ?? { value: '', sublabel: t('statsOverview.notAvailable') })
            return (
              <StatBlock
                key={block.id}
                block={block}
                data={data}
                hasData={effectiveHasData && !effectiveIsLoading && statValue?.value !== undefined}
                isLoading={effectiveIsLoading}
                history={getHistory(block.id)}
                onDisplayModeChange={(mode) => handleDisplayModeChange(block.id, mode)}
              />
            )
          })}
        </div>
      )}

      {/* Config modal */}
      <StatsConfigModal
        isOpen={isOpen}
        onClose={closeConfig}
        blocks={blocks}
        onSave={saveBlocks}
        defaultBlocks={defaultBlocks}
        title={`${t('actions.configure')} ${resolvedTitle}`}
      />
    </div>
  )
}
