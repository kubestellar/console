/**
 * UnifiedCard type definitions.
 *
 * Extracted from types.ts as part of the type-family split (tracked by #15790).
 * The root types.ts re-exports everything from here so all existing import
 * paths continue to work.
 */

// Re-export card-primitive types we extend
export type {
  CardCategory,
  CardVisualization,
  CardPlacement,
  CardStatus,
} from '../cards/types'

// ============================================================================
// UnifiedCard Types
// ============================================================================

/**
 * Complete card configuration - drives all card rendering
 */
export interface UnifiedCardConfig {
  /** Unique card type identifier */
  type: string
  /** Display title */
  title: string
  /** Card category for organization */
  category: import('../cards/types').CardCategory
  /** Description shown in info tooltip */
  description?: string

  // Appearance
  /** Icon name from lucide-react */
  icon?: string
  /** Icon color class (e.g., 'text-green-400') */
  iconColor?: string
  /** Default grid width (3-12 columns) */
  defaultWidth?: CardWidth
  /** Default grid height (in rows) */
  defaultHeight?: number

  // Data
  /** Data source configuration */
  dataSource: CardDataSource
  /** Data transformation after fetching */
  transform?: CardDataTransform

  // Layout sections
  /** Inline stats shown at top of card */
  stats?: CardStatConfig[]
  /** Filter controls */
  filters?: CardFilterConfig[]
  /** Main content area */
  content: CardContent
  /** Footer configuration */
  footer?: CardFooterConfig

  // Interaction
  /** Drill-down configuration */
  drillDown?: CardDrillDownConfig
  /** Empty state configuration */
  emptyState?: CardEmptyStateConfig
  /** Loading state configuration */
  loadingState?: CardLoadingStateConfig

  // Metadata
  /** Whether card uses demo/mock data */
  isDemoData?: boolean
  /** Whether card has live/real-time data */
  isLive?: boolean

  // White-label project context
  /**
   * Project contexts this card belongs to.
   * ['*'] or omitted = universal (visible to all projects)
   * ['kubestellar'] = only visible when CONSOLE_PROJECT=kubestellar
   * Multiple values = visible in any listed project
   */
  projects?: string[]
}

export type CardWidth = 3 | 4 | 5 | 6 | 8 | 12

// ============================================================================
// Data Source Types (discriminated union)
// ============================================================================

export type CardDataSource =
  | CardDataSourceHook
  | CardDataSourceApi
  | CardDataSourceStatic
  | CardDataSourceContext

export interface CardDataSourceHook {
  type: 'hook'
  /** Hook name from the hook registry */
  hook: string
  /** Parameters to pass to the hook */
  params?: Record<string, unknown>
}

export interface CardDataSourceApi {
  type: 'api'
  /** API endpoint path */
  endpoint: string
  /** HTTP method */
  method?: 'GET' | 'POST'
  /** Query parameters */
  params?: Record<string, unknown>
  /** Polling interval in ms (0 = no polling) */
  pollInterval?: number
}

export interface CardDataSourceStatic {
  type: 'static'
  /** Static data array (optional for custom components that don't need data) */
  data?: unknown[]
}

export interface CardDataSourceContext {
  type: 'context'
  /** Key in React context to read data from */
  contextKey: string
}

export interface CardDataTransform {
  /** Transform function name from registry */
  fn: string
  /** Additional parameters */
  params?: Record<string, unknown>
}

// ============================================================================
// Content Types (discriminated union)
// ============================================================================

export type CardContent =
  | CardContentList
  | CardContentTable
  | CardContentChart
  | CardContentStatusGrid
  | CardContentStatsGrid
  | CardContentCustom

export interface CardContentList {
  type: 'list'
  /** Column definitions */
  columns: CardColumnConfig[]
  /** Item click behavior */
  itemClick?: 'drill' | 'expand' | 'select' | 'none'
  /** Max items per page (enables pagination) */
  pageSize?: number
  /** Show row numbers */
  showRowNumbers?: boolean
  /** AI actions configuration for list items */
  aiActions?: CardAIActionsConfig
  /** Enable sorting controls */
  sortable?: boolean
  /** Default sort field (column field name) */
  defaultSort?: string
  /** Default sort direction */
  defaultDirection?: 'asc' | 'desc'
  /** Sort options to show in dropdown (defaults to all sortable columns) */
  sortOptions?: Array<{ field: string; label: string }>
}

