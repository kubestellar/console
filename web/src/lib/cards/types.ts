import { LucideIcon } from 'lucide-react'

// ============================================================================
// Card Definition Types (for future YAML-based builder)
// ============================================================================

export type CardVisualization =
  | 'table'
  | 'gauge'
  | 'donut'
  | 'bar'
  | 'timeseries'
  | 'events'
  | 'status'
  | 'sparkline'
  | 'interactive'

export type CardCategory =
  | 'cluster-health'
  | 'workloads'
  | 'compute'
  | 'storage'
  | 'network'
  | 'gitops'
  | 'argocd'
  | 'operators'
  | 'namespaces'
  | 'security'
  | 'live-trends'
  | 'ai'
  | 'ai-ml'
  | 'alerting'
  | 'alerts'
  | 'cost'
  | 'policy'
  | 'external'
  | 'utilities'
  | 'utility'
  | 'games'
  | 'events'
  | 'ci-cd'

export interface CardDefinition {
  /** Unique card type identifier */
  type: string
  /** Display title */
  title: string
  /** Card category */
  category: CardCategory
  /** Visualization type */
  visualization: CardVisualization
  /** Data source configuration */
  dataSource: CardDataSource
  /** Filter configuration */
  filters?: CardFilterDefinition[]
  /** Column definitions (for table visualization) */
  columns?: CardColumnDefinition[]
  /** Drill-down configuration */
  drillDown?: CardDrillDownConfig
  /** Empty state configuration */
  emptyState?: CardEmptyStateConfig
  /** Loading state configuration */
  loadingState?: CardLoadingStateConfig
  /** Whether card uses demo/mock data */
  isDemoData?: boolean
}

export interface CardDataSource {
  /** Hook name to use for data fetching */
  hook: string
  /** Parameters to pass to the hook */
  params?: Record<string, unknown>
  /** Optional data transformation function name */
  transform?: string
}

export interface CardFilterDefinition {
  /** Field to filter on */
  field: string
  /** Filter type */
  type: 'select' | 'chips' | 'text' | 'range' | 'toggle'
  /** Label for the filter */
  label?: string
  /** For select/chips: data source for options */
  source?: string
  /** For chips: static options */
  options?: string[]
  /** For text: placeholder */
  placeholder?: string
  /** For text: fields to search */
  searchFields?: string[]
}

export interface CardColumnDefinition {
  /** Field name from data */
  field: string
  /** Column header text */
  header: string
  /** Column width (px or auto) */
  width?: number | 'auto'
  /** Text alignment */
  align?: 'left' | 'center' | 'right'
  /** Render function name for custom rendering */
  render?: string
  /** Whether column is sortable */
  sortable?: boolean
  /** Whether column is hidden by default */
  hidden?: boolean
}

export interface CardDrillDownConfig {
  /** Drill action name from useDrillDownActions */
  action: string
  /** Fields from data item to pass as parameters */
  params: string[]
  /** Additional context to include */
  context?: Record<string, string>
}

export interface CardEmptyStateConfig {
  /** Icon name (from lucide-react) */
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
  type?: 'table' | 'list' | 'chart' | 'status'
  /** Show header skeleton */
  showHeader?: boolean
  /** Show search skeleton */
  showSearch?: boolean
}

// ============================================================================
// Card Placement Types (for dashboard layouts)
// ============================================================================

export interface CardPlacement {
  /** Unique instance ID */
  id: string
  /** Card type (references CardDefinition.type) */
  card_type: string
  /** Instance-specific configuration overrides */
  config?: Record<string, unknown>
  /** Custom title override */
  title?: string
  /** Grid position */
  position?: {
    /** Width in grid columns (3-12) */
    w: number
    /** Height in grid rows */
    h: number
  }
}

// ============================================================================
// Card Status Types
// ============================================================================

export type CardStatus = 'healthy' | 'warning' | 'error' | 'unknown' | 'pending'

export interface StatusConfig {
  icon: LucideIcon
  color: string
  bg: string
  border?: string
  barColor?: string
  label: string
}

export type StatusConfigMap = Record<string, StatusConfig>

// ============================================================================
// Card Sort Types
// ============================================================================

export interface SortOption<T extends string = string> {
  value: T
  label: string
}

// ============================================================================
// Card Data Item Types (common shapes)
// ============================================================================

export interface BaseCardItem {
  /** Item name */
  name: string
  /** Namespace (if applicable) */
  namespace?: string
  /** Cluster name */
  cluster?: string
  /** Item status */
  status?: string
}

export interface PodItem extends BaseCardItem {
  restarts: number
  ready: string
  age: string
  issues?: string[]
}

export interface DeploymentItem extends BaseCardItem {
  replicas: number
  readyReplicas: number
  progress: number
  image?: string
}

export interface ServiceItem extends BaseCardItem {
  type: string
  clusterIP?: string
  ports: string[]
}

export interface NodeItem extends BaseCardItem {
  roles: string[]
  cpu: number
  memory: number
  pods: number
  conditions: string[]
}

export interface EventItem extends BaseCardItem {
  type: 'Normal' | 'Warning'
  reason: string
  message: string
  count: number
  firstTimestamp: string
  lastTimestamp: string
  involvedObject?: {
    kind: string
    name: string
    namespace?: string
  }
}
