import { memo, Suspense, type ComponentType, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowRightLeft,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Clock,
  Cpu,
  Database,
  DollarSign,
  FlaskConical,
  FolderOpen,
  Globe,
  HardDrive,
  Info,
  Layers,
  List,
  MemoryStick,
  MoreHorizontal,
  Network,
  Package,
  Percent,
  Server,
  Settings,
  ShieldAlert,
  ShieldOff,
  Ship,
  Sparkles,
  User,
  WifiOff,
  Workflow,
  XCircle,
  Zap,
} from 'lucide-react'
import { Button } from './Button'
import { StatusBadge } from './StatusBadge'
import { Skeleton } from './Skeleton'
import { StatBlockModePicker } from './StatBlockModePicker'
import { Gauge } from '../charts/Gauge'
import { CircularProgress } from '../charts/ProgressBar'
import { safeLazy } from '../../lib/safeLazy'
import { ROUTES } from '../../config/routes'
import { wrapAbbreviations } from '../shared/TechnicalAcronym'
import { STAT_BLOCK_COLORS as COLOR_HEX } from '../../lib/tokens'
import { cn } from '../../lib/cn'
import { MIN_SPARKLINE_POINTS } from '../../hooks/useStatHistory'
import type { StatBlockConfig, StatBlockValue, StatDisplayMode } from './Stats.types'

const LazySparkline = safeLazy(() => import('../charts/Sparkline'), 'Sparkline')

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Server,
  CheckCircle2,
  XCircle,
  WifiOff,
  Box,
  Cpu,
  MemoryStick,
  HardDrive,
  Zap,
  Layers,
  FolderOpen,
  AlertCircle,
  AlertTriangle,
  AlertOctagon,
  Package,
  Ship,
  Settings,
  Clock,
  MoreHorizontal,
  Database,
  Workflow,
  Globe,
  Network,
  ArrowRightLeft,
  CircleDot,
  ShieldAlert,
  ShieldOff,
  User,
  Info,
  Percent,
  ClipboardList,
  Sparkles,
  Activity,
  List,
  DollarSign,
}

const COLOR_CLASSES: Record<string, string> = {
  primary: 'text-primary',
  purple: 'text-purple-400',
  green: 'text-green-400',
  orange: 'text-orange-400',
  yellow: 'text-yellow-400',
  cyan: 'text-cyan-400',
  blue: 'text-blue-400',
  red: 'text-red-400',
  gray: 'text-muted-foreground',
}

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
  root: 'text-orange-400',
}

const DEFAULT_PROGRESS_MAX = 100
const MINI_BAR_HEIGHT_PX = 6
const RING_SIZE_PX = 64
const RING_STROKE_PX = 6
const HORSESHOE_SIZE_PX = 64
const HORSESHOE_STROKE_PX = 6
const HORSESHOE_ARC_DEG = 270
const HEATMAP_CONTRAST_OPACITY_THRESHOLD = 0.5

const PERCENTAGE_STAT_IDS = new Set([
  'score',
  'cis_score',
  'nsa_score',
  'pci_score',
  'kubescape_score',
  'encryption_score',
  'cpu_util',
  'memory_util',
  'gdpr_score',
  'hipaa_score',
  'soc2_score',
])

const PROGRESS_DISPLAY_MODES = new Set<StatDisplayMode>([
  'gauge',
  'ring-3',
  'mini-bar',
  'stacked-bar',
  'horseshoe',
])

const HEATMAP_THRESHOLDS = [
  { max: 0, opacity: 0 },
  { max: 1, opacity: 0.15 },
  { max: 5, opacity: 0.3 },
  { max: 10, opacity: 0.5 },
  { max: 25, opacity: 0.7 },
  { max: 50, opacity: 0.85 },
  { max: Infinity, opacity: 1.0 },
]

const HEATMAP_HIGH_CONTRAST_TEXT_CLASSES = {
  icon: 'text-white/90 drop-shadow-xs',
  label: 'text-white/90 drop-shadow-xs',
  value: 'text-white drop-shadow-xs',
  sublabel: 'text-white/80 drop-shadow-xs',
} as const

function hasExplicitProgressMax(data: StatBlockValue): data is StatBlockValue & { max: number } {
  return typeof data.max === 'number' && Number.isFinite(data.max) && data.max >= 0
}

function isPercentageLikeStat(blockId: string, value: string | number): boolean {
  return PERCENTAGE_STAT_IDS.has(blockId) || String(value).includes('%')
}

function supportsProgressScale(blockId: string, data: StatBlockValue): boolean {
  return hasExplicitProgressMax(data) || isPercentageLikeStat(blockId, data.value)
}

