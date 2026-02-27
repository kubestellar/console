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

export interface MissionExport {
  version: string
  title: string
  description: string
  type: MissionType
  tags: string[]
  category?: string
  cncfProject?: string
  prerequisites?: string[]
  steps: MissionStep[]
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
 * Validate that a parsed object conforms to the MissionExport schema.
 */
export function validateMissionExport(obj: unknown): ValidationResult {
  const errors: Array<{ message: string; path?: string }> = []
  const data = obj as Record<string, unknown>

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      valid: false,
      errors: [{ message: 'Mission must be a JSON object', path: '' }],
      data: data as unknown as MissionExport,
    }
  }

  if (typeof data.version !== 'string') {
    errors.push({ message: 'Missing or invalid "version" field', path: '.version' })
  }

  if (typeof data.title !== 'string' || !data.title) {
    errors.push({ message: 'Missing or empty "title" field', path: '.title' })
  }

  if (typeof data.description !== 'string') {
    errors.push({ message: 'Missing "description" field', path: '.description' })
  }

  if (typeof data.type !== 'string' || !MISSION_TYPES.includes(data.type)) {
    errors.push({
      message: `Invalid "type" — expected one of: ${MISSION_TYPES.join(', ')}`,
      path: '.type',
    })
  }

  if (!Array.isArray(data.tags)) {
    errors.push({ message: '"tags" must be an array', path: '.tags' })
  }

  if (!Array.isArray(data.steps) || data.steps.length === 0) {
    errors.push({ message: '"steps" must be a non-empty array', path: '.steps' })
  } else {
    for (let i = 0; i < data.steps.length; i++) {
      const step = data.steps[i] as Record<string, unknown>
      if (!step || typeof step !== 'object') {
        errors.push({ message: `Step ${i} is not an object`, path: `.steps[${i}]` })
        continue
      }
      if (typeof step.title !== 'string' || !step.title) {
        errors.push({ message: `Step ${i} missing "title"`, path: `.steps[${i}].title` })
      }
      if (typeof step.description !== 'string') {
        errors.push({ message: `Step ${i} missing "description"`, path: `.steps[${i}].description` })
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: data as unknown as MissionExport,
  }
}
