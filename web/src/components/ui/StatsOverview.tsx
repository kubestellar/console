import { useState } from 'react'
import {
  Server, CheckCircle2, XCircle, WifiOff, Box, Cpu, MemoryStick, HardDrive, Zap, Layers,
  FolderOpen, AlertCircle, AlertTriangle, AlertOctagon, Package, Ship, Settings, Clock,
  MoreHorizontal, Database, Workflow, Globe, Network, ArrowRightLeft, CircleDot,
  ShieldAlert, ShieldOff, User, Info, Percent, ClipboardList, Sparkles, Activity,
  List, DollarSign, ChevronDown, ChevronRight, FlaskConical,
} from 'lucide-react'
import { StatBlockConfig, DashboardStatsType } from './StatsBlockDefinitions'
import { StatsConfigModal, useStatsConfig } from './StatsConfig'
import { Skeleton } from './Skeleton'

// Icon mapping for dynamic rendering
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Server, CheckCircle2, XCircle, WifiOff, Box, Cpu, MemoryStick, HardDrive, Zap, Layers,
  FolderOpen, AlertCircle, AlertTriangle, AlertOctagon, Package, Ship, Settings, Clock,
  MoreHorizontal, Database, Workflow, Globe, Network, ArrowRightLeft, CircleDot,
  ShieldAlert, ShieldOff, User, Info, Percent, ClipboardList, Sparkles, Activity,
  List, DollarSign,
}

// Color mapping for dynamic rendering
const COLOR_CLASSES: Record<string, string> = {
  purple: 'text-purple-400',
  green: 'text-green-400',
  orange: 'text-orange-400',
  yellow: 'text-yellow-400',
  cyan: 'text-cyan-400',
  blue: 'text-blue-400',
  red: 'text-red-400',
  gray: 'text-gray-400',
}

// Value color mapping for specific stat types
const VALUE_COLORS: Record<string, string> = {
  healthy: 'text-green-400',
  passing: 'text-green-400',
  deployed: 'text-green-400',
  bound: 'text-green-400',
  normal: 'text-blue-400',
  unhealthy: 'text-orange-400',
  warning: 'text-yellow-400',
  pending: 'text-yellow-400',
  unreachable: 'text-yellow-400',
  critical: 'text-red-400',
  failed: 'text-red-400',
  failing: 'text-red-400',
  errors: 'text-red-400',
  issues: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-blue-400',
  privileged: 'text-red-400',
  root: 'text-orange-400',
}

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
}

interface StatBlockProps {
  block: StatBlockConfig
  data: StatBlockValue
  hasData: boolean
}

