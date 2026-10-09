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
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Activity, Settings } from 'lucide-react'
import {
  StatsRuntimeProps,
  StatBlockValue,
  formatValue } from './types'
import { getResponsiveGridCols } from './gridUtils'
import { getStatValueGetter } from './statsRegistry'
import { StatBlock, StatBlockSkeleton } from './StatBlock'

export {
  registerStats,
  getStatsDefinition,
  getAllStatsDefinitions,
  unregisterStats,
  getAllStatsTypes,
  registerStatValueGetter,
} from './statsRegistry'
export { parseStatsYAML, createStatBlock, createStatsDefinition } from './statsHelpers'

// ============================================================================
// StatsRuntime Component
// ============================================================================

export function StatsRuntime({
  definition,
  data,
  getStatValue: customGetStatValue,
  hasData = true,
  isLoading = false,
  lastUpdated: _lastUpdated = null,
  collapsible = true,
  defaultExpanded = true,
  collapsedStorageKey,
  showConfigButton = true,
  className = '' }: StatsRuntimeProps) {
  const { t } = useTranslation('common')
  const {
    type,
    title = 'Stats Overview',
    blocks,
    defaultCollapsed = false,
    grid } = definition

  const defaultIsExpanded = defaultCollapsed ? false : defaultExpanded

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
  const [collapsedState, setCollapsedState] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved !== null) {
        const parsed = JSON.parse(saved) as boolean
        return {
          isExpanded: !parsed,
          error: null as string | null,
        }
      }
      return {
        isExpanded: defaultIsExpanded,
        error: null as string | null,
      }
    } catch (error) {
      console.error('Failed to restore stats runtime collapsed state', error)
      return {
        isExpanded: defaultIsExpanded,
        error: t('errors.storageRestoreFailed'),
      }
    }
  })
  const { isExpanded, error: storageError } = collapsedState

  const toggleExpanded = () => {
    setCollapsedState((prev) => {
      const newValue = !prev.isExpanded
      try {
        // Store COLLAPSED state to match the storage-key semantics.
        localStorage.setItem(storageKey, JSON.stringify(!newValue))
        return {
          isExpanded: newValue,
          error: null,
        }
      } catch (error) {
        console.error('Failed to persist stats runtime collapsed state', error)
        return {
          isExpanded: newValue,
          error: t('errors.storagePersistFailed'),
        }
      }
    })
  }

  // Get stat value getter
  const getStatValue = useMemo(() => {
    if (customGetStatValue) return customGetStatValue

    // Try registry
    const registeredGetter = getStatValueGetter(type)
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
              type="button"
              onClick={toggleExpanded}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${title}`}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Activity className="w-4 h-4" aria-hidden="true" />
              <span>{title}</span>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Activity className="w-4 h-4" />
              <span>{title}</span>
            </div>
          )}

        </div>
        <div className="flex items-center gap-2">
          {showConfigButton && isExpanded && (
            <button
              type="button"
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors"
              aria-label="Configure stats"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {storageError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {storageError}
        </div>
      )}

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
