/**
 * Mission Types
 *
 * Shared type definitions for the mission import/export system.
 */

// ============================================================================
// Core Mission Export Format
// ============================================================================

export type MissionType = 'upgrade' | 'troubleshoot' | 'analyze' | 'deploy' | 'repair' | 'custom' | 'maintain'

export interface MissionStep {
  title: string
  description: string
  command?: string
  yaml?: string
  validation?: string
}

export type MissionClass = 'fixer' | 'install' | 'orbit'

// ── Orbit (Recurring Maintenance) Types ────────────────────────────

export type OrbitCadence = 'daily' | 'weekly' | 'monthly'
export type OrbitType = 'health-check' | 'cert-rotation' | 'version-drift' | 'resource-quota' | 'backup-verification'

export interface OrbitRunHistoryEntry {
  timestamp: string
  result: 'success' | 'warning' | 'failure'
  summary?: string
}

export interface OrbitResourceFilter {
  kind: string
  clusterScoped: boolean
  /** Targeted namespaces for namespaced kinds. Empty array = all namespaces. Ignored for cluster-scoped kinds. */
  namespaces?: string[]
}

export interface OrbitConfig {
  cadence: OrbitCadence
  orbitType: OrbitType
  /** Links to the Mission Control session that spawned this orbit (projects, clusters, phases) */
  parentMissionControlStateKey?: string
  /** CNCF projects covered by this orbit (from the Mission Control payload) */
  projects?: string[]
  /** Target clusters for this orbit */
  clusters?: string[]
  /**
   * Per-cluster resource scope. Key = cluster name.
   * Absent or empty entry for a cluster = all resources (backward-compat).
   */
  resourceFilters?: Record<string, OrbitResourceFilter[]>
  /** ISO timestamp of the last run */
  lastRunAt?: string | null
  /** Result of the last run */
  lastRunResult?: 'success' | 'warning' | 'failure'
  /** ID of the auto-generated Ground Control dashboard */
  groundControlDashboardId?: string
  /** Run history (capped at ORBIT_MAX_HISTORY_ENTRIES) */
  history?: OrbitRunHistoryEntry[]
  /** Auto-run when due — executes automatically when the console is open */
  autoRun?: boolean
}

export interface MissionExport {
  version: string
  /** Stable unique identifier from console-kb (e.g. "install-open-policy-agent-opa"). Used as the canonical deep-link slug when present. */
  name?: string
  title: string
  description: string
  type: MissionType
  tags: string[]
  category?: string
  cncfProject?: string
  missionClass?: MissionClass
  difficulty?: string
  installMethods?: string[]
  author?: string
  authorGithub?: string
  prerequisites?: string[]
  steps: MissionStep[]
  uninstall?: MissionStep[]
  upgrade?: MissionStep[]
  troubleshooting?: MissionStep[]
  /** Security considerations for the install: cluster-scoped changes, privileged access, outbound calls, upstream policy links, hardening options. */
  security?: MissionStep[]
  /** Orbit (recurring maintenance) configuration — present when missionClass is 'orbit' */
  orbitConfig?: OrbitConfig
  resolution?: {
    summary: string
    steps: string[]
    yaml?: string
  }
  metadata?: {
    author?: string
    source?: string
    createdAt?: string
    updatedAt?: string
    qualityScore?: number
    maturity?: string
    projectVersion?: string
    /** Original file format before conversion to MissionExport */
    sourceFormat?: 'json' | 'yaml' | 'markdown'
    /** K8s API groups detected in the source file (e.g., ["ray.io", "karmada.io"]) */
    detectedApiGroups?: string[]
    sourceUrls?: {
      docs?: string
      repo?: string
      helm?: string
      issue?: string
      pr?: string
    }
  }
}

// ============================================================================
// Scanner Types
// ============================================================================

export type FindingSeverity = 'error' | 'warning' | 'info'

export interface ScanFinding {
  severity: FindingSeverity
  code: string
  message: string
  path: string
}

export interface ScanMetadata {
  title: string | null
  type: string | null
  version: string | null
  stepCount?: number
  tagCount?: number
}

export interface FileScanResult {
  valid: boolean
  findings: ScanFinding[]
  metadata: ScanMetadata | null
}

// ============================================================================
// Browsing Types
// ============================================================================