function getAvailableModes(blockId: string, data: StatBlockValue): StatDisplayMode[] {
  if (data.modeHints && data.modeHints.length > 0) {
    return data.modeHints
  }

  const modes: StatDisplayMode[] = ['numeric']
  const numericValue = typeof data.value === 'number' ? data.value : parseFloat(String(data.value))
  const canScaleProgress = supportsProgressScale(blockId, data)

  if (!isNaN(numericValue)) {
    modes.push('sparkline', 'trend', 'heatmap')
    if (canScaleProgress) {
      modes.push('mini-bar', 'stacked-bar', 'gauge', 'horseshoe', 'ring-3')
    }
  }

  return modes
}

function getHeatmapOpacity(value: number): number {
  for (const threshold of HEATMAP_THRESHOLDS) {
    if (value <= threshold.max) {
      return threshold.opacity
    }
  }
  return 1
}

const HorseshoeGauge = memo(function HorseshoeGauge({
  value,
  max = 100,
  size,
  strokeWidth,
  color,
}: {
  value: number
  max?: number
  size: number
  strokeWidth: number
  color: string
}) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const arcFraction = HORSESHOE_ARC_DEG / 360
  const arcLength = circumference * arcFraction
  const offset = arcLength - (percentage / 100) * arcLength
  const gapDeg = 360 - HORSESHOE_ARC_DEG
  const rotationDeg = 90 + gapDeg / 2

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: `rotate(${rotationDeg}deg)` }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          className="text-secondary"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
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

interface SparklineStatContentProps {
  blockId: string
  displayValue: string | number
  history: number[]
  hexColor: string
  isLoading: boolean
  valueColor: string
  sublabel?: string
}

export function SparklineStatContent({
  blockId,
  displayValue,
  history,
  hexColor,
  isLoading,
  valueColor,
  sublabel,
}: SparklineStatContentProps) {
  return (
    <>
      <div className="flex items-end justify-between gap-2">
        <div
          data-testid={`stat-block-${blockId}-count`}
          className={cn('text-2xl font-bold', isLoading ? 'text-muted-foreground/30' : valueColor)}
        >
          {displayValue}
        </div>
        <Suspense fallback={<div style={{ height: 28, width: 64 }} className="rounded bg-secondary/30" />}>
          <LazySparkline data={history} color={hexColor} height={28} width={64} fill />
        </Suspense>
      </div>
      {sublabel && <div className="mt-1 text-xs text-muted-foreground">{wrapAbbreviations(sublabel)}</div>}
    </>
  )
}

interface TrendStatContentProps {
  blockId: string
  displayValue: string | number
  history?: number[]
  numericValue: number
  isLoading: boolean
  hasData: boolean
  valueColor: string
  sublabel?: string
}

