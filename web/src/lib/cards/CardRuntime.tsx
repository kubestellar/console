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
 *
 * The non-React registries (data hooks, drill actions, renderers, card
 * definitions) and pure helper logic live under `./runtime/` so this file
 * stays focused on the React-facing `CardRuntime` component. Everything is
 * re-exported below to keep existing import sites unchanged.
 */

import { useState } from 'react'
import { getIcon } from '../icons'
import { CardDefinition, CardColumnDefinition } from './types'
import { useCardData } from './cardHooks'
import {
  CardSkeleton,
  CardEmptyState,
  CardErrorState,
  CardSearchInput,
  CardClusterFilter,
  CardClusterIndicator,
  CardHeader } from './CardComponents'
import { CardControls } from '../../components/ui/CardControls'
import { Pagination } from '../../components/ui/Pagination'
import { RefreshButton } from '../../components/ui/RefreshIndicator'
import { dataHookRegistry, noopDataHook } from './runtime/dataHookRegistry'
import { drillActionRegistry } from './runtime/drillActionRegistry'
import { rendererRegistry } from './runtime/rendererRegistry'
import { buildFilterConfig, buildSortConfig } from './runtime/buildRuntimeConfig'
import { CardRuntimeTable } from './runtime/CardRuntimeTable'
import { CardRuntimeList } from './runtime/CardRuntimeList'

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

  // Build filter/sort config from the card definition
  const filterConfig = buildFilterConfig(filterDefs)
  const sortConfig = buildSortConfig(columns)

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
          <CardRuntimeTable
            columns={columns}
            items={items}
            drillDown={drillDown}
            onItemClick={handleItemClick}
            renderCell={renderCell}
          />
        )

      case 'status':
      default:
        return (
          <CardRuntimeList
            columns={columns}
            items={items}
            drillDown={drillDown}
            onItemClick={handleItemClick}
            renderCell={renderCell}
          />
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
// Re-exports (kept for backwards compatibility — see ./runtime/ for the
// actual implementations)
// ============================================================================

export { registerDataHook } from './runtime/dataHookRegistry'
export { registerDrillAction } from './runtime/drillActionRegistry'
export { registerRenderer } from './runtime/rendererRegistry'
export {
  registerCard,
  getCardDefinition,
  getAllCardDefinitions,
  parseCardYAML } from './runtime/cardDefinitionRegistry'