function StatBlock({ block, data, hasData }: StatBlockProps) {
  const IconComponent = ICONS[block.icon] || Server
  const colorClass = COLOR_CLASSES[block.color] || 'text-foreground'
  const valueColor = VALUE_COLORS[block.id] || 'text-foreground'
  const isClickable = data.isClickable !== false && !!data.onClick
  const isDemo = data.isDemo === true

  const displayValue = hasData ? data.value : '-'

  return (
    <div
      className={`relative glass p-4 rounded-lg ${isClickable ? 'cursor-pointer hover:bg-secondary/50' : ''} ${isDemo ? 'border border-yellow-500/30 bg-yellow-500/5 shadow-[0_0_12px_rgba(234,179,8,0.15)]' : ''} transition-colors`}
      onClick={() => isClickable && data.onClick?.()}
    >
      {isDemo && (
        <span className="absolute -top-1 -right-1" title="Demo data">
          <FlaskConical className="w-3.5 h-3.5 text-yellow-400/50" />
        </span>
      )}
      <div className="flex items-center gap-2 mb-2">
        <IconComponent className={`w-5 h-5 shrink-0 ${colorClass}`} />
        <span className="text-sm text-muted-foreground truncate">{block.name}</span>
      </div>
      <div className={`text-3xl font-bold ${valueColor}`}>{displayValue}</div>
      {data.sublabel && (
        <div className="text-xs text-muted-foreground">{data.sublabel}</div>
      )}
    </div>
  )
}

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
  title = 'Stats Overview',
  showConfigButton = true,
  isDemoData = false,
}: StatsOverviewProps) {
  const { blocks, saveBlocks, visibleBlocks, defaultBlocks } = useStatsConfig(dashboardType)
  const [showConfig, setShowConfig] = useState(false)

  // Manage collapsed state with localStorage persistence
  const storageKey = collapsedStorageKey || `kubestellar-${dashboardType}-stats-collapsed`
  const [isExpanded, setIsExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return saved !== null ? JSON.parse(saved) : defaultExpanded
    } catch {
      return defaultExpanded
    }
  })

  const toggleExpanded = () => {
    const newValue = !isExpanded
    setIsExpanded(newValue)
    try {
      localStorage.setItem(storageKey, JSON.stringify(newValue))
    } catch {
      // Ignore storage errors
    }
  }

  // Dynamic grid columns based on visible blocks
  const gridCols = visibleBlocks.length <= 4 ? 'grid-cols-2 md:grid-cols-4' :
    visibleBlocks.length <= 5 ? 'grid-cols-5' :
    visibleBlocks.length <= 6 ? 'grid-cols-3 md:grid-cols-6' :
    visibleBlocks.length <= 8 ? 'grid-cols-4 lg:grid-cols-8' :
    'grid-cols-5 lg:grid-cols-10'

  return (
    <div className={`mb-6 ${className}`}>
      {/* Header with collapse toggle and settings */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {collapsible ? (
            <button
              onClick={toggleExpanded}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Activity className="w-4 h-4" />
              <span>{title}</span>
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Activity className="w-4 h-4" />
              <span>{title}</span>
            </div>
          )}
          {isDemoData && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              <FlaskConical className="w-2.5 h-2.5" />
              Demo
            </span>
          )}
          {lastUpdated && (
            <span className="text-xs text-muted-foreground/60">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
        {showConfigButton && isExpanded && (
          <button
            onClick={() => setShowConfig(true)}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors"
            title="Configure stats"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Stats grid */}
      {(!collapsible || isExpanded) && (
        <div className={`grid ${gridCols} gap-4`}>
          {isLoading ? (
            // Loading skeletons
            <>
              {visibleBlocks.map((block) => (
                <div key={block.id} className="glass p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton variant="circular" width={20} height={20} />
                    <Skeleton variant="text" width={80} height={16} />
                  </div>
                  <Skeleton variant="text" width={60} height={36} className="mb-1" />
                  <Skeleton variant="text" width={100} height={12} />
                </div>
              ))}
            </>
          ) : (
            // Real data
            <>
              {visibleBlocks.map(block => {
                const data = getStatValue(block.id)
                // Handle stats from other dashboards gracefully
                const safeData = data?.value !== undefined ? data : { value: '-', sublabel: 'Not available' }
                return (
                  <StatBlock
                    key={block.id}
                    block={block}
                    data={safeData}
                    hasData={hasData && data?.value !== undefined}
                  />
                )
              })}
            </>
          )}
        </div>
      )}

      {/* Config modal */}
      <StatsConfigModal
        isOpen={showConfig}
        onClose={() => setShowConfig(false)}
        blocks={blocks}
        onSave={saveBlocks}
        defaultBlocks={defaultBlocks}
        title={`Configure ${title}`}
      />
    </div>
  )
}

/**
 * Helper to format large numbers (1000 -> 1K, 1000000 -> 1M)
 */
export function formatStatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return value.toString()
}

/**
 * Helper to format memory/storage values
 */
export function formatMemoryValue(gb: number): string {
  if (gb >= 1024) {
    return `${(gb / 1024).toFixed(1)} TB`
  }
  return `${Math.round(gb)} GB`
}

/**
 * Helper to format percentage values
 */
export function formatPercentage(value: number): string {
  return `${Math.round(value)}%`
}

/**
 * Helper to format currency values
 */
export function formatCurrency(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`
  }
  return `$${value.toFixed(2)}`
}