export interface BrowseEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  description?: string
}

export interface MissionMatch {
  mission: MissionExport
  score: number
  matchPercent: number
  matchReasons: string[]
}

// ============================================================================
// Validation
// ============================================================================

export interface ValidationResult {
  valid: boolean
  errors: Array<{ message: string; path?: string }>
  data: MissionExport
}

const MISSION_TYPES: string[] = ['upgrade', 'troubleshoot', 'analyze', 'deploy', 'repair', 'custom', 'maintain']

/**
 * Normalize a raw mission object into a flat MissionExport shape.
 *
 * Console-kb missions use a nested format where the actual content is inside
 * a `mission` wrapper object:
 *   { version, name, missionClass, mission: { title, type, steps, ... } }
 *
 * This function unwraps the nested format and merges top-level metadata
 * (author, authorGithub, version, missionClass, name) with the inner
 * mission content so the validator always sees a flat structure.
 *
 * Also applies lenient defaults for optional fields (tags, description, type)
 * so that KB content with minor omissions still imports successfully.
 */
function normalizeMissionData(raw: Record<string, unknown>): Record<string, unknown> {
  // If there's a nested `mission` object, unwrap it and merge with top-level metadata
  if (raw.mission && typeof raw.mission === 'object' && !Array.isArray(raw.mission)) {
    const inner = raw.mission as Record<string, unknown>
    return {
      // Top-level metadata
      version: raw.version ?? inner.version ?? 'kc-mission-v1',
      name: raw.name ?? inner.name,
      missionClass: raw.missionClass ?? inner.missionClass,
      author: raw.author ?? inner.author,
      authorGithub: raw.authorGithub ?? inner.authorGithub,
      // Inner mission content takes priority
      ...inner,
      // Ensure top-level version/missionClass aren't overwritten by undefined inner values
      ...(raw.version ? { version: raw.version } : {}),
      ...(raw.missionClass ? { missionClass: raw.missionClass } : {}),
    }
  }
  return raw
}

/**
 * Validate that a parsed object conforms to the MissionExport schema.
 *
 * Lenient by design — applies defaults for missing optional fields so that
 * console-kb content and community-contributed missions import successfully
 * even if they don't include every field. Only truly fatal issues (no title
 * AND no name, no steps at all) produce errors.
 */
export function validateMissionExport(obj: unknown): ValidationResult {
  const errors: Array<{ message: string; path?: string }> = []

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return {
      valid: false,
      errors: [{ message: 'Mission must be a JSON object', path: '' }],
      data: obj as unknown as MissionExport,
    }
  }

  // Normalize nested console-kb format into flat structure
  const data = normalizeMissionData(obj as Record<string, unknown>)

  // Version — default if missing
  if (typeof data.version !== 'string') {
    data.version = 'kc-mission-v1'
  }

  // Title — fall back to name field if title is missing
  if (typeof data.title !== 'string' || !data.title) {
    if (typeof data.name === 'string' && data.name) {
      data.title = data.name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    } else {
      errors.push({ message: 'Missing or empty "title" field', path: '.title' })
    }
  }

  // Description — default to empty string if missing
  if (typeof data.description !== 'string') {
    data.description = ''
  }

  // Type — default to 'custom' if missing or unrecognized
  if (typeof data.type !== 'string' || !MISSION_TYPES.includes(data.type)) {
    data.type = 'custom'
  }

  // Tags — default to empty array if missing
  if (!Array.isArray(data.tags)) {
    data.tags = []
  }

  // Steps — this is the only hard requirement (but we're lenient about step content)
  if (!Array.isArray(data.steps) || data.steps.length === 0) {
    errors.push({ message: '"steps" must be a non-empty array', path: '.steps' })
  } else {
    for (let i = 0; i < data.steps.length; i++) {
      const step = data.steps[i] as Record<string, unknown>
      if (!step || typeof step !== 'object') {
        errors.push({ message: `Step ${i} is not an object`, path: `.steps[${i}]` })
        continue
      }
      // Default step title from description or index if missing
      if (typeof step.title !== 'string' || !step.title) {
        step.title = `Step ${i + 1}`
      }
      // Default step description to empty string if missing
      if (typeof step.description !== 'string') {
        step.description = ''
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: data as unknown as MissionExport,
  }
}
