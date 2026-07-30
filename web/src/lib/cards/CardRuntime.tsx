/**
 * CardRuntime - Renders cards from declarative definitions
 *
 * This is the foundation for the YAML-based Card Builder.
 * Cards are defined declaratively and this runtime interprets
 * and renders them with consistent behavior.
 *
 * Future: definitions will be loaded from YAML files like:
 *
 * ```yaml
 * type: pod_issues
 * title: Pod Issues
 * category: workloads
 * visualization: table
 * dataSource:
 *   hook: usePodIssues
 * filters:
 *   - field: cluster
 *     type: select
 *   - field: search
 *     type: text
 *     searchFields: [name, namespace, status]
 * columns:
 *   - field: name
 *     header: Pod
 *   - field: status
 *     header: Status
 *     render: statusBadge
 * drillDown:
 *   action: drillToPod
 *   params: [cluster, namespace, name]
 * emptyState:
 *   icon: CheckCircle
 *   title: All pods healthy
 *   variant: success
 * ```
 */

import { ReactNode, useState } from 'react'
import { getIcon } from '../icons'
import { CardDefinition, CardColumnDefinition } from './types'
import { useCardData, SortDirection } from './cardHooks'
import {
  CardSkeleton,
  CardEmptyState,
  CardErrorState,
  CardSearchInput,
  CardClusterFilter,
  CardClusterIndicator,
  CardHeader,
  CardListItem,
  CardStatusBadge } from './CardComponents'
import { CardControls } from '../../components/ui/CardControls'
import { Pagination } from '../../components/ui/Pagination'
import { RefreshButton } from '../../components/ui/RefreshIndicator'
import { ClusterBadge } from '../../components/ui/ClusterBadge'

// ============================================================================
// Data Hook Registry - Maps hook names to actual hooks
// ============================================================================

type DataHookResult<T> = {
  data: T[]
  isLoading: boolean
  isRefreshing: boolean
  error?: string
  refetch: () => void
  isFailed?: boolean
  consecutiveFailures?: number
  lastRefresh?: Date
}

// This will be populated by registerDataHook()
const dataHookRegistry = new Map<string, () => DataHookResult<unknown>>()

export function registerDataHook<T>(name: string, hook: () => DataHookResult<T>) {
  dataHookRegistry.set(name, hook as () => DataHookResult<unknown>)
}

// ============================================================================
// Drill Action Registry - Maps action names to functions
// ============================================================================

type DrillAction = (...args: unknown[]) => void
const drillActionRegistry = new Map<string, DrillAction>()

export function registerDrillAction(name: string, action: DrillAction) {
  drillActionRegistry.set(name, action)
}

// ============================================================================
// Renderer Registry - Maps render names to components
// ============================================================================

type CellRenderer<T = unknown> = (value: unknown, item: T, column: CardColumnDefinition) => ReactNode
const rendererRegistry = new Map<string, CellRenderer>()

export function registerRenderer<T>(name: string, renderer: CellRenderer<T>) {
  rendererRegistry.set(name, renderer as CellRenderer)
}

// Register default renderers
registerRenderer('statusBadge', (value) => {
  const status = String(value).toLowerCase()
  let variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' = 'neutral'
  if (status.includes('running') || status.includes('healthy') || status.includes('ready')) {
    variant = 'success'
  } else if (status.includes('pending') || status.includes('waiting')) {
    variant = 'warning'
  } else if (status.includes('failed') || status.includes('error') || status.includes('crash')) {
    variant = 'error'
  }
  return <CardStatusBadge status={String(value)} variant={variant} />
})

registerRenderer('clusterBadge', (value) => (
  <ClusterBadge cluster={String(value || 'default')} />
))

registerRenderer('number', (value) => (
  <span className="font-mono text-sm">{Number(value).toLocaleString()}</span>
))

registerRenderer('percentage', (value) => (
  <span className="font-mono text-sm">{Number(value).toFixed(1)}%</span>
))

// Allowlist for column alignment values — keeps unvalidated user config from
// producing garbage Tailwind classes like "text-foo" that silently drop styles.
const VALID_ALIGN_VALUES = ['left', 'center', 'right'] as const
type ValidAlign = (typeof VALID_ALIGN_VALUES)[number]
const DEFAULT_ALIGN: ValidAlign = 'left'
function normalizeAlign(align: string | undefined): ValidAlign {
  return (VALID_ALIGN_VALUES as readonly string[]).includes(align ?? '')
    ? (align as ValidAlign)
    : DEFAULT_ALIGN
}

// ============================================================================
// CardRuntime Props
// ============================================================================

export interface CardRuntimeProps {
  /** Card definition (from YAML or registry) */
  definition: CardDefinition
  /** Instance-specific config overrides */
  config?: Record<string, unknown>
  /** Custom title override */
  title?: string
}

