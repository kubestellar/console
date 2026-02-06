/**
 * Resolution Memory System
 *
 * Saves successful resolutions from AI missions and automatically surfaces
 * them in future missions, showing users that their past knowledge is being leveraged.
 */

import { useState, useCallback, useEffect } from 'react'

export interface IssueSignature {
  /** Issue type: CrashLoopBackOff, OOMKilled, ImagePullBackOff, etc. */
  type: string
  /** Regex or keywords from error message */
  errorPattern?: string
  /** Resource kind: Pod, Deployment, Service, etc. */
  resourceKind?: string
  /** Optional namespace pattern */
  namespace?: string
}

export interface ResolutionSteps {
  /** Brief description of the fix */
  summary: string
  /** Step-by-step commands/actions */
  steps: string[]
  /** Config snippets if applicable */
  yaml?: string
}

export interface ResolutionContext {
  cluster?: string
  /** Operators involved: Istio, OPA, Kyverno, etc. */
  operators?: string[]
  k8sVersion?: string
}

export interface ResolutionEffectiveness {
  timesUsed: number
  timesSuccessful: number
  lastUsed?: string // ISO date string
}

export interface Resolution {
  id: string
  /** Source mission ID */
  missionId: string
  /** Creator user ID */
  userId: string
  /** User-editable title */
  title: string
  /** Personal or org-wide */
  visibility: 'private' | 'shared'
  /** Username if shared */
  sharedBy?: string
  issueSignature: IssueSignature
  resolution: ResolutionSteps
  context: ResolutionContext
  effectiveness: ResolutionEffectiveness
  createdAt: string // ISO date string
  updatedAt: string // ISO date string
}

const RESOLUTIONS_STORAGE_KEY = 'kc_resolutions'
const SHARED_RESOLUTIONS_KEY = 'kc_shared_resolutions'

// Common Kubernetes issue patterns for auto-detection
const ISSUE_PATTERNS: { pattern: RegExp; type: string; resourceKind?: string }[] = [
  { pattern: /crashloopbackoff/i, type: 'CrashLoopBackOff', resourceKind: 'Pod' },
  { pattern: /oomkilled|out of memory|memory limit/i, type: 'OOMKilled', resourceKind: 'Pod' },
  { pattern: /imagepullbackoff|errimagepull/i, type: 'ImagePullBackOff', resourceKind: 'Pod' },
  { pattern: /pending.*unschedulable/i, type: 'Unschedulable', resourceKind: 'Pod' },
  { pattern: /readiness probe failed/i, type: 'ReadinessProbe', resourceKind: 'Pod' },
  { pattern: /liveness probe failed/i, type: 'LivenessProbe', resourceKind: 'Pod' },
  { pattern: /failed to pull image/i, type: 'ImagePull', resourceKind: 'Pod' },
  { pattern: /insufficient (cpu|memory)/i, type: 'InsufficientResources', resourceKind: 'Node' },
  { pattern: /certificate.*expired/i, type: 'CertificateExpired' },
  { pattern: /connection refused/i, type: 'ConnectionRefused' },
  { pattern: /service.*not found/i, type: 'ServiceNotFound', resourceKind: 'Service' },
  { pattern: /configmap.*not found/i, type: 'ConfigMapNotFound', resourceKind: 'ConfigMap' },
  { pattern: /secret.*not found/i, type: 'SecretNotFound', resourceKind: 'Secret' },
  { pattern: /pvc.*pending/i, type: 'PVCPending', resourceKind: 'PersistentVolumeClaim' },
  { pattern: /node.*not ready/i, type: 'NodeNotReady', resourceKind: 'Node' },
  { pattern: /deployment.*failed/i, type: 'DeploymentFailed', resourceKind: 'Deployment' },
  { pattern: /rollout.*stuck/i, type: 'RolloutStuck', resourceKind: 'Deployment' },
  { pattern: /quota.*exceeded/i, type: 'QuotaExceeded' },
  { pattern: /network policy/i, type: 'NetworkPolicy', resourceKind: 'NetworkPolicy' },
  { pattern: /rbac|unauthorized|forbidden/i, type: 'RBAC' },
  { pattern: /opa|gatekeeper.*violation/i, type: 'PolicyViolation' },
]

/**
 * Auto-detect issue signature from text content (mission title, description, messages)
 */