/**
 * Configuration for AI actions (Diagnose/Repair) on list items
 */
export interface CardAIActionsConfig {
  /** Field mappings to construct the resource context */
  resourceMapping: {
    /** Resource kind (e.g., 'Pod', 'Deployment') - can be field name or static value */
    kind: string
    /** Field for resource name */
    nameField: string
    /** Field for namespace (optional) */
    namespaceField?: string
    /** Field for cluster (optional) */
    clusterField?: string
    /** Field for status (optional) */
    statusField?: string
  }
  /** Field that contains issues array (optional) - each issue should have name/message */
  issuesField?: string
  /** Additional context fields to include */
  contextFields?: string[]
  /** Whether to show the repair button (default: true) */
  showRepair?: boolean
}

export interface CardContentTable {
  type: 'table'
  /** Column definitions */
  columns: CardColumnConfig[]
  /** Enable column sorting */
  sortable?: boolean
  /** Default sort field */
  defaultSort?: string
  /** Default sort direction */
  defaultDirection?: 'asc' | 'desc'
  /** Max items per page */
  pageSize?: number
}

export interface CardContentChart {
  type: 'chart'
  /** Chart type */
  chartType: 'line' | 'bar' | 'donut' | 'gauge' | 'sparkline' | 'area'
  /** Data series configuration (optional - can derive from yAxis) */
  series?: CardChartSeries[]
  /** X-axis configuration (string field name or full config) */
  xAxis?: CardAxisConfig | string
  /** Y-axis configuration (string field name, array of fields, or full config) */
  yAxis?: CardAxisConfig | string | string[]
  /** Show legend */
  showLegend?: boolean
  /** Chart height in pixels */
  height?: number
  /** Data key field (for donut/pie charts) */
  dataKey?: string
  /** Value key field (alias for dataKey) */
  valueKey?: string
  /** Label key field (for donut/pie charts) */
  labelKey?: string
  /** Color palette for chart series */
  colors?: string[]
}

export interface CardContentStatusGrid {
  type: 'status-grid'
  /** Status items to display */
  items: CardStatusItem[]
  /** Grid columns */
  columns?: number
  /** Show counts */
  showCounts?: boolean
}

export interface CardContentCustom {
  type: 'custom'
  /** Component name from registry */
  componentName?: string
  /** Component name (alias for componentName) */
  component?: string
  /** Props to pass to component */
  props?: Record<string, unknown>
}

export interface CardContentStatsGrid {
  type: 'stats-grid'
  /** Stat items to display */
  stats: CardStatsGridItem[]
  /** Grid columns */
  columns?: number
}

export interface CardStatsGridItem {
  /** Field name from data */
  field: string
  /** Label to display */
  label: string
  /** Color for the stat */
  color?: string
  /** Icon name */
  icon?: string
  /** Value format */
  format?: 'number' | 'percentage' | 'bytes' | 'currency'
}

// ============================================================================
// Column & Renderer Types
// ============================================================================

export interface CardColumnConfig {
  /** Field name from data item */
  field: string
  /** Column header text */
  header?: string
  /** Column width (px, %, or 'auto') */
  width?: number | string
  /** Text alignment */
  align?: 'left' | 'center' | 'right'
  /** Renderer name from registry, or built-in type */
  render?: CardRenderer
  /** Whether this is the primary field (bold, clickable) */
  primary?: boolean
  /** Whether column is sortable */
  sortable?: boolean
  /** Whether column is hidden by default */
  hidden?: boolean
  /** Suffix to append to value */
  suffix?: string
  /** Prefix to prepend to value */
  prefix?: string
}

