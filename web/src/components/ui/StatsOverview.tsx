import { useState, memo } from 'react'
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
import { StatBlockConfig, DashboardStatsType, StatDisplayMode } from './StatsBlockDefinitions'
import { StatsConfigModal, useStatsConfig } from './StatsConfig'
import { StatBlockModePicker } from './StatBlockModePicker'
import { Sparkline } from '../charts/Sparkline'
import { Gauge } from '../charts/Gauge'
import { CircularProgress } from '../charts/ProgressBar'
import { useLocalAgent } from '../../hooks/useLocalAgent'
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

/** Stat block IDs that represent percentage-type values (0-100) */
const PERCENTAGE_STAT_IDS = new Set([
  'score', 'cis_score', 'nsa_score', 'pci_score', 'kubescape_score',
  'encryption_score', 'cpu_util', 'memory_util',
  'gdpr_score', 'hipaa_score', 'soc2_score',
])

/** Determine which display modes are appropriate for a given stat block */
function getAvailableModes(blockId: string, data: StatBlockValue): StatDisplayMode[] {
  if (data.modeHints && data.modeHints.length > 0) return data.modeHints

  const modes: StatDisplayMode[] = ['numeric']
  const numericValue = typeof data.value === 'number'
    ? data.value
    : parseFloat(String(data.value))

  if (!isNaN(numericValue)) {
    modes.push('sparkline', 'mini-bar', 'trend', 'heatmap')
    if (data.max !== undefined || PERCENTAGE_STAT_IDS.has(blockId) || String(data.value).includes('%')) {
      modes.push('gauge', 'horseshoe', 'ring')
    }
  }
  // Stacked bar available for all numeric stats (renders as single segment if no breakdown)
  if (!isNaN(numericValue)) {
    modes.push('stacked-bar')
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
  const IconComponent = ICONS[block.icon] || Server
  const colorClass = COLOR_CLASSES[block.color] || 'text-foreground'
  const valueColor = VALUE_COLORS[block.id] || 'text-foreground'
  const hexColor = COLOR_HEX[block.color] || '#9333ea'
  const isClickable = !isLoading && data.isClickable !== false && !!data.onClick
  const isDemo = data.isDemo === true
  const mode: StatDisplayMode = block.displayMode || 'numeric'
  const availableModes = getAvailableModes(block.id, data)

  const rawValue = data.value
  const displayValue = hasData
    ? (data.format && typeof rawValue === 'number' ? data.format(rawValue) : rawValue)
    : '-'
  const numericValue = typeof rawValue === 'number'
    ? rawValue
    : parseFloat(String(rawValue))
  const maxValue = data.max ?? 100

  // Sparkline: fall back to numeric if not enough data yet
  const hasEnoughHistory = (history?.length ?? 0) >= MIN_SPARKLINE_POINTS
  const effectiveMode = mode === 'sparkline' && !hasEnoughHistory ? 'numeric' : mode

  return (
    <div
      // PR #6574 item A — stable data-testid hooks for e2e selectors. The
      // Dashboard spec asserts cluster-count values; without these hooks it
      // was grepping the page body for digits and false-positiving on
      // substrings (e.g. "3" matching "30 nodes"). Hook name is scoped by
      // block id so each stat is individually addressable.
      data-testid={`stat-block-${block.id}`}
      className={`group relative glass p-4 rounded-lg min-h-[100px] ${isLoading ? 'animate-pulse' : ''} ${isClickable ? 'cursor-pointer hover:bg-secondary/50' : ''} ${isDemo ? 'border border-yellow-500/30 bg-yellow-500/5 shadow-[0_0_12px_rgba(234,179,8,0.15)]' : ''} transition-colors`}
      onClick={() => isClickable && data.onClick?.()}
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

      {/* Header: icon + name */}
      <div className="flex items-center gap-2 mb-2">
        <IconComponent className={`w-5 h-5 shrink-0 ${isLoading ? 'text-muted-foreground/30' : colorClass}`} />
        <span className="text-sm text-muted-foreground truncate">{wrapAbbreviations(block.name)}</span>
      </div>

      {/* Mode-specific content */}
      {effectiveMode === 'sparkline' && hasEnoughHistory && !isNaN(numericValue) ? (
        <>
          <div className="flex items-end justify-between gap-2">
            <div className={`text-2xl font-bold ${isLoading ? 'text-muted-foreground/30' : valueColor}`}>
              {displayValue}
            </div>
            <Sparkline data={history!} color={hexColor} height={28} width={64} fill />
          </div>
          {data.sublabel && <div className="text-xs text-muted-foreground mt-1">{wrapAbbreviations(data.sublabel)}</div>}
        </>
      ) : effectiveMode === 'gauge' && !isNaN(numericValue) ? (
        <>
          <div className="flex justify-center">
            <Gauge
              value={numericValue}
              max={maxValue}
              size="xs"
              thresholds={data.thresholds}
              invertColors={PERCENTAGE_STAT_IDS.has(block.id)}
            />
          </div>
          {data.sublabel && <div className="text-xs text-muted-foreground text-center mt-1">{wrapAbbreviations(data.sublabel)}</div>}
        </>
      ) : effectiveMode === 'ring' && !isNaN(numericValue) ? (
        <>
          <div className="flex justify-center">
            <CircularProgress
              value={numericValue}
              max={maxValue}
              size={RING_SIZE_PX}
              strokeWidth={RING_STROKE_PX}
              color={hexColor}
            />
          </div>
          {data.sublabel && <div className="text-xs text-muted-foreground text-center mt-1">{wrapAbbreviations(data.sublabel)}</div>}
        </>
      ) : effectiveMode === 'mini-bar' && !isNaN(numericValue) ? (
        <>
          <div className={`text-2xl font-bold ${isLoading ? 'text-muted-foreground/30' : valueColor}`}>
            {displayValue}
          </div>
          <div className="mt-1.5 w-full bg-secondary rounded-full overflow-hidden" style={{ height: MINI_BAR_HEIGHT_PX }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min((numericValue / maxValue) * 100, 100)}%`,
                backgroundColor: hexColor }}
            />
          </div>
          {data.sublabel && <div className="text-xs text-muted-foreground mt-1">{wrapAbbreviations(data.sublabel)}</div>}
        </>
      ) : effectiveMode === 'horseshoe' && !isNaN(numericValue) ? (
        <>
          <div className="flex justify-center">
            <HorseshoeGauge
              value={numericValue}
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
                <div className={`text-2xl font-bold ${isLoading ? 'text-muted-foreground/30' : valueColor}`}>
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
      ) : effectiveMode === 'stacked-bar' && !isNaN(numericValue) ? (
        <>
          <div className={`text-2xl font-bold ${isLoading ? 'text-muted-foreground/30' : valueColor}`}>
            {displayValue}
          </div>
          <div className="mt-1.5 w-full bg-secondary rounded-full overflow-hidden flex" style={{ height: MINI_BAR_HEIGHT_PX }}>
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${Math.min((numericValue / maxValue) * 100, 100)}%`,
                backgroundColor: hexColor }}
            />
          </div>
          {data.sublabel && <div className="text-xs text-muted-foreground mt-1">{wrapAbbreviations(data.sublabel)}</div>}
        </>
      ) : effectiveMode === 'heatmap' && !isNaN(numericValue) ? (
        <>
          <div
            className="absolute inset-0 rounded-lg transition-colors duration-500"
            style={{ backgroundColor: hexColor, opacity: getHeatmapOpacity(numericValue) }}
          />
          <div className="relative">
            <div className={`text-3xl font-bold ${numericValue > 0 ? 'text-white drop-shadow-sm' : valueColor}`}>{displayValue}</div>
            {data.sublabel && <div className={`text-xs ${numericValue > 0 ? 'text-white/70' : 'text-muted-foreground'}`}>{wrapAbbreviations(data.sublabel)}</div>}
          </div>
        </>
      ) : (
        /* Default numeric mode */
        <>
          <div className={`text-3xl font-bold ${isLoading ? 'text-muted-foreground/30' : valueColor}`}>{displayValue}</div>
          {mode === 'sparkline' && !hasEnoughHistory && !isLoading && hasData && (
            <div className="text-2xs text-muted-foreground/50 mt-0.5">Building trend…</div>
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
  lastUpdated,
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
  const forceLoadingForOffline = !isDemoMode && !isDemoData && isAgentOffline && !isInClusterMode()
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

  // Dynamic grid columns based on visible blocks
  // Mobile: max 2 columns, tablet+: responsive based on count
  const gridCols = visibleBlocks.length <= 4 ? 'grid-cols-2 md:grid-cols-4' :
    visibleBlocks.length <= 5 ? 'grid-cols-2 md:grid-cols-5' :
    visibleBlocks.length <= 6 ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6' :
    visibleBlocks.length <= 8 ? 'grid-cols-2 md:grid-cols-4 lg:grid-cols-8' :
    'grid-cols-2 md:grid-cols-5 lg:grid-cols-10'

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
          {lastUpdated && (
            <span className="text-xs text-muted-foreground/60">
              {t('statsOverview.updated', { time: lastUpdated.toLocaleTimeString() })}
            </span>
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
            const data = effectiveIsLoading
              ? { value: '-' as string | number, sublabel: undefined }
              : (getStatValue(block.id) ?? { value: '-' as string | number, sublabel: t('statsOverview.notAvailable') })
            return (
              <StatBlock
                key={block.id}
                block={block}
                data={data}
                hasData={effectiveHasData && !effectiveIsLoading && data?.value !== undefined}
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

/**
 * Helper to format large numbers (1000 -> 1K, 1000000 -> 1M)
 */
const STAT_MILLION_THRESHOLD = 1_000_000
const STAT_KILO_THRESHOLD = 10_000
const STAT_KILO_DIVISOR = 1_000

export function formatStatNumber(value: number): string {
  if (value >= STAT_MILLION_THRESHOLD) {
    return `${(value / STAT_MILLION_THRESHOLD).toFixed(1)}M`
  }
  if (value >= STAT_KILO_THRESHOLD) {
    return `${(value / STAT_KILO_DIVISOR).toFixed(1)}K`
  }
  return value.toLocaleString()
}

/**
 * Helper to format memory/storage values
 */
/** GiB per TiB (1024) — used for memory/storage unit conversions */
const GB_PER_TB = 1_024
/** GiB per PiB (1024²) — used for memory/storage unit conversions */
const GB_PER_PB = 1_024 * 1_024

export function formatMemoryValue(gb: number): string {
  if (gb >= GB_PER_PB) {
    return `${(gb / GB_PER_PB).toFixed(1)} PB`
  }
  if (gb >= GB_PER_TB) {
    return `${(gb / GB_PER_TB).toFixed(1)} TB`
  }
  if (gb >= 1) {
    return `${Math.round(gb)} GB`
  }
  if (gb >= 0.001) {
    return `${Math.round(gb * GB_PER_TB)} MB`
  }
  return '0 GB'
}

/**
 * Helper to format percentage values
 */
export function formatPercentage(value: number): string {
  return `${Math.round(value)}%`
}

/** Threshold above which currency values are abbreviated to K (e.g. $1.5K) */
const CURRENCY_KILO_THRESHOLD = 1_000

/**
 * Helper to format currency values
 */
export function formatCurrency(value: number): string {
  if (value >= CURRENCY_KILO_THRESHOLD) {
    return `$${(value / CURRENCY_KILO_THRESHOLD).toFixed(1)}K`
  }
  return `$${value.toFixed(2)}`
}