export function detectIssueSignature(content: string): Partial<IssueSignature> {
  const normalizedContent = content.toLowerCase()

  for (const { pattern, type, resourceKind } of ISSUE_PATTERNS) {
    if (pattern.test(normalizedContent)) {
      // Extract namespace if mentioned
      const nsMatch = content.match(/namespace[:\s]+["']?([a-z0-9-]+)["']?/i)

      return {
        type,
        resourceKind,
        namespace: nsMatch?.[1],
        errorPattern: extractErrorPattern(content),
      }
    }
  }

  return {
    type: 'Unknown',
    errorPattern: extractErrorPattern(content),
  }
}

/**
 * Extract meaningful error pattern from text
 */
function extractErrorPattern(content: string): string | undefined {
  // Look for error messages in quotes or after common prefixes
  const errorPatterns = [
    /error[:\s]+["']?([^"'\n]{10,100})["']?/i,
    /failed[:\s]+["']?([^"'\n]{10,100})["']?/i,
    /reason[:\s]+["']?([^"'\n]{10,100})["']?/i,
    /message[:\s]+["']?([^"'\n]{10,100})["']?/i,
  ]

  for (const pattern of errorPatterns) {
    const match = content.match(pattern)
    if (match) {
      return match[1].trim()
    }
  }

  return undefined
}

/**
 * Calculate similarity score between two issue signatures (0-1)
 */
export function calculateSignatureSimilarity(a: IssueSignature, b: IssueSignature): number {
  let score = 0
  let factors = 0

  // Issue type match (most important)
  if (a.type && b.type) {
    factors += 3
    if (a.type.toLowerCase() === b.type.toLowerCase()) {
      score += 3
    }
  }

  // Resource kind match
  if (a.resourceKind && b.resourceKind) {
    factors += 1
    if (a.resourceKind.toLowerCase() === b.resourceKind.toLowerCase()) {
      score += 1
    }
  }

  // Namespace match (optional, less weight)
  if (a.namespace && b.namespace) {
    factors += 0.5
    if (a.namespace.toLowerCase() === b.namespace.toLowerCase()) {
      score += 0.5
    }
  }

  // Error pattern similarity (fuzzy match)
  if (a.errorPattern && b.errorPattern) {
    factors += 1
    const similarity = calculateStringSimilarity(a.errorPattern, b.errorPattern)
    score += similarity
  }

  return factors > 0 ? score / factors : 0
}

/**
 * Simple string similarity using Jaccard index on words
 */
function calculateStringSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2))
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2))

  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)))
  const union = new Set([...wordsA, ...wordsB])

  return union.size > 0 ? intersection.size / union.size : 0
}

/**
 * Load resolutions from localStorage
 */
