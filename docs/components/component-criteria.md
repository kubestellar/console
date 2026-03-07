# KubeStellar Console — Component Criteria

> Reference for building new cards, dialogs, stat blocks, and dashboards.
> All new components **must** follow these criteria for consistency.

Last updated: 2026-01-29

---

## Table of Contents

1. [Card Patterns](#1-card-patterns)
2. [Design Tokens](#2-design-tokens)
3. [Color System](#3-color-system)
4. [Typography](#4-typography)
5. [Shared Component Catalog](#5-shared-component-catalog)
6. [State Requirements](#6-state-requirements)
7. [Hook Selection Guide](#7-hook-selection-guide)
8. [Dialog Guidelines](#8-dialog-guidelines)
9. [Stat Block Rules](#9-stat-block-rules)
10. [Dashboard Layout](#10-dashboard-layout)
11. [Code Templates](#11-code-templates)
12. [Definition of Done](#12-definition-of-done)

---

## 1. Card Patterns

Every card must fit one of these 5 patterns. Use the decision tree to choose.

### Decision Tree

```
Does the card show a list of items with search/filter/pagination?
  YES → DATA LIST CARD (Pattern A)

Does the card show aggregate metrics (gauges, stat boxes, summaries)?
  YES → METRIC/OVERVIEW CARD (Pattern B)

Does the card show time-series charts or trend lines?
  YES → CHART CARD (Pattern C)

Does the card require selecting a single cluster before showing content?
  YES → SINGLE SELECT CARD (Pattern D)

Is it a game, iframe, terminal, or other embedded content?
  YES → SPECIALIZED CARD (Pattern E)
```

### Quick Reference

| Pattern | Hook | Key Components | Default Width | Example |
|---------|------|----------------|---------------|---------|
| A — Data List | `useCardData()` | CardSearchInput, CardControlsRow, CardListItem, CardPaginationFooter | 6-8 cols | DeploymentIssues, PodIssues |
| B — Metric | `useChartFilters()` | CardClusterFilter, stat boxes | 4 cols | ResourceUsage, ClusterHealth |
| C — Chart | `useChartFilters()` | Time range buttons, chart container | 6 cols | ClusterMetrics, EventsTimeline |
| D — Single Select | `useSingleSelectCluster()` | Cluster dropdown, CardListItem | 6-8 cols | HelmReleaseStatus, CRDHealth |
| E — Specialized | None | Custom | 4-12 cols | SudokuGame, Kubectl |

---

## 2. Design Tokens

### Spacing (Standardized)

| Usage | Value | Notes |
|-------|-------|-------|
| List item padding | `p-3` | Standardized — do NOT use `p-2` or `p-2.5` |
| Header elements gap | `gap-2` | Between title, badges, controls |
| Section margin below | `mb-3` | Below headers, search bars, control rows |
| List item spacing | `space-y-2` | Between list items |
| Pagination footer | `pt-2 mt-2 border-t border-border/50` | Use `CardPaginationFooter` |
| Card internal padding | `p-4` | Applied by CardWrapper — don't re-add |
| Stat block padding | `p-4` | Inside each stat block |
| Stat grid gap | `gap-4` | Between stat blocks |

### Border Radius

| Usage | Value |
|-------|-------|
| Cards, modals, stat blocks | `rounded-lg` |
| Buttons, badges, chips | `rounded-lg` (buttons) or `rounded` (small badges) |
| Avatars, icons | `rounded-full` |
| Search inputs | `rounded-md` |

### Minimum Heights

| Element | Class |
|---------|-------|
| Card content area | `min-h-card` |
| Card full height | `h-full` |

---

## 3. Color System

### Status Colors (CANONICAL)

**Always use `getStatusColors()` or `getStatusSeverity()` from `lib/cards/statusColors`.**

| Severity | Text | Background | Border | Icon Background |
|----------|------|------------|--------|-----------------|
| `success` | `text-green-400` | `bg-green-500/20` | `border-green-500/20` | `bg-green-500/10` |
| `warning` | `text-yellow-400` | `bg-yellow-500/20` | `border-yellow-500/20` | `bg-yellow-500/10` |
| `error` | `text-red-400` | `bg-red-500/20` | `border-red-500/20` | `bg-red-500/10` |
| `info` | `text-blue-400` | `bg-blue-500/20` | `border-blue-500/20` | `bg-blue-500/10` |
| `neutral` | `text-muted-foreground` | `bg-secondary` | `border-border` | `bg-secondary/50` |
| `muted` | `text-gray-400` | `bg-gray-500/20` | `border-gray-500/20` | `bg-gray-500/10` |

### Opacity Guide

| Opacity | Usage |
|---------|-------|
| `/10` | Subtle icon backgrounds, light fills |
| `/20` | Badges, status chips, list item backgrounds |
| `/30` | Active filter borders, hover borders |
| `/50` | Active states, selected items, card borders |

### Accent Color

Purple is the project's accent color, used for:
- Active filter states: `bg-purple-500/20 border-purple-500/30 text-purple-400`
- Selected tabs: `text-purple-400 border-purple-400`
- Action buttons: `bg-purple-500/20 text-purple-400 hover:bg-purple-500/30`
- Focus rings: `focus:ring-purple-500/50`

**Never** define custom color mappings inline. Use the centralized `statusColors.ts`.

---

## 4. Typography

| Element | Classes |
|---------|---------|
| Card header title | `text-sm font-medium text-muted-foreground` |
| List item name | `text-sm font-medium text-foreground` |
| List item metadata | `text-xs text-muted-foreground` |
| Badge / chip text | `text-xs` |
| Small badge text | `text-[10px]` |
| Stat block value | `text-3xl font-bold` |
| Stat block label | `text-sm text-muted-foreground` |
| Dashboard page title | `text-2xl font-bold text-foreground` |
| Dashboard subtitle | `text-muted-foreground` (no size override) |
| Modal title | `text-lg font-semibold text-foreground` |
| Modal description | `text-sm text-muted-foreground` |
| Section heading | `text-sm font-medium text-muted-foreground` |

---

## 5. Shared Component Catalog

All shared card UI components are in `web/src/lib/cards/CardComponents.tsx`.
Import from `../../lib/cards` (or `@/lib/cards` with aliases).

### CardSkeleton

Loading skeleton that matches card layout. Use this instead of custom skeletons.

```tsx
import { CardSkeleton } from '../../lib/cards'

// Data list card loading
<CardSkeleton type="list" rows={3} showHeader showSearch />

// Table card loading
<CardSkeleton type="table" rows={5} showHeader />

// Chart card loading
<CardSkeleton type="chart" showHeader />

// Metric/stat grid loading
<CardSkeleton type="metric" rows={4} />

// Custom row height
<CardSkeleton type="list" rows={3} rowHeight={60} />
```

**Props**: `rows`, `type` (list|table|chart|status|metric), `showHeader`, `showSearch`, `rowHeight`

### CardEmptyState

Centered empty state with icon, title, message, and optional action.

```tsx
import { CardEmptyState } from '../../lib/cards'
import { CheckCircle } from 'lucide-react'

// All items healthy (success)
<CardEmptyState
  icon={CheckCircle}
  title="All pods healthy"
  message="No issues detected across your clusters"
  variant="success"
/>

// No search results (info)
<CardEmptyState
  title="No results found"
  message="Try adjusting your search or filters"
  variant="info"
/>

// No data available (neutral)
<CardEmptyState
  title="No data available"
  message="Connect clusters to see data"
  variant="neutral"
  action={{ label: 'Connect Cluster', onClick: handleConnect }}
/>
```

**Props**: `icon`, `title`, `message`, `variant` (success|info|warning|neutral), `action`

### CardErrorState

Error display with retry button.

```tsx
import { CardErrorState } from '../../lib/cards'

<CardErrorState
  error={error.message}
  onRetry={refetch}
  isRetrying={isRefreshing}
/>
```

**Props**: `error`, `onRetry`, `isRetrying`

### CardSearchInput

Search input with magnifying glass icon. Always full-width.

```tsx
import { CardSearchInput } from '../../lib/cards'

<CardSearchInput
  value={localSearch}
  onChange={setLocalSearch}
  placeholder="Search deployments..."
  className="mb-3"
/>
```

**Props**: `value`, `onChange`, `placeholder`, `className`, `debounceMs`

### CardClusterFilter

Cluster filter dropdown with purple active states.

```tsx
import { CardClusterFilter } from '../../lib/cards'

<CardClusterFilter
  availableClusters={availableClustersForFilter}
  selectedClusters={localClusterFilter}
  onToggle={toggleClusterFilter}
  onClear={clearClusterFilter}
  isOpen={showClusterFilter}
  setIsOpen={setShowClusterFilter}
  containerRef={clusterFilterRef}
  minClusters={2}  // hide when < 2 clusters
/>
```

**Props**: `availableClusters`, `selectedClusters`, `onToggle`, `onClear`, `isOpen`, `setIsOpen`, `containerRef`, `minClusters`

### CardClusterIndicator

Badge showing `selected/total` cluster count.

```tsx
import { CardClusterIndicator } from '../../lib/cards'

<CardClusterIndicator selectedCount={3} totalCount={10} />
```

### CardControlsRow

Composition component assembling the standard card controls row.

> **Note:** Do NOT add a refresh button here — refresh is handled by
> the CardWrapper title bar to avoid duplication.

```tsx
import { CardControlsRow } from '../../lib/cards'

<CardControlsRow
  clusterIndicator={{
    selectedCount: localClusterFilter.length,
    totalCount: availableClustersForFilter.length,
  }}
  clusterFilter={{
    availableClusters: availableClustersForFilter,
    selectedClusters: localClusterFilter,
    onToggle: toggleClusterFilter,
    onClear: clearClusterFilter,
    isOpen: showClusterFilter,
    setIsOpen: setShowClusterFilter,
    containerRef: clusterFilterRef,
  }}
  cardControls={{
    limit: itemsPerPage,
    onLimitChange: setItemsPerPage,
    sortBy,
    sortOptions: SORT_OPTIONS,
    onSortChange: setSortBy,
    sortDirection,
    onSortDirectionChange: setSortDirection,
  }}
/>
```

### CardListItem

Clickable list item with consistent padding, border, and hover chevron.

```tsx
import { CardListItem } from '../../lib/cards'

<CardListItem onClick={() => handleClick(item)} variant="default">
  <div className="flex items-center gap-2">
    <span className="text-sm font-medium">{item.name}</span>
    <span className="text-xs text-muted-foreground">{item.namespace}</span>
  </div>
</CardListItem>

// With status variant
<CardListItem onClick={onClick} variant="error">
  <span>{errorItem.name}</span>
</CardListItem>
```

**Props**: `onClick`, `variant` (default|success|warning|error|info), `bgClass`, `borderClass`, `showChevron`, `children`, `title`, `dataTour`

### CardHeader

Standard card header with title, count badge, and controls slot.

```tsx
import { CardHeader } from '../../lib/cards'

<CardHeader
  title="Issues"
  count={totalItems}
  countVariant={totalItems > 0 ? 'error' : 'default'}
  controls={<CardControlsRow ... />}
/>
```

**Props**: `title`, `count`, `countVariant`, `extra`, `controls`

### CardStatusBadge

Status pill with colored background.

```tsx
import { CardStatusBadge } from '../../lib/cards'

<CardStatusBadge status="Running" variant="success" />
<CardStatusBadge status="Failed" variant="error" size="md" />
```

### CardFilterChips

Status category filter chips with purple active state.

```tsx
import { CardFilterChips } from '../../lib/cards'

<CardFilterChips
  chips={[
    { id: 'all', label: 'All', count: total },
    { id: 'error', label: 'Error', count: errorCount, icon: AlertCircle, color: 'text-red-400' },
    { id: 'warning', label: 'Warning', count: warnCount, icon: AlertTriangle, color: 'text-yellow-400' },
  ]}
  activeChip={activeFilter}
  onChipClick={setActiveFilter}
/>
```

### CardPaginationFooter

Standardized pagination footer with separator.

```tsx
import { CardPaginationFooter } from '../../lib/cards'

<CardPaginationFooter
  currentPage={currentPage}
  totalPages={totalPages}
  totalItems={totalItems}
  itemsPerPage={itemsPerPage}
  onPageChange={goToPage}
  needsPagination={needsPagination}
/>
```

---

## 6. State Requirements

Every card **must** handle all three states:

### Loading State

Show `CardSkeleton` when data is loading for the first time (no cached data).

```tsx
const isLoading = hookLoading && rawItems.length === 0

if (isLoading) {
  return <CardSkeleton type="list" rows={3} showHeader showSearch />
}
```

### Empty State

Use `CardEmptyState` with the appropriate variant:
- **No issues / all healthy**: `variant="success"` with CheckCircle icon
- **No results from filter/search**: `variant="info"` — "No results found"
- **No data available**: `variant="neutral"` — "No data available"
- **Feature requires setup**: `variant="warning"` with action button

### Error State

Use `CardErrorState` when the data hook reports an error:

```tsx
if (error && rawItems.length === 0) {
  return <CardErrorState error={error.message} onRetry={refetch} isRetrying={isRefreshing} />
}
```

---

## 7. Hook Selection Guide

### Data List Cards → `useCardData()`

Provides filtering, sorting, and pagination in one hook. Returns `items`, `filters`, `sorting`, pagination state.

```tsx
import { useCardData, commonComparators } from '../../lib/cards'

const { items, totalItems, currentPage, totalPages, itemsPerPage,
  goToPage, needsPagination, setItemsPerPage,
  filters: { search, setSearch, localClusterFilter, toggleClusterFilter,
    clearClusterFilter, availableClusters, showClusterFilter,
    setShowClusterFilter, clusterFilterRef },
  sorting: { sortBy, setSortBy, sortDirection, setSortDirection },
} = useCardData<ItemType, SortField>(rawItems, {
  filter: {
    searchFields: ['name', 'namespace', 'cluster'],
    clusterField: 'cluster',
    storageKey: 'my-card',
  },
  sort: {
    defaultField: 'name',
    defaultDirection: 'asc',
    comparators: {
      name: commonComparators.string('name'),
      cluster: commonComparators.string('cluster'),
    },
  },
  defaultLimit: 5,
})
```

### Metric/Chart Cards → `useChartFilters()`

Lightweight filtering for cards without pagination (gauges, charts, summaries).

```tsx
import { useChartFilters } from '../../lib/cards'

const { filteredItems, clusterFilter, ... } = useChartFilters(rawItems, {
  clusterField: 'cluster',
  storageKey: 'my-chart',
})
```

### Single Cluster Cards → `useSingleSelectCluster()`

For cards that show data from one selected cluster at a time.

```tsx
import { useSingleSelectCluster } from '../../lib/cards'

const { selectedCluster, setSelectedCluster, availableClusters } =
  useSingleSelectCluster({ storageKey: 'my-card-cluster' })
```

### Status Filtering → `useStatusFilter()`

For cards with category filter chips (e.g., All/Error/Warning/Running).

```tsx
import { useStatusFilter } from '../../lib/cards'

const { activeFilter, setActiveFilter, filteredItems } = useStatusFilter(items, {
  statusField: 'status',
  categories: ['error', 'warning', 'running'],
})
```

---

## 8. Dialog Guidelines

### Always Use BaseModal

**Never** use `window.confirm()`, `window.alert()`, or raw `createPortal`. All dialogs must use `BaseModal` from `lib/modals`.

### Sizing Rules

| Size | Max Width | Use For |
|------|-----------|---------|
| `sm` | `max-w-md` | Confirmations, simple forms, rename dialogs |
| `md` | `max-w-2xl` | Multi-section forms, template selection |
| `lg` | `max-w-4xl` | Complex views with tabs, sync workflows |
| `xl` | `max-w-6xl` | Large tables, card browsers, visualizations |
| `full` | `95vw` | Maps, games, full-page embedded views |

### Confirm Dialog Pattern

For destructive or important actions, use `ConfirmDialog`:

```tsx
import { ConfirmDialog } from '../../lib/modals'

<ConfirmDialog
  isOpen={showDelete}
  onClose={() => setShowDelete(false)}
  onConfirm={handleDelete}
  title="Delete Resource"
  message="This will permanently delete the resource."
  confirmLabel="Delete"
  variant="danger"
/>
```

### Dialog Structure

```tsx
<BaseModal isOpen={isOpen} onClose={onClose} size="lg">
  <BaseModal.Header
    title="Dialog Title"
    icon={SomeIcon}
    onClose={onClose}
  />
  <BaseModal.Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
  <BaseModal.Content>
    {/* Dialog body */}
  </BaseModal.Content>
  <BaseModal.Footer showKeyboardHints>
    {/* Action buttons */}
  </BaseModal.Footer>
</BaseModal>
```

### Keyboard Navigation

All dialogs get ESC-to-close automatically from `BaseModal`. Add Backspace-to-go-back for navigation modals. Show keyboard hints in the footer.

---

## 9. Stat Block Rules

### Adding a New Dashboard Stats Type

1. **Define blocks** in `web/src/components/ui/StatsBlockDefinitions.ts`:

```typescript
export const myDashboardStats: StatBlockConfig[] = [
  { id: 'total', name: 'Total', icon: 'Package', visible: true, color: 'purple' },
  { id: 'healthy', name: 'Healthy', icon: 'CheckCircle2', visible: true, color: 'green' },
  { id: 'issues', name: 'Issues', icon: 'AlertCircle', visible: true, color: 'red' },
]
```

2. **Register the type** in the `DASHBOARD_STATS` map in the same file.

3. **Use StatsOverview** in your dashboard:

```tsx
import { StatsOverview } from '../ui/StatsOverview'

<StatsOverview
  dashboardType="myDashboard"
  getStatValue={(blockId) => {
    switch (blockId) {
      case 'total': return { value: data.total, onClick: () => handleClick('total') }
      case 'healthy': return { value: data.healthy, isClickable: true, onClick: ... }
      default: return { value: '-' }
    }
  }}
  hasData={!!data}
  isLoading={isLoading}
  isDemoData={isDemoData}
/>
```

### Stat Block Color Palette

Use one of the 8 standard colors: `purple`, `green`, `orange`, `yellow`, `cyan`, `blue`, `red`, `gray`.

### Stat Block Icons

Use lucide-react icon **string names** (resolved by StatsOverview's icon map). See `StatsOverview.tsx` for the full icon map.

### Formatting Helpers

```typescript
import { formatStatNumber, formatMemoryValue, formatPercentage, formatCurrency } from '../ui/StatsOverview'

formatStatNumber(1500)    // "1.5K"
formatMemoryValue(2048)   // "2.0 TB"
formatPercentage(75.5)    // "76%"
formatCurrency(1500)      // "$1.5K"
```

---

## 10. Dashboard Layout

### Grid System

All dashboards use a 12-column CSS grid:

```tsx
<div className="grid grid-cols-12 gap-4 auto-rows-[minmax(180px,auto)]">
  {cards.map(card => <CardWrapper key={card.id} ... />)}
</div>
```

### Card Width Categories

| Columns | Label | Use For |
|---------|-------|---------|
| 3 | Small | Compact status indicators |
| 4 | Medium | Standard gauges, donuts, status cards |
| 6 | Large | Time series, event streams, medium tables |
| 8 | Wide | Tables with many columns, complex views |
| 12 | Full | Hierarchical trees, large visualizations |

### Dashboard Header

All dashboards must use `DashboardHeader` from `components/shared`:

```tsx
import { DashboardHeader } from '../shared'

<DashboardHeader
  title="My Dashboard"
  subtitle="Monitoring overview"
  icon={<ServerIcon className="w-6 h-6" />}
  isFetching={isFetching}
  onRefresh={refetch}
  autoRefresh={autoRefresh}
  onAutoRefreshChange={setAutoRefresh}
  lastUpdated={lastUpdated}
/>
```

### Dashboard Stats

Every dedicated dashboard should include a `StatsOverview` section below the header. See [Stat Block Rules](#9-stat-block-rules).

---

## 11. Code Templates

### Template: Data List Card

```tsx
import { useCachedXxx } from '../../hooks/useCachedData'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import {
  useCardData, commonComparators,
  CardSkeleton, CardEmptyState, CardErrorState,
  CardSearchInput, CardControlsRow, CardListItem, CardPaginationFooter,
  CardHeader, getStatusColors,
} from '../../lib/cards'
import { CheckCircle } from 'lucide-react'

type SortField = 'name' | 'status' | 'cluster'

const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'status' as const, label: 'Status' },
  { value: 'cluster' as const, label: 'Cluster' },
]

interface MyCardProps {
  config?: Record<string, unknown>
}

export function MyCard({ config }: MyCardProps) {
  const clusterConfig = config?.cluster as string | undefined
  const {
    items: rawItems, isLoading: hookLoading, error,
  } = useCachedXxx(clusterConfig)

  const isLoading = hookLoading && rawItems.length === 0
  const { drillToXxx } = useDrillDownActions()

  const {
    items, totalItems, currentPage, totalPages, itemsPerPage,
    goToPage, needsPagination, setItemsPerPage,
    filters: {
      search, setSearch, localClusterFilter, toggleClusterFilter,
      clearClusterFilter, availableClusters: availableClustersForFilter,
      showClusterFilter, setShowClusterFilter, clusterFilterRef,
    },
    sorting: { sortBy, setSortBy, sortDirection, setSortDirection },
  } = useCardData<ItemType, SortField>(rawItems, {
    filter: {
      searchFields: ['name', 'namespace', 'cluster'],
      clusterField: 'cluster',
      storageKey: 'my-card',
    },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: {
        name: commonComparators.string('name'),
        status: commonComparators.string('status'),
        cluster: commonComparators.string('cluster'),
      },
    },
    defaultLimit: 5,
  })

  // Loading state
  if (isLoading) {
    return <CardSkeleton type="list" rows={3} showHeader showSearch />
  }

  // Error state (no cached data)
  if (error && rawItems.length === 0) {
    return <CardErrorState error={error.message} onRetry={refetch} isRetrying={isRefreshing} />
  }

  // Empty state — all clear
  if (rawItems.length === 0) {
    return (
      <CardEmptyState
        icon={CheckCircle}
        title="All clear"
        message="No issues found"
        variant="success"
      />
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header */}
      <CardHeader
        title="Issues"
        count={totalItems}
        countVariant={totalItems > 0 ? 'error' : 'default'}
        controls={
          <CardControlsRow
            clusterIndicator={{
              selectedCount: localClusterFilter.length,
              totalCount: availableClustersForFilter.length,
            }}
            clusterFilter={{
              availableClusters: availableClustersForFilter,
              selectedClusters: localClusterFilter,
              onToggle: toggleClusterFilter,
              onClear: clearClusterFilter,
              isOpen: showClusterFilter,
              setIsOpen: setShowClusterFilter,
              containerRef: clusterFilterRef,
            }}
            cardControls={{
              limit: itemsPerPage,
              onLimitChange: setItemsPerPage,
              sortBy,
              sortOptions: SORT_OPTIONS,
              onSortChange: setSortBy,
              sortDirection,
              onSortDirectionChange: setSortDirection,
            }}
          />
        }
      />

      {/* Search */}
      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search items..."
        className="mb-3"
      />

      {/* List */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {items.map((item) => {
          const colors = getStatusColors(item.status)
          return (
            <CardListItem
              key={item.id}
              onClick={() => drillToXxx(item.cluster, item.namespace, item.name)}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                  {item.status}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {item.namespace} • {item.cluster}
              </div>
            </CardListItem>
          )
        })}

        {/* Empty filter results */}
        {items.length === 0 && rawItems.length > 0 && (
          <CardEmptyState
            title="No results"
            message="Try adjusting your search or filters"
            variant="info"
          />
        )}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={itemsPerPage}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />
    </div>
  )
}
```

### Template: Dialog

```tsx
import { BaseModal } from '../../lib/modals'
import { SomeIcon } from 'lucide-react'

interface MyDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function MyDialog({ isOpen, onClose }: MyDialogProps) {
  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      <BaseModal.Header
        title="Dialog Title"
        description="Optional description"
        icon={SomeIcon}
        onClose={onClose}
      />
      <BaseModal.Content>
        {/* Body content */}
      </BaseModal.Content>
      <BaseModal.Footer showKeyboardHints>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="px-4 py-2 text-sm rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
        >
          Submit
        </button>
      </BaseModal.Footer>
    </BaseModal>
  )
}
```

### Template: New Stat Block Type

```typescript
// In StatsBlockDefinitions.ts — add:
export const myDashboardStats: StatBlockConfig[] = [
  { id: 'total', name: 'Total', icon: 'Package', visible: true, color: 'purple' },
  { id: 'healthy', name: 'Healthy', icon: 'CheckCircle2', visible: true, color: 'green' },
  // ... more blocks
]

// In the DASHBOARD_STATS map:
myDashboard: myDashboardStats,
```

---

## 12. Definition of Done

Before merging any new card, dialog, stat block, or dashboard, verify:

### Card Checklist

- [ ] Uses one of the 5 card patterns (A-E)
- [ ] Uses the correct hook for its pattern (`useCardData`, `useChartFilters`, etc.)
- [ ] Imports shared components from `lib/cards` — **no inline search bars, cluster filters, or skeletons**
- [ ] Handles **loading** state with `CardSkeleton`
- [ ] Handles **empty** state with `CardEmptyState` (correct variant)
- [ ] Handles **error** state with `CardErrorState` (when applicable)
- [ ] Uses `getStatusColors()` from `statusColors.ts` — **no inline color mappings**
- [ ] Uses `CardListItem` for list items (standardized `p-3` padding)
- [ ] Uses `CardPaginationFooter` when paginated
- [ ] Uses `CardControlsRow` for the controls area
- [ ] Uses `CardSearchInput` for search
- [ ] Follows spacing tokens (`mb-3`, `gap-2`, `space-y-2`)
- [ ] Follows typography scale (see Section 4)
- [ ] Registered in `cardRegistry.ts` with correct default width
- [ ] Has drill-down action if items are clickable (uses `useDrillDownActions`)
- [ ] Accepts `config?: Record<string, unknown>` prop

### Dialog Checklist

- [ ] Uses `BaseModal` — **not** `window.confirm()` or raw `createPortal`
- [ ] Correct size for content type (see sizing rules)
- [ ] Has `BaseModal.Header` with title, icon, and close button
- [ ] Has `BaseModal.Footer` with keyboard hints
- [ ] Supports ESC to close
- [ ] Uses `ConfirmDialog` for destructive actions

### Stat Block Checklist

- [ ] Defined in `StatsBlockDefinitions.ts`
- [ ] Uses one of the 8 standard colors
- [ ] Uses a lucide-react icon name (string)
- [ ] Registered in the `DASHBOARD_STATS` map
- [ ] Dashboard uses `StatsOverview` component with `getStatValue` callback
- [ ] Each block has a click handler for drill-down (when applicable)

### Dashboard Checklist

- [ ] Uses `DashboardHeader` from `components/shared`
- [ ] Uses 12-column grid layout
- [ ] Includes `StatsOverview` section
- [ ] Supports auto-refresh with 30s interval
- [ ] Shows last-updated timestamp
- [ ] Card widths follow the standard categories (3/4/6/8/12)