export type CardRenderer =
  | 'text'
  | 'number'
  | 'percentage'
  | 'bytes'
  | 'duration'
  | 'date'
  | 'datetime'
  | 'relative-time'
  | 'status-badge'
  | 'cluster-badge'
  | 'namespace-badge'
  | 'progress-bar'
  | 'icon'
  | 'boolean'
  | 'json'
  | 'truncate'
  | 'link'
  | string // Custom renderer name

// ============================================================================
// Chart Types
// ============================================================================

export interface CardChartSeries {
  /** Field name for values */
  field: string
  /** Series label */
  label?: string
  /** Series color */
  color?: string
  /** Line/bar style */
  style?: 'solid' | 'dashed' | 'dotted'
  /** For donut: whether this is the main value */
  primary?: boolean
}

export interface CardAxisConfig {
  /** Field for axis values */
  field?: string
  /** Axis label */
  label?: string
  /** Axis type */
  type?: 'linear' | 'time' | 'category'
  /** Value format */
  format?: 'number' | 'percentage' | 'bytes' | 'currency' | 'time'
  /** Min value */
  min?: number
  /** Max value */
  max?: number
}

// ============================================================================
// Status Grid Types
// ============================================================================

export interface CardStatusItem {
  /** Item ID */
  id: string
  /** Item label */
  label: string
  /** Icon name */
  icon: string
  /** Icon color */
  color: string
  /** Background color */
  bgColor?: string
  /** Value source configuration */
  valueSource: CardValueSource
}

export type CardValueSource =
  | { type: 'field'; path: string }
  | { type: 'computed'; expression: string }
  | { type: 'count'; filter?: string }

// ============================================================================
// Filter Types
// ============================================================================

export interface CardFilterConfig {
  /** Field to filter on */
  field: string
  /** Filter type */
  type: 'text' | 'select' | 'multi-select' | 'cluster-select' | 'chips' | 'toggle'
  /** Filter label */
  label?: string
  /** Placeholder text */
  placeholder?: string
  /** For text: fields to search across */
  searchFields?: string[]
  /** For select/chips: static options */
  options?: CardFilterOption[]
  /** For select/chips: data source for options */
  optionsSource?: string
  /** Storage key for persistence */
  storageKey?: string
}

export interface CardFilterOption {
  value: string
  label: string
  icon?: string
  color?: string
}

// ============================================================================
// Inline Stats Types
// ============================================================================

export interface CardStatConfig {
  /** Stat ID */
  id: string
  /** Icon name */
  icon: string
  /** Icon color class */
  color: string
  /** Background color class */
  bgColor?: string
  /** Stat label */
  label: string
  /** Value source */
  valueSource: CardValueSource
  /** Click action */
  onClick?: CardStatAction
}

export interface CardStatAction {
  type: 'filter' | 'drill' | 'navigate'
  target: string
  params?: Record<string, string>
}

// ============================================================================
// Footer Types
// ============================================================================

export interface CardFooterConfig {
  /** Show pagination */
  pagination?: boolean
  /** Show total count */
  showTotal?: boolean
  /** Custom footer text */
  text?: string
}

// ============================================================================
// Drill-Down Types
// ============================================================================

export interface CardDrillDownConfig {
  /** Action name from useDrillDownActions */
  action: string
  /** Fields from data item to pass as params */
  params: string[]
  /** Additional context to include */
  context?: Record<string, string>
}

// ============================================================================
// Empty & Loading States
// ============================================================================

export interface CardEmptyStateConfig {
  /** Icon name */
  icon: string
  /** Main message */
  title: string
  /** Secondary message */
  message?: string
  /** Variant for styling */
  variant: 'success' | 'info' | 'warning' | 'neutral'
}

export interface CardLoadingStateConfig {
  /** Number of skeleton rows */
  rows?: number
  /** Skeleton type */
  type?: 'table' | 'list' | 'chart' | 'status' | 'stats' | 'custom'
  /** Show header skeleton */
  showHeader?: boolean
  /** Show search skeleton */
  showSearch?: boolean
  /** Number of items for stats type */
  count?: number
}
