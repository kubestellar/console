/**
 * Workload Monitor types
 *
 * Shared type system for the Workload Monitor card family,
 * including the core monitor, specialized monitors (llm-d, Prow, GitHub CI,
 * cluster health), and the AI diagnose/repair loop.
 */

// ============================================================================
// Resource Health
// ============================================================================

/** Health status for a monitored Kubernetes resource */
export type ResourceHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown' | 'missing'

/** Category of a Kubernetes resource in the dependency tree */
export type ResourceCategory =
  | 'workload'
  | 'rbac'
  | 'config'
  | 'networking'
  | 'scaling'
  | 'storage'
  | 'crd'
  | 'admission'
  | 'other'

/** A Kubernetes resource being monitored with its health status */
export interface MonitoredResource {
  /** Unique identifier (kind/namespace/name) */
  id: string
  /** Kubernetes resource kind (e.g., Deployment, ConfigMap, Service) */
  kind: string
  /** Resource name */
  name: string
  /** Namespace the resource lives in */
  namespace: string
  /** Cluster the resource lives in */
  cluster: string
  /** Current health status */
  status: ResourceHealthStatus
  /** Dependency category grouping */
  category: ResourceCategory
  /** Human-readable status message or error reason */
  message?: string
  /** ISO timestamp of last health check */
  lastChecked: string
  /** Whether this dependency is optional */
  optional: boolean
  /** Dependency apply order from the resolver */
  order: number
}

// ============================================================================
// Issues and Alerts
// ============================================================================

/** Severity level for a detected issue */
export type IssueSeverity = 'critical' | 'warning' | 'info'

/** An issue detected during workload monitoring */
export interface MonitorIssue {
  /** Unique issue identifier */
  id: string
  /** The resource this issue relates to */
  resource: MonitoredResource
  /** Issue severity */
  severity: IssueSeverity
  /** Short title describing the issue */
  title: string
  /** Detailed description of what is wrong */
  description: string
  /** ISO timestamp when the issue was first detected */
  detectedAt: string
}

// ============================================================================
// Monitor API Response
// ============================================================================

/** Response from GET /api/workloads/monitor/:cluster/:namespace/:name */
export interface WorkloadMonitorResponse {
  /** Workload name */
  workload: string
  /** Workload kind (Deployment, StatefulSet, etc.) */
  kind: string
  /** Namespace */
  namespace: string
  /** Cluster */
  cluster: string
  /** Overall workload health status */
  status: ResourceHealthStatus
  /** All monitored resources with health status */
  resources: MonitoredResource[]
  /** Issues detected across the workload's resources */
  issues: MonitorIssue[]
  /** Non-critical warnings from the resolution process */
  warnings: string[]
}

// ============================================================================
// Card Configuration
// ============================================================================

/** Type of monitoring experience */
export type MonitorType = 'workload' | 'llmd' | 'prow' | 'github' | 'cluster-health'

/** Configuration passed via CardComponentProps['config'] */
export interface WorkloadMonitorConfig {
  /** Target cluster name (if pre-configured, skips selector) */
  cluster?: string
  /** Target namespace (if pre-configured, skips selector) */
  namespace?: string
  /** Target workload name (if pre-configured, skips selector) */
  workload?: string
  /** Type of monitoring experience */
  monitorType?: MonitorType
  /** Auto-refresh interval in ms (default: 30000) */
  autoRefreshMs?: number
  /** Whether the AI diagnose button is available */
  diagnosable?: boolean
  /** Whether the AI repair feature is available */
  repairable?: boolean
}

/** View mode for the monitor card */
export type MonitorViewMode = 'tree' | 'list'

// ============================================================================
// Diagnose & Repair Loop
// ============================================================================

/** Phase of the diagnose/repair state machine */
export type DiagnoseRepairPhase =
  | 'idle'
  | 'scanning'
  | 'diagnosing'
  | 'proposing-repair'
  | 'awaiting-approval'
  | 'repairing'
  | 'verifying'
  | 'complete'
  | 'failed'

/** Risk level for a proposed repair action */
export type RepairRisk = 'low' | 'medium' | 'high'

/** A proposed repair action from the AI */
export interface ProposedRepair {
  /** Unique repair identifier */
  id: string
  /** ID of the issue this repair addresses */
  issueId: string
  /** Short action label (e.g., "Restart pod", "Scale deployment") */
  action: string
  /** Detailed description of what the repair will do */
  description: string
  /** Risk level of the repair */
  risk: RepairRisk
  /** Whether the user has approved this repair */
  approved: boolean
}

/** Full state of the diagnose/repair loop */
export interface DiagnoseRepairState {
  /** Current phase */
  phase: DiagnoseRepairPhase
  /** Active mission ID (from useMissions) */
  missionId?: string
  /** Issues found during scanning/diagnosing */
  issuesFound: MonitorIssue[]
  /** Repairs proposed by the AI */
  proposedRepairs: ProposedRepair[]
  /** IDs of repairs that have been successfully executed */
  completedRepairs: string[]
  /** Current loop iteration count */
  loopCount: number
  /** Maximum number of scan→diagnose→repair cycles (safety limit) */
  maxLoops: number
  /** Error message if the loop failed */
  error?: string
}

/** Default max loops for the diagnose/repair cycle */
export const DEFAULT_MAX_LOOPS = 3

/** Default auto-refresh interval in ms */
export const DEFAULT_REFRESH_MS = 30_000