function loadResolutions(): Resolution[] {
  try {
    const stored = localStorage.getItem(RESOLUTIONS_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to load resolutions from localStorage:', e)
  }
  return []
}

/**
 * Save resolutions to localStorage
 */
function saveResolutions(resolutions: Resolution[]): void {
  try {
    localStorage.setItem(RESOLUTIONS_STORAGE_KEY, JSON.stringify(resolutions))
  } catch (e) {
    console.error('Failed to save resolutions to localStorage:', e)
  }
}

/**
 * Load shared resolutions from localStorage (simulates org-wide in MVP)
 */
function loadSharedResolutions(): Resolution[] {
  try {
    const stored = localStorage.getItem(SHARED_RESOLUTIONS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to load shared resolutions from localStorage:', e)
  }
  return []
}

/**
 * Save shared resolutions to localStorage
 */
function saveSharedResolutions(resolutions: Resolution[]): void {
  try {
    localStorage.setItem(SHARED_RESOLUTIONS_KEY, JSON.stringify(resolutions))
  } catch (e) {
    console.error('Failed to save shared resolutions to localStorage:', e)
  }
}

export interface SimilarResolution {
  resolution: Resolution
  similarity: number
  source: 'personal' | 'shared'
}

/**
 * Standalone function to find similar resolutions without needing the hook.
 * Reads directly from localStorage. Use in places where hooks can't be called.
 */
export function findSimilarResolutionsStandalone(
  signature: IssueSignature,
  options?: { minSimilarity?: number; limit?: number }
): SimilarResolution[] {
  const minSimilarity = options?.minSimilarity ?? 0.5
  const limit = options?.limit ?? 5

  const resolutions = loadResolutions()
  const sharedResolutions = loadSharedResolutions()
  const results: SimilarResolution[] = []

  for (const resolution of resolutions) {
    const similarity = calculateSignatureSimilarity(signature, resolution.issueSignature)
    if (similarity >= minSimilarity) {
      results.push({ resolution, similarity, source: 'personal' })
    }
  }

  for (const resolution of sharedResolutions) {
    const similarity = calculateSignatureSimilarity(signature, resolution.issueSignature)
    if (similarity >= minSimilarity) {
      results.push({ resolution, similarity, source: 'shared' })
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit)
}

/**
 * Generate AI prompt context from similar resolutions.
 * Use this to inject resolution knowledge into AI prompts.
 */
export function generateResolutionPromptContext(similarResolutions: SimilarResolution[]): string {
  if (similarResolutions.length === 0) return ''

  const lines = [
    '\n---',
    'PREVIOUS SUCCESSFUL RESOLUTIONS (from your knowledge base):',
  ]

  for (let i = 0; i < Math.min(3, similarResolutions.length); i++) {
    const { resolution, source } = similarResolutions[i]
    const eff = resolution.effectiveness
    const successRate = eff.timesUsed > 0
      ? `${Math.round((eff.timesSuccessful / eff.timesUsed) * 100)}% success rate`
      : 'new resolution'

    lines.push(`\n${i + 1}. [${source === 'personal' ? 'Your history' : 'Team knowledge'}] "${resolution.title}" (${successRate})`)
    lines.push(`   Issue type: ${resolution.issueSignature.type}`)
    lines.push(`   Fix: ${resolution.resolution.summary}`)
    if (resolution.resolution.steps.length > 0) {
      lines.push(`   Steps: ${resolution.resolution.steps.slice(0, 3).join(' → ')}`)
    }
  }

  lines.push('\nConsider these past resolutions when diagnosing and recommending fixes.')
  lines.push('---\n')

  return lines.join('\n')
}

/**
 * Hook for managing resolution memory
 */
export function useResolutions() {
  const [resolutions, setResolutions] = useState<Resolution[]>(() => loadResolutions())
  const [sharedResolutions, setSharedResolutions] = useState<Resolution[]>(() => loadSharedResolutions())

  // Persist changes
  useEffect(() => {
    saveResolutions(resolutions)
  }, [resolutions])

  useEffect(() => {
    saveSharedResolutions(sharedResolutions)
  }, [sharedResolutions])

  /**
   * Find similar resolutions based on issue signature
   */
  const findSimilarResolutions = useCallback((
    signature: IssueSignature,
    options?: { minSimilarity?: number; limit?: number }
  ): SimilarResolution[] => {
    const minSimilarity = options?.minSimilarity ?? 0.5
    const limit = options?.limit ?? 10

    const results: SimilarResolution[] = []

    // Search personal resolutions
    for (const resolution of resolutions) {
      const similarity = calculateSignatureSimilarity(signature, resolution.issueSignature)
      if (similarity >= minSimilarity) {
        results.push({ resolution, similarity, source: 'personal' })
      }
    }

    // Search shared resolutions
    for (const resolution of sharedResolutions) {
      const similarity = calculateSignatureSimilarity(signature, resolution.issueSignature)
      if (similarity >= minSimilarity) {
        results.push({ resolution, similarity, source: 'shared' })
      }
    }

    // Sort by effectiveness (success rate) then similarity
    return results
      .sort((a, b) => {
        // Calculate success rate
        const rateA = a.resolution.effectiveness.timesUsed > 0
          ? a.resolution.effectiveness.timesSuccessful / a.resolution.effectiveness.timesUsed
          : 0
        const rateB = b.resolution.effectiveness.timesUsed > 0
          ? b.resolution.effectiveness.timesSuccessful / b.resolution.effectiveness.timesUsed
          : 0

        // Primary sort by success rate, secondary by similarity
        if (Math.abs(rateA - rateB) > 0.1) {
          return rateB - rateA
        }
        return b.similarity - a.similarity
      })
      .slice(0, limit)
  }, [resolutions, sharedResolutions])

  /**
   * Save a new resolution
   */
  const saveResolution = useCallback((
    params: {
      missionId: string
      title: string
      issueSignature: IssueSignature
      resolution: ResolutionSteps
      context?: ResolutionContext
      visibility?: 'private' | 'shared'
    }
  ): Resolution => {
    const now = new Date().toISOString()
    const newResolution: Resolution = {
      id: `res-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      missionId: params.missionId,
      userId: 'current-user', // MVP: hardcoded, will be from auth in Phase 2
      title: params.title,
      visibility: params.visibility ?? 'private',
      issueSignature: params.issueSignature,
      resolution: params.resolution,
      context: params.context ?? {},
      effectiveness: {
        timesUsed: 0,
        timesSuccessful: 0,
      },
      createdAt: now,
      updatedAt: now,
    }

    if (params.visibility === 'shared') {
      newResolution.sharedBy = 'You' // MVP: hardcoded
      setSharedResolutions(prev => [newResolution, ...prev])
    } else {
      setResolutions(prev => [newResolution, ...prev])
    }

    return newResolution
  }, [])

  /**
   * Update an existing resolution
   */
  const updateResolution = useCallback((
    id: string,
    updates: Partial<Omit<Resolution, 'id' | 'createdAt'>>
  ): void => {
    const updateFn = (prev: Resolution[]) =>
      prev.map(r => r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r)

    // Try both lists
    setResolutions(updateFn)
    setSharedResolutions(updateFn)
  }, [])

  /**
   * Delete a resolution
   */
  const deleteResolution = useCallback((id: string): void => {
    setResolutions(prev => prev.filter(r => r.id !== id))
    setSharedResolutions(prev => prev.filter(r => r.id !== id))
  }, [])

  /**
   * Record usage of a resolution (after user applies it)
   */
  const recordUsage = useCallback((id: string, successful: boolean): void => {
    const updateFn = (prev: Resolution[]) =>
      prev.map(r => {
        if (r.id !== id) return r
        return {
          ...r,
          effectiveness: {
            timesUsed: r.effectiveness.timesUsed + 1,
            timesSuccessful: r.effectiveness.timesSuccessful + (successful ? 1 : 0),
            lastUsed: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        }
      })

    setResolutions(updateFn)
    setSharedResolutions(updateFn)
  }, [])

  /**
   * Share a personal resolution to org
   */
  const shareResolution = useCallback((id: string): void => {
    const resolution = resolutions.find(r => r.id === id)
    if (!resolution) return

    // Remove from personal, add to shared
    setResolutions(prev => prev.filter(r => r.id !== id))
    setSharedResolutions(prev => [{
      ...resolution,
      visibility: 'shared',
      sharedBy: 'You',
      updatedAt: new Date().toISOString(),
    }, ...prev])
  }, [resolutions])

  /**
   * Get resolution by ID
   */
  const getResolution = useCallback((id: string): Resolution | undefined => {
    return resolutions.find(r => r.id === id) ?? sharedResolutions.find(r => r.id === id)
  }, [resolutions, sharedResolutions])

  /**
   * Generate AI prompt context from related resolutions
   */
  const generatePromptContext = useCallback((similarResolutions: SimilarResolution[]): string => {
    if (similarResolutions.length === 0) return ''

    const lines = ['Previous successful resolutions for similar issues:']

    for (let i = 0; i < Math.min(3, similarResolutions.length); i++) {
      const { resolution, source } = similarResolutions[i]
      const eff = resolution.effectiveness
      const successRate = eff.timesUsed > 0
        ? `${Math.round((eff.timesSuccessful / eff.timesUsed) * 100)}% success`
        : 'not yet tested'

      lines.push(`${i + 1}. [${source === 'personal' ? 'Personal' : 'Org'}] ${resolution.title} (${successRate})`)
      lines.push(`   Fix: ${resolution.resolution.summary}`)
      if (resolution.resolution.steps.length > 0) {
        lines.push(`   Steps: ${resolution.resolution.steps.slice(0, 2).join('; ')}${resolution.resolution.steps.length > 2 ? '...' : ''}`)
      }
    }

    return lines.join('\n')
  }, [])

  return {
    resolutions,
    sharedResolutions,
    allResolutions: [...resolutions, ...sharedResolutions],
    findSimilarResolutions,
    saveResolution,
    updateResolution,
    deleteResolution,
    recordUsage,
    shareResolution,
    getResolution,
    generatePromptContext,
    detectIssueSignature,
  }
}
