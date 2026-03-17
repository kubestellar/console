/**
 * Mission Types
 *
 * Shared type definitions for the mission import/export system.
 */

// ============================================================================
// Core Mission Export Format
// ============================================================================

export type MissionType = 'upgrade' | 'troubleshoot' | 'analyze' | 'deploy' | 'repair' | 'custom'

export interface MissionStep {
  title: string
  description: string
  command?: string
  yaml?: string
  validation?: string
}

export type MissionClass = 'solution' | 'install'

export interface MissionExport {
  version: string
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

const MISSION_TYPES: string[] = ['upgrade', 'troubleshoot', 'analyze', 'deploy', 'repair', 'custom']

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
