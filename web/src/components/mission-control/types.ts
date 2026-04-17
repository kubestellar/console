/**
 * Mission Control: Multi-Cluster Solutions Orchestrator
 *
 * Type definitions for the 3-phase wizard:
 *   Phase 1: Define Fix (payload selection)
 *   Phase 2: Assign Clusters (readiness + assignment)
 *   Phase 3: Flight Plan (blueprint + deploy)
 */

// ---------------------------------------------------------------------------
// Phase 1: Payload (CNCF projects to deploy)
// ---------------------------------------------------------------------------

export interface PayloadProject {
  /** Unique key matching console-kb index (e.g. "falco") */
  name: string
  /** Human-readable display name (e.g. "Falco Runtime Security") */
  displayName: string
  /** Why the AI suggested this project */
  reason: string
  /** CNCF landscape category */
  category: string
  /** Is this required for the fix or optional? */
  priority: 'required' | 'recommended' | 'optional'
  /** Other project names this depends on (e.g. ["helm"]) */
  dependencies: string[]
  /** Path in console-kb to the install mission JSON */
  kbPath?: string
  /** GitHub org for avatar URL */
  githubOrg?: string
  /** CNCF maturity level */
  maturity?: 'graduated' | 'incubating' | 'sandbox'
  /** Difficulty level */
  difficulty?: 'beginner' | 'intermediate' | 'advanced'
  /** Original project name if this was swapped from the AI plan */
  originalName?: string
  /** User-imported YAML/runbook mission that replaces or augments the console-kb install mission */
  importedMission?: import('../../lib/missions/types').MissionExport
  /** Whether the user's YAML replaces the AI install mission entirely */
  replacesInstallMission?: boolean
  /**
   * True when the user added this project themselves (via manual add OR via
   * project swap / library selection). mergeProjects preserves every
   * user-added project across AI refinement cycles (#6465). Distinct from
   * `category === 'Custom'`, which only flags the "Manually add" path and
   * loses user-selected CNCF projects on refinement.
   */
  userAdded?: boolean
  /**
   * Kubara platform chart reference. When present, the project can be
   * installed via the Kubara catalog instead of (or in addition to) the
   * console-kb install mission. `repoPath` is the directory path inside
   * the kubara-io/kubara repo (e.g. "helm/prometheus-stack"). `valuesUrl`
   * optionally points to a pre-built values file for the chart (#8480).
   */
  kubaraChart?: {
    /** Path inside the kubara-io/kubara repo (e.g. "helm/prometheus-stack") */
    repoPath: string
    /** Optional URL to a default or recommended values file */
    valuesUrl?: string
  }
}

// ---------------------------------------------------------------------------
// Phase 2: Cluster assignments
// ---------------------------------------------------------------------------

export interface ClusterAssignment {
  /** Cluster name (from ClusterInfo.name) */
  clusterName: string
  /** Cluster context (from ClusterInfo.context) */
  clusterContext: string
  /**
   * Cluster server URL (from ClusterInfo.server) captured at assignment
   * time. Used to detect re-created clusters during stale-reconciliation:
   * if a Kind cluster was deleted and a new one was registered with the
   * SAME name but a different server URL, the persisted assignment is
   * orphaned and must be dropped. Optional for backward-compatibility
   * with assignments persisted before this field existed (issue 6433).
   */
  clusterServer?: string
  /** Cloud provider / distribution (eks, gke, aks, kind, etc.) */
  provider: string
  /** Project names assigned to this cluster */
  projectNames: string[]
  /** AI-generated warnings for this cluster */
  warnings: string[]
  /** Resource headroom assessment */
  readiness: {
    cpuHeadroomPercent: number
    memHeadroomPercent: number
    storageHeadroomPercent: number
    overallScore: number // 0-100
  }
}

// ---------------------------------------------------------------------------
// Phase 3: Deploy phases
// ---------------------------------------------------------------------------

export interface DeployPhase {
  /** Phase number (1-based) */
  phase: number
  /** Human-readable phase name (e.g. "Core Infrastructure") */
  name: string
  /** Project names to deploy in this phase */
  projectNames: string[]
  /** Estimated deploy time in seconds */
  estimatedSeconds?: number
}

export type PhaseStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface PhaseProgress {
  phase: number
  status: PhaseStatus
  /** Per-project mission IDs and statuses */
  projects: {
    name: string
    missionId?: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    error?: string
  }[]
}

// ---------------------------------------------------------------------------
// Wizard state
// ---------------------------------------------------------------------------

export type WizardPhase = 'define' | 'assign' | 'blueprint' | 'launching' | 'complete'

export type OverlayMode = 'architecture' | 'compute' | 'storage' | 'network' | 'security'

export interface MissionControlState {
  /** Current wizard phase */
  phase: WizardPhase
  /** User's natural-language fix description */
  description: string
  /** Fix title (derived from description or user-edited) */
  title: string
  /** Selected payload projects */
  projects: PayloadProject[]
  /** Cluster assignments */
  assignments: ClusterAssignment[]
  /** Deploy phases (topologically sorted) */
  phases: DeployPhase[]
  /** Current SVG overlay mode */
  overlay: OverlayMode
  /** Whether to deploy all at once or phased */
  deployMode: 'phased' | 'yolo'
  /** Whether to use server-side dry-run (no actual resource creation) */
  isDryRun?: boolean
  /** AI planning mission ID (for the hidden conversation) */
  planningMissionId?: string
  /** Target clusters selected by user in Phase 1 — scopes AI analysis */
  targetClusters: string[]
  /** Whether AI is currently streaming a response */
  aiStreaming: boolean
  /** Launch progress */
  launchProgress: PhaseProgress[]
  /** Generated ground-control dashboard ID */
  groundControlDashboardId?: string
}

// ---------------------------------------------------------------------------
// SVG layout (computed, not stored)
// ---------------------------------------------------------------------------

export interface LayoutRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ProjectPosition {
  projectName: string
  cx: number
  cy: number
  clusterName: string
}

export interface DependencyEdge {
  from: string // project name
  to: string   // project name
  crossCluster: boolean
  /** Short label describing the integration (e.g., "TLS certs", "metrics") */
  label?: string
  /** Pre-resolved source position for multi-cluster edge routing */
  fromPos?: ProjectPosition
  /** Pre-resolved target position for multi-cluster edge routing */
  toPos?: ProjectPosition
}

export interface BlueprintLayout {
  clusterRects: Map<string, LayoutRect>
  projectPositions: Map<string, ProjectPosition>
  dependencyEdges: DependencyEdge[]
  viewBox: { width: number; height: number }
}
