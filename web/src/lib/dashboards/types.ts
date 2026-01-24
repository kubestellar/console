// ============================================================================
// Dashboard Definition Types (for YAML-based Dashboard Builder)
// ============================================================================

/**
 * Complete dashboard definition - future YAML format:
 *
 * ```yaml
 * id: workloads
 * title: Workloads
 * description: View and manage deployed applications across clusters
 * icon: Layers
 * route: /workloads
 * storageKey: kubestellar-workloads-cards
 *
 * stats:
 *   type: workloads
 *   collapsedKey: kubestellar-workloads-stats-collapsed
 *
 * defaultCards:
 *   - type: app_status
 *     position: { w: 4, h: 2 }
 *   - type: deployment_status
 *     position: { w: 4, h: 2 }
 *   - type: pod_issues
 *     position: { w: 6, h: 2 }
 *
 * features:
 *   autoRefresh: true
 *   autoRefreshInterval: 30000
 *   templates: true
 *   addCard: true
 *   cardSections: true
 *   clusterOverview: true
 *
 * dataSources:
 *   - hook: usePodIssues
 *   - hook: useDeploymentIssues
 *   - hook: useDeployments
 *   - hook: useClusters
 * ```
 */
export interface DashboardDefinition {
  /** Unique dashboard identifier */
  id: string
  /** Display title */
  title: string
  /** Description shown below title */
  description?: string
  /** Icon name from lucide-react */
  icon: string
  /** Route path (e.g., /workloads) */
  route: string
  /** localStorage key for persisting card layout */
  storageKey: string
  /** Stats block configuration */
  stats?: DashboardStatsConfig
  /** Default cards when no saved layout exists */
  defaultCards: DashboardCardPlacement[]
  /** Feature flags */
  features?: DashboardFeatures
  /** Data source hooks to call */
  dataSources?: DashboardDataSource[]
  /** Custom content sections (like the clusters overview) */
  sections?: DashboardSection[]
}

export interface DashboardStatsConfig {
  /** Stats definition type (references StatDefinition.type) */
  type: string
  /** localStorage key for collapsed state */
  collapsedKey: string
}

export interface DashboardCardPlacement {
  /** Card type (references CardDefinition.type) */
  type: string
  /** Custom title override */
  title?: string
  /** Instance-specific config */
  config?: Record<string, unknown>
  /** Grid position */
  position?: {
    /** Width in grid columns (1-12) */
    w: number
    /** Height in grid rows */
    h: number
  }
}

export interface DashboardFeatures {
  /** Enable auto-refresh */
  autoRefresh?: boolean
  /** Auto-refresh interval in ms */
  autoRefreshInterval?: number
  /** Enable templates modal */
  templates?: boolean
  /** Enable add card modal */
  addCard?: boolean
  /** Enable card sections with toggle */
  cardSections?: boolean
  /** Show cluster overview section */
  clusterOverview?: boolean
  /** Enable drag and drop reordering */
  dragAndDrop?: boolean
  /** Enable floating action buttons */
  floatingActions?: boolean
}

export interface DashboardDataSource {
  /** Hook name to call */
  hook: string
  /** Alias for the data in context */
  as?: string
  /** Parameters to pass */
  params?: Record<string, unknown>
}

export interface DashboardSection {
  /** Section type */
  type: 'cluster-overview' | 'list' | 'grid' | 'custom'
  /** Section title */
  title?: string
  /** Section-specific config */
  config?: Record<string, unknown>
}

// ============================================================================
// Dashboard Card Instance Types
// ============================================================================

export interface DashboardCard {
  /** Unique instance ID */
  id: string
  /** Card type (references CardDefinition.type) */
  card_type: string
  /** Instance-specific configuration */
  config: Record<string, unknown>
  /** Custom title override */
  title?: string
  /** Grid position */
  position?: {
    w: number
    h: number
  }
}

// ============================================================================
// Dashboard Context Types
// ============================================================================

export interface DashboardContextValue {
  /** Dashboard definition */
  definition: DashboardDefinition
  /** Current cards */
  cards: DashboardCard[]
  /** Card management functions */
  addCards: (cards: NewCardInput[]) => void
  removeCard: (id: string) => void
  configureCard: (id: string, config: Record<string, unknown>) => void
  updateCardWidth: (id: string, width: number) => void
  reorderCards: (activeId: string, overId: string) => void
  /** Reset to default layout */
  reset: () => void
  /** Whether layout has been customized */
  isCustomized: boolean
  /** Active drag item ID */
  activeId: string | null
  /** UI state */
  showCards: boolean
  setShowCards: (show: boolean) => void
  showAddCard: boolean
  setShowAddCard: (show: boolean) => void
  showTemplates: boolean
  setShowTemplates: (show: boolean) => void
  configuringCard: DashboardCard | null
  setConfiguringCard: (card: DashboardCard | null) => void
  /** Refresh functions */
  autoRefresh: boolean
  setAutoRefresh: (enabled: boolean) => void
  isRefreshing: boolean
  handleRefresh: () => void
  lastUpdated?: Date
}

export interface NewCardInput {
  type: string
  title?: string
  config?: Record<string, unknown>
}

// ============================================================================
// Stats Definition Types
// ============================================================================

export interface StatsDefinition {
  /** Stats type identifier (e.g., 'workloads', 'clusters') */
  type: string
  /** Stat blocks in this definition */
  blocks: StatBlockDefinition[]
}

export interface StatBlockDefinition {
  /** Unique block ID */
  id: string
  /** Display label */
  label: string
  /** Icon name from lucide-react */
  icon: string
  /** Color variant */
  color: 'purple' | 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'cyan' | 'gray' | 'indigo'
  /** Click action configuration */
  onClick?: StatBlockAction
  /** Tooltip text */
  tooltip?: string
}

export interface StatBlockAction {
  /** Action type */
  type: 'drill' | 'filter' | 'navigate'
  /** Target (drill action name, filter field, or route) */
  target: string
  /** Parameters to pass */
  params?: Record<string, string>
}

// ============================================================================
// Template Types
// ============================================================================

export interface DashboardTemplate {
  id: string
  name: string
  description: string
  category: string
  icon: string
  cards: DashboardCardPlacement[]
}
