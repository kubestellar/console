/**
 * StatsRuntime - Renders stat blocks from declarative definitions
 *
 * This is the foundation for the YAML-based Stat Block Builder.
 * Stats are defined declaratively and this runtime interprets
 * and renders them with consistent behavior.
 *
 * Future: definitions will be loaded from YAML files like:
 *
 * ```yaml
 * type: clusters
 * title: Cluster Stats
 *
 * blocks:
 *   - id: clusters
 *     label: Clusters
 *     icon: Server
 *     color: purple
 *     valueSource:
 *       field: clusterCount
 *     onClick:
 *       action: drill
 *       target: allClusters
 *     tooltip: Total number of clusters
 *
 *   - id: healthy
 *     label: Healthy
 *     icon: CheckCircle2
 *     color: green
 *     valueSource:
 *       field: healthyCount
 * ```
 */

import { useState, useMemo } from 'react'
import { getIcon } from '../icons'
import { ChevronDown, ChevronRight, Activity, Settings } from 'lucide-react'
import {
  StatsDefinition,
  StatsRuntimeProps,
  StatBlockDefinition,
  StatBlockValue,
  StatValueGetter,
  COLOR_CLASSES,
  VALUE_COLORS,
  formatValue } from './types'
import { getResponsiveGridCols } from './gridUtils'

// ============================================================================
// Stats Registry
// ============================================================================

const statsRegistry = new Map<string, StatsDefinition>()

export function registerStats(definition: StatsDefinition) {
  statsRegistry.set(definition.type, definition)
}

export function getStatsDefinition(type: string): StatsDefinition | undefined {
  return statsRegistry.get(type)
}

export function getAllStatsDefinitions(): StatsDefinition[] {
  return Array.from(statsRegistry.values())
}

/** Unregister a stats definition */
export function unregisterStats(type: string): boolean {
  const result = statsRegistry.delete(type)
  if (result) valueGetterRegistry.delete(type)
  return result
}

/** Get all registered stats type identifiers */
export function getAllStatsTypes(): string[] {
  return Array.from(statsRegistry.keys())
}

// ============================================================================
// Value Getter Registry
// ============================================================================

const valueGetterRegistry = new Map<string, StatValueGetter>()

export function registerStatValueGetter(statsType: string, getter: StatValueGetter) {
  valueGetterRegistry.set(statsType, getter)
}

// ============================================================================
// Icon Resolver
// ============================================================================

// ============================================================================
// StatBlock Component
// ============================================================================

interface StatBlockProps {
  block: StatBlockDefinition
  value: StatBlockValue
  hasData: boolean
}