// ============================================================================
// CardRuntime Component
// ============================================================================

// Noop data hook used when the requested hook is not registered.
// This ensures hooks are called unconditionally to satisfy the Rules of Hooks.
const NOOP_HOOK_RESULT: DataHookResult<unknown> = {
  data: [],
  isLoading: false,
  isRefreshing: false,
  error: undefined,
  refetch: () => {} }
const noopDataHook = () => NOOP_HOOK_RESULT

export function CardRuntime({ definition, config: _config, title }: CardRuntimeProps) {
  const {
    type,
    title: defTitle,
    visualization,
    dataSource,
    filters: filterDefs,
    columns,
    drillDown,
    emptyState,
    loadingState } = definition

  // Rules of Hooks require the same hook be called every render for the life
  // of this component instance. If we re-read dataHookRegistry on each render,
  // a hook that gets registered (or unregistered) between renders would change
  // which function is called — and different registered hooks call different
  // numbers of inner hooks, which violates the Rules of Hooks and crashes
  // React. Snapshot the resolved hook on first render via lazy useState so the
  // same function is called for the entire component lifetime. If callers need
  // to pick up a newly-registered hook, they should remount CardRuntime with a
  // new `key` prop (e.g. key={dataSource.hook}).
  const [{ useDataHook, hookMissing }] = useState(() => {
    const resolved = dataHookRegistry.get(dataSource.hook)
    return {
      useDataHook: resolved || noopDataHook,
      hookMissing: !resolved,
    }
  })

  // Call the data hook
  const {
    data: rawData,
    isLoading: hookLoading,
    isRefreshing,
    error,
    refetch,
    isFailed,
    consecutiveFailures,
    lastRefresh } = useDataHook()

  // Build filter config from definition
  const filterConfig = (() => {
    const searchFields: string[] = []
    let clusterField: string | undefined
    let statusField: string | undefined

    filterDefs?.forEach(f => {
      if (f.type === 'text' && f.searchFields) {
        searchFields.push(...f.searchFields)
      }
      if (f.field === 'cluster') clusterField = 'cluster'
      if (f.field === 'status') statusField = 'status'
    })

    return {
      searchFields: searchFields.length > 0 ? searchFields : ['name', 'namespace'],
      clusterField,
      statusField }
  })()

  // Build sort config from columns
  const sortConfig = (() => {
    const sortableColumns = columns?.filter(c => c.sortable !== false) || []
    const comparators: Record<string, (a: unknown, b: unknown) => number> = {}

    sortableColumns.forEach(col => {
      comparators[col.field] = (a: unknown, b: unknown) => {
        const aVal = (a as Record<string, unknown>)[col.field]
        const bVal = (b as Record<string, unknown>)[col.field]
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return aVal - bVal
        }
        return String(aVal || '').localeCompare(String(bVal || ''))
      }
    })

    return {
      defaultField: sortableColumns[0]?.field || 'name',
      defaultDirection: 'asc' as SortDirection,
      comparators }
  })()

  // Use the card data hook
  const cardData = useCardData(rawData as Record<string, unknown>[], {
    filter: filterConfig as Parameters<typeof useCardData>[1]['filter'],
    sort: sortConfig,
    defaultLimit: 5 })

  const {
    items,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters,
    sorting } = cardData

  // Build sort options from columns (must be before any early returns to satisfy Rules of Hooks)
  const sortOptions = (columns?.filter(c => c.sortable !== false) || []).map(c => ({
      value: c.field,
      label: c.header }))

  // If the data hook was not registered, render an error after all hooks have been called
  if (hookMissing) {
    return (
      <CardErrorState
        error={`Data hook "${dataSource.hook}" not registered for card "${type}"`}
      />
    )
  }

  // Only show skeleton when no cached data exists
  const isLoading = hookLoading && rawData.length === 0
  const displayTitle = title || defTitle

  // Handle drill-down click
  const handleItemClick = (item: Record<string, unknown>) => {
    if (!drillDown) return

    const action = drillActionRegistry.get(drillDown.action)
    if (!action) {
      console.warn(`Drill action "${drillDown.action}" not registered`)
      return
    }

    const params = drillDown.params.map(p => item[p])
    const context = drillDown.context
      ? Object.fromEntries(
          Object.entries(drillDown.context).map(([k, v]) => [k, item[v] ?? v])
        )
      : undefined

    action(...params, context)
  }

  // Loading state
  if (isLoading) {
    return (
      <CardSkeleton
        rows={loadingState?.rows || 3}
        type={loadingState?.type || (visualization === 'table' ? 'table' : 'list')}
        showHeader={loadingState?.showHeader ?? true}
        showSearch={loadingState?.showSearch ?? filterDefs?.some(f => f.type === 'text')}
      />
    )
  }

  // Error state
  if (error && items.length === 0) {
    return <CardErrorState error={error} onRetry={refetch} />
  }

  // Empty state
  if (items.length === 0 && emptyState) {
    return (
      <CardEmptyState
        icon={getIcon(emptyState.icon)}
        title={emptyState.title}
        message={emptyState.message}
        variant={emptyState.variant}
      />
    )
  }

  // Render cell value
  const renderCell = (item: Record<string, unknown>, column: CardColumnDefinition) => {
    const value = item[column.field]

    if (column.render) {
      const renderer = rendererRegistry.get(column.render)
      if (renderer) {
        return renderer(value, item, column)
      }
    }

    return String(value ?? '')
  }

  // Render based on visualization type
  const renderContent = () => {
    switch (visualization) {
      case 'table':
        return (
          <div className="flex-1 overflow-auto scroll-enhanced">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {columns?.map(col => (
                    <th
                      key={col.field}
                      className={`px-2 py-1.5 text-xs font-medium text-muted-foreground text-${normalizeAlign(col.align)}`}
                      style={col.width ? { width: col.width } : undefined}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr
                    key={idx}
                    className={`border-b border-border/50 ${drillDown ? 'cursor-pointer hover:bg-secondary/50' : ''}`}
                    onClick={() => drillDown && handleItemClick(item)}
                  >
                    {columns?.map(col => (
                      <td
                        key={col.field}
                        className={`px-2 py-2 text-${normalizeAlign(col.align)}`}
                      >
                        {renderCell(item, col)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )

      case 'status':
      default:
        return (
          <div className="flex-1 space-y-2 overflow-y-auto scroll-enhanced min-h-card-content">
            {items.map((item, idx) => (
              <CardListItem
                key={idx}
                onClick={drillDown ? () => handleItemClick(item) : undefined}
                dataTour={idx === 0 ? 'drilldown' : undefined}
              >
                {columns?.slice(0, 3).map(col => (
                  <div key={col.field}>{renderCell(item, col)}</div>
                ))}
              </CardListItem>
            ))}
          </div>
        )
    }
  }

  return (
    <div className="h-full flex flex-col content-loaded">
      {/* Header */}
      <CardHeader
        title={displayTitle}
        count={totalItems}
        countVariant={totalItems > 0 ? 'default' : 'success'}
        extra={
          <CardClusterIndicator
            selectedCount={filters.localClusterFilter.length}
            totalCount={filters.availableClusters.length}
          />
        }
        controls={
          <>
            <CardClusterFilter
              availableClusters={filters.availableClusters}
              selectedClusters={filters.localClusterFilter}
              onToggle={filters.toggleClusterFilter}
              onClear={filters.clearClusterFilter}
              isOpen={filters.showClusterFilter}
              setIsOpen={filters.setShowClusterFilter}
              containerRef={filters.clusterFilterRef}
            />
            <CardControls
              limit={itemsPerPage}
              onLimitChange={setItemsPerPage}
              sortBy={sorting.sortBy}
              sortOptions={sortOptions}
              onSortChange={sorting.setSortBy}
              sortDirection={sorting.sortDirection}
              onSortDirectionChange={sorting.setSortDirection}
            />
            <RefreshButton
              isRefreshing={isRefreshing}
              isFailed={isFailed}
              consecutiveFailures={consecutiveFailures}
              lastRefresh={lastRefresh}
              onRefresh={refetch}
            />
          </>
        }
      />

      {/* Search (if text filter defined) */}
      {filterDefs?.some(f => f.type === 'text') && (
        <CardSearchInput
          value={filters.search}
          onChange={filters.setSearch}
          placeholder={filterDefs.find(f => f.type === 'text')?.placeholder || 'Search...'}
          className="mb-3"
        />
      )}

      {/* Content */}
      {renderContent()}

      {/* Pagination */}
      {needsPagination && itemsPerPage !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 1000}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Card Registry - Store card definitions
// ============================================================================

const cardDefinitionRegistry = new Map<string, CardDefinition>()

export function registerCard(definition: CardDefinition) {
  cardDefinitionRegistry.set(definition.type, definition)
}

export function getCardDefinition(type: string): CardDefinition | undefined {
  return cardDefinitionRegistry.get(type)
}

export function getAllCardDefinitions(): CardDefinition[] {
  return Array.from(cardDefinitionRegistry.values())
}

// ============================================================================
// YAML Parser (future implementation)
// ============================================================================

export function parseCardYAML(_yaml: string): CardDefinition {
  // YAML parsing intentionally not implemented - use registerCard() with JS objects
  // If YAML config becomes a requirement, add js-yaml library and implement parser here
  throw new Error('YAML parsing not yet implemented. Use registerCard() with JS objects.')
}