export function TrendStatContent({
  blockId,
  displayValue,
  history,
  numericValue,
  isLoading,
  hasData,
  valueColor,
  sublabel,
}: TrendStatContentProps) {
  const prevValue = history && history.length >= 2 ? history[history.length - 2] : undefined
  const delta = prevValue !== undefined ? numericValue - prevValue : undefined
  const deltaPercent = prevValue !== undefined && prevValue !== 0
    ? Math.round(((numericValue - prevValue) / prevValue) * 100)
    : undefined

  return (
    <>
      <div className="flex items-baseline gap-2">
        <div
          data-testid={`stat-block-${blockId}-count`}
          className={cn('text-2xl font-bold', isLoading ? 'text-muted-foreground/30' : valueColor)}
        >
          {displayValue}
        </div>
        {delta !== undefined && (
          <span className={cn('text-sm font-medium', delta > 0 ? 'text-red-400' : delta < 0 ? 'text-green-400' : 'text-muted-foreground')}>
            {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'}
            {deltaPercent !== undefined && ` ${Math.abs(deltaPercent)}%`}
          </span>
        )}
      </div>
      {delta === undefined && !isLoading && hasData && (
        <div className="mt-0.5 text-2xs text-muted-foreground/50">Collecting…</div>
      )}
      {sublabel && <div className="mt-1 text-xs text-muted-foreground">{wrapAbbreviations(sublabel)}</div>}
    </>
  )
}

interface StatTileProps {
  block: StatBlockConfig
  data: StatBlockValue
  hasData: boolean
  isLoading?: boolean
  history?: number[]
  onDisplayModeChange?: (mode: StatDisplayMode) => void
}

export const StatTile = memo(function StatTile({
  block,
  data,
  hasData,
  isLoading,
  history,
  onDisplayModeChange,
}: StatTileProps) {
  const { t } = useTranslation()
  const IconComponent = ICONS[block.icon] || Server
  const colorClass = COLOR_CLASSES[block.color] || 'text-foreground'
  const valueColor = VALUE_COLORS[block.id] || 'text-foreground'
  const hexColor = block.color === 'primary' ? 'hsl(var(--primary))' : (COLOR_HEX[block.color] || 'hsl(var(--primary))')
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

  const numericValue = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue))
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
  const progressDisplayValue = isPercentageStat && !String(displayValue).includes('%') ? `${displayValue}%` : displayValue
  const progressMaxLabel = hasExplicitMax && !isPercentageStat
    ? (data.format ? data.format(data.max) : data.max)
    : null

  const groundtruthFields = {
    ...(data.groundtruthField ? { [data.groundtruthField]: rawValue } : {}),
    ...(data.groundtruthFields || {}),
  }

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
      data-testid={`stat-block-${block.id}`}
      className={cn(
        'group relative min-h-[100px] min-w-0 rounded-lg border border-border/50 bg-card p-4 text-card-foreground shadow-sm transition-colors',
        isLoading && 'animate-pulse',
        isClickable && 'cursor-pointer hover:bg-accent/40',
        isDemo && 'border-yellow-500/30 bg-yellow-500/5 shadow-[0_0_12px_rgba(234,179,8,0.15)]',
      )}
      onClick={() => isClickable && data.onClick?.()}
      {...(isClickable
        ? {
            role: 'button' as const,
            tabIndex: 0,
            onKeyDown: (event: KeyboardEvent) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                data.onClick?.()
              }
            },
          }
        : {})}
    >
      {Object.entries(groundtruthFields).map(([field, value]) => (
        <span key={field} className="sr-only" data-groundtruth-field={field}>
          {value ?? ''}
        </span>
      ))}

      {isDemo && (
        <span className="absolute -right-1 -top-1" title="Demo data">
          <FlaskConical className="h-3.5 w-3.5 text-yellow-400/70" />
        </span>
      )}

      {!isLoading && onDisplayModeChange && (
        <StatBlockModePicker
          currentMode={mode}
          availableModes={availableModes}
          onModeChange={onDisplayModeChange}
        />
      )}

      <div className="mb-2 flex min-w-0 items-start gap-2">
        <IconComponent className={cn('mt-0.5 h-5 w-5 shrink-0', iconClass)} />
        <span className={cn('min-w-0 truncate text-sm leading-tight', labelClass)} title={block.name}>
          {wrapAbbreviations(block.name)}
        </span>
      </div>

      {isLoading ? (
        <>
          <Skeleton variant="text" width="55%" height={34} className="mb-2" />
          <Skeleton variant="text" width="70%" height={12} />
        </>
      ) : effectiveMode === 'sparkline' && hasEnoughHistory && !isNaN(numericValue) ? (
        <SparklineStatContent
          blockId={block.id}
          displayValue={displayValue}
          history={history || []}
          hexColor={hexColor}
          isLoading={!!isLoading}
          valueColor={valueColor}
          sublabel={data.sublabel}
        />
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
          {data.sublabel && <div className="mt-1 text-center text-xs text-muted-foreground">{wrapAbbreviations(data.sublabel)}</div>}
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
          {data.sublabel && <div className="mt-1 text-center text-xs text-muted-foreground">{wrapAbbreviations(data.sublabel)}</div>}
        </>
      ) : effectiveMode === 'mini-bar' && !isNaN(progressNumericValue) ? (
        <>
          <div
            data-testid={`stat-block-${block.id}-count`}
            className={cn('text-2xl font-bold', isLoading ? 'text-muted-foreground/30' : valueColor)}
          >
            {progressDisplayValue}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div
              data-testid={`stat-block-${block.id}-progress`}
              className="flex-1 overflow-hidden rounded-full bg-secondary"
              style={{ height: MINI_BAR_HEIGHT_PX }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%`, backgroundColor: hexColor }}
              />
            </div>
            {progressPercentLabel && (
              <span data-testid={`stat-block-${block.id}-scale`} className="shrink-0 text-2xs text-muted-foreground">
                {progressPercentLabel}
              </span>
            )}
          </div>
          {data.sublabel && (
            <div className="mt-1 text-xs text-muted-foreground">
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
          {data.sublabel && <div className="mt-1 text-center text-xs text-muted-foreground">{wrapAbbreviations(data.sublabel)}</div>}
        </>
      ) : effectiveMode === 'trend' && !isNaN(numericValue) ? (
        <TrendStatContent
          blockId={block.id}
          displayValue={displayValue}
          history={history}
          numericValue={numericValue}
          isLoading={!!isLoading}
          hasData={hasData}
          valueColor={valueColor}
          sublabel={data.sublabel}
        />
      ) : effectiveMode === 'stacked-bar' && !isNaN(progressNumericValue) ? (
        <>
          <div
            data-testid={`stat-block-${block.id}-count`}
            className={cn('text-2xl font-bold', isLoading ? 'text-muted-foreground/30' : valueColor)}
          >
            {progressDisplayValue}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div
              data-testid={`stat-block-${block.id}-progress`}
              className="flex h-full flex-1 overflow-hidden rounded-full bg-secondary"
              style={{ height: MINI_BAR_HEIGHT_PX }}
            >
              <div
                className="h-full transition-all duration-500"
                style={{ width: `${progressPercent}%`, backgroundColor: hexColor }}
              />
            </div>
            {progressPercentLabel && (
              <span data-testid={`stat-block-${block.id}-scale`} className="shrink-0 text-2xs text-muted-foreground">
                {progressPercentLabel}
              </span>
            )}
          </div>
          {data.sublabel && (
            <div className="mt-1 text-xs text-muted-foreground">
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
            <div
              data-testid={`stat-block-${block.id}-count`}
              className={cn('text-3xl font-bold', useHeatmapHighContrastText ? HEATMAP_HIGH_CONTRAST_TEXT_CLASSES.value : valueColor)}
            >
              {displayValue}
            </div>
            {data.sublabel && (
              <div
                className={cn(
                  'min-w-0 truncate text-xs',
                  useHeatmapHighContrastText ? HEATMAP_HIGH_CONTRAST_TEXT_CLASSES.sublabel : 'text-muted-foreground',
                )}
                title={data.sublabel}
              >
                {wrapAbbreviations(data.sublabel)}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div
            data-testid={`stat-block-${block.id}-count`}
            className={
              isEmptyValue
                ? 'text-sm font-medium text-muted-foreground/70'
                : cn('text-3xl font-bold', isLoading ? 'text-muted-foreground/30' : valueColor)
            }
          >
            {displayValue}
          </div>
          {mode === 'sparkline' && !hasEnoughHistory && !isLoading && hasData && !data.sublabel && (
            <div className="mt-0.5 text-2xs text-muted-foreground/50">Building trend…</div>
          )}
          {isEmptyValue && (
            <div className="mt-0.5 text-2xs text-muted-foreground/70">
              {t('statsOverview.emptyHint', 'Connect a cluster to populate')}{' '}
              <Link to={ROUTES.LOGIN} className="underline underline-offset-2 transition-colors hover:text-foreground">
                {t('statsOverview.setupWizard', 'Open setup wizard')}
              </Link>
            </div>
          )}
          {data.sublabel && (
            <div className="min-w-0 truncate text-xs text-muted-foreground" title={data.sublabel}>
              {wrapAbbreviations(data.sublabel)}
            </div>
          )}
        </>
      )}
    </div>
  )
})

interface StatsOverviewHeaderProps {
  collapsible: boolean
  isExpanded: boolean
  onToggleExpanded: () => void
  resolvedTitle: string
  isDemoData: boolean
  showConfigButton: boolean
  onOpenConfig: () => void
  configureTitle: string
  demoTooltip: string
  demoLabel: string
}

export function StatsOverviewHeader({
  collapsible,
  isExpanded,
  onToggleExpanded,
  resolvedTitle,
  isDemoData,
  showConfigButton,
  onOpenConfig,
  configureTitle,
  demoTooltip,
  demoLabel,
}: StatsOverviewHeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {collapsible ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleExpanded}
            className="font-medium"
            icon={<Activity className="h-4 w-4" />}
            iconRight={isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          >
            {resolvedTitle}
          </Button>
        ) : (
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span>{resolvedTitle}</span>
          </div>
        )}

        {isDemoData && (
          <StatusBadge
            color="yellow"
            size="xs"
            variant="outline"
            rounded="full"
            icon={<FlaskConical className="h-2.5 w-2.5" />}
            title={demoTooltip}
          >
            {demoLabel}
          </StatusBadge>
        )}
      </div>

      {showConfigButton && isExpanded && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenConfig}
          className="p-1"
          title={configureTitle}
          icon={<Settings className="h-4 w-4" />}
        />
      )}
    </div>
  )
}

export function getStatsGridColumns(visibleBlockCount: number): string {
  if (visibleBlockCount <= 4) {
    return 'grid-cols-2 md:grid-cols-4'
  }

  if (visibleBlockCount <= 5) {
    return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
  }

  if (visibleBlockCount === 6) {
    return 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6'
  }

  return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
}