function StatBlock({ block, value, hasData }: StatBlockProps) {
  const IconComponent = getIcon(block.icon)
  const colorClass = COLOR_CLASSES[block.color] || 'text-foreground'
  const valueColorClass = VALUE_COLORS[block.id] || value.color ? COLOR_CLASSES[value.color!] : 'text-foreground'
  const isClickable = value.isClickable !== false && !!value.onClick

  const displayValue = hasData ? value.value : '-'

  return (
    <div
      className={`glass p-4 rounded-lg ${isClickable ? 'cursor-pointer hover:bg-secondary/50' : ''} transition-colors`}
      onClick={() => isClickable && value.onClick?.()}
      title={block.tooltip || value.tooltip}
    >
      <div className="flex items-center gap-2 mb-2">
        <IconComponent className={`w-5 h-5 shrink-0 ${colorClass}`} />
        <span className="text-sm text-muted-foreground truncate">{block.label}</span>
      </div>
      <div className={`text-3xl font-bold ${valueColorClass}`}>{displayValue}</div>
      {value.sublabel && (
        <div className="text-xs text-muted-foreground">{value.sublabel}</div>
      )}
    </div>
  )
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function StatBlockSkeleton() {
  return (
    <div className="glass p-4 rounded-lg animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-full bg-secondary" />
        <div className="h-4 w-20 bg-secondary rounded" />
      </div>
      <div className="h-9 w-16 bg-secondary rounded mb-1" />
      <div className="h-3 w-24 bg-secondary rounded" />
    </div>
  )
}

// ============================================================================
// StatsRuntime Component
// ============================================================================

export function StatsRuntime({
  definition,
  data,
  getStatValue: customGetStatValue,
  hasData = true,
  isLoading = false,
  collapsible = true,
  defaultExpanded = true,
  collapsedStorageKey,
  showConfigButton = true,
  className = '' }: StatsRuntimeProps) {
  const {
    type,
    title = 'Stats Overview',
    blocks,
    defaultCollapsed = false,
    grid } = definition

  // Get visible blocks (respect visible flag)
  const visibleBlocks = blocks.filter((b) => b.visible !== false)

  // Manage collapsed state with localStorage persistence.
  // The storage key says "collapsed", so the stored value represents
  // collapsed state (true = collapsed). Previously this file stored
  // `isExpanded` under the "-stats-collapsed" key, which meant the toggle
  // read back inverted after a reload and sibling components
  // (UnifiedStatsSection) that DID store the collapsed sense disagreed on
  // the same key. Read and write both now use the collapsed sense.
  const storageKey = collapsedStorageKey || `kubestellar-${type}-stats-collapsed`
  const [isExpanded, setIsExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved !== null) {
        const parsed = JSON.parse(saved) as boolean
        // parsed represents COLLAPSED state
        return !parsed
      }
      return defaultCollapsed ? false : defaultExpanded
    } catch {
      return defaultCollapsed ? false : defaultExpanded
    }
  })

  const toggleExpanded = () => {
    const newValue = !isExpanded
    setIsExpanded(newValue)
    try {
      // Store COLLAPSED state to match the storage-key semantics.
      localStorage.setItem(storageKey, JSON.stringify(!newValue))
    } catch {
      // Ignore storage errors
    }
  }

  // Get stat value getter
  const getStatValue = useMemo(() => {
    if (customGetStatValue) return customGetStatValue

    // Try registry
    const registeredGetter = valueGetterRegistry.get(type)
    if (registeredGetter) {
      return (blockId: string) => registeredGetter(blockId, data)
    }

    // Default: extract from data using valueSource
    return (blockId: string): StatBlockValue => {
      const block = blocks.find((b) => b.id === blockId)
      if (!block?.valueSource || !data) {
        return { value: '-' }
      }

      const { field, format, prefix = '', suffix = '', sublabelField } = block.valueSource
      const rawValue = (data as Record<string, unknown>)[field]

      let formattedValue: string | number
      if (typeof rawValue === 'number') {
        formattedValue = format ? formatValue(rawValue, format) : rawValue
      } else {
        formattedValue = String(rawValue ?? '-')
      }

      const sublabel = sublabelField
        ? String((data as Record<string, unknown>)[sublabelField] ?? '')
        : undefined

      return {
        value: `${prefix}${formattedValue}${suffix}`,
        sublabel }
    }
  }, [customGetStatValue, type, data, blocks])

  // Dynamic grid columns based on visible blocks
  // Mobile: max 2 columns, tablet+: responsive based on count
  const gridCols = (() => {
    if (grid?.columns) {
      return `grid-cols-2 md:grid-cols-${grid.columns}`
    }

    return getResponsiveGridCols(visibleBlocks.length)
  })()

  return (
    <div className={`mb-6 ${className}`}>
      {/* Header with collapse toggle */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {collapsible ? (
            <button
              onClick={toggleExpanded}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Activity className="w-4 h-4" />
              <span>{title}</span>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Activity className="w-4 h-4" />
              <span>{title}</span>
            </div>
          )}

        </div>
        {showConfigButton && isExpanded && (
          <button
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
            visibleBlocks.map((block) => (
              <StatBlockSkeleton key={block.id} />
            ))
          ) : (
            // Real data
            visibleBlocks.map((block) => (
              <StatBlock
                key={block.id}
                block={block}
                value={getStatValue(block.id)}
                hasData={hasData}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// YAML Parser (future implementation)
// ============================================================================

export function parseStatsYAML(_yaml: string): StatsDefinition {
  // YAML parsing intentionally not implemented - use registerStats() with JS objects
  // If YAML config becomes a requirement, add js-yaml library and implement parser here
  throw new Error('YAML parsing not yet implemented. Use registerStats() with JS objects.')
}

// ============================================================================
// Preset Helpers
// ============================================================================

/**
 * Create a simple stat block definition
 */
export function createStatBlock(
  id: string,
  label: string,
  icon: string,
  color: StatBlockDefinition['color'],
  options?: Partial<StatBlockDefinition>
): StatBlockDefinition {
  return {
    id,
    label,
    icon,
    color,
    visible: true,
    ...options }
}

/**
 * Create a stats definition from blocks
 */
export function createStatsDefinition(
  type: string,
  blocks: StatBlockDefinition[],
  options?: Partial<StatsDefinition>
): StatsDefinition {
  return {
    type,
    blocks,
    ...options }
}
