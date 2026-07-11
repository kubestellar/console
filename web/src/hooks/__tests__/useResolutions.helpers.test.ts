/**
 * Unit tests for the pure helper functions in useResolutions.ts
 *
 * Covers: detectIssueSignature, calculateSignatureSimilarity,
 * generateResolutionPromptContext, and findSimilarResolutionsStandalone.
 *
 * Partially addresses #20495
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  detectIssueSignature,
  calculateSignatureSimilarity,
  generateResolutionPromptContext,
  findSimilarResolutionsStandalone,
} from '../useResolutions'
import type { IssueSignature, SimilarResolution, Resolution } from '../useResolutions'

// ---------------------------------------------------------------------------
// detectIssueSignature
// ---------------------------------------------------------------------------

describe('detectIssueSignature', () => {
  it('detects CrashLoopBackOff from error message', () => {
    const result = detectIssueSignature('Pod in CrashLoopBackOff state')
    expect(result.type).toBe('CrashLoopBackOff')
    expect(result.resourceKind).toBe('Pod')
  })

  it('detects OOMKilled from different phrasings', () => {
    expect(detectIssueSignature('container was OOMKilled').type).toBe('OOMKilled')
    expect(detectIssueSignature('pod out of memory').type).toBe('OOMKilled')
    expect(detectIssueSignature('exceeded memory limit').type).toBe('OOMKilled')
  })

  it('detects ImagePullBackOff', () => {
    const result = detectIssueSignature('Pod stuck in ImagePullBackOff')
    expect(result.type).toBe('ImagePullBackOff')
    expect(result.resourceKind).toBe('Pod')
  })

  it('detects Unschedulable pods', () => {
    const result = detectIssueSignature('Pod pending unschedulable')
    expect(result.type).toBe('Unschedulable')
    expect(result.resourceKind).toBe('Pod')
  })

  it('detects probe failures', () => {
    expect(detectIssueSignature('readiness probe failed').type).toBe('ReadinessProbe')
    expect(detectIssueSignature('liveness probe failed').type).toBe('LivenessProbe')
  })

  it('detects insufficient resources', () => {
    const result = detectIssueSignature('insufficient cpu on node')
    expect(result.type).toBe('InsufficientResources')
    expect(result.resourceKind).toBe('Node')
  })

  it('detects certificate errors', () => {
    const result = detectIssueSignature('TLS certificate expired for api-server')
    expect(result.type).toBe('CertificateExpired')
  })

  it('detects RBAC/auth issues', () => {
    expect(detectIssueSignature('RBAC permission denied').type).toBe('RBAC')
    expect(detectIssueSignature('unauthorized access to resource').type).toBe('RBAC')
    expect(detectIssueSignature('forbidden: User cannot list pods').type).toBe('RBAC')
  })

  it('detects PVC pending', () => {
    const result = detectIssueSignature('PVC stuck in pending state')
    expect(result.type).toBe('PVCPending')
    expect(result.resourceKind).toBe('PersistentVolumeClaim')
  })

  it('detects node not ready', () => {
    const result = detectIssueSignature('node worker-3 is not ready')
    expect(result.type).toBe('NodeNotReady')
    expect(result.resourceKind).toBe('Node')
  })

  it('detects deployment failures', () => {
    const result = detectIssueSignature('deployment failed to progress')
    expect(result.type).toBe('DeploymentFailed')
    expect(result.resourceKind).toBe('Deployment')
  })

  it('detects rollout stuck', () => {
    const result = detectIssueSignature('rollout stuck waiting for pods')
    expect(result.type).toBe('RolloutStuck')
    expect(result.resourceKind).toBe('Deployment')
  })

  it('detects quota exceeded', () => {
    const result = detectIssueSignature('resource quota exceeded in namespace dev')
    expect(result.type).toBe('QuotaExceeded')
  })

  it('detects network policy issues', () => {
    const result = detectIssueSignature('blocked by network policy')
    expect(result.type).toBe('NetworkPolicy')
    expect(result.resourceKind).toBe('NetworkPolicy')
  })

  it('detects OPA/Gatekeeper violations', () => {
    const result = detectIssueSignature('gatekeeper violation: containers must not run as root')
    expect(result.type).toBe('PolicyViolation')
  })

  it('extracts namespace from content', () => {
    const result = detectIssueSignature('Pod CrashLoopBackOff in namespace: production')
    expect(result.namespace).toBe('production')
  })

  it('extracts namespace with quotes', () => {
    const result = detectIssueSignature('CrashLoopBackOff namespace: "kube-system"')
    expect(result.namespace).toBe('kube-system')
  })

  it('returns Unknown type for unrecognized errors', () => {
    const result = detectIssueSignature('some random text without known patterns')
    expect(result.type).toBe('Unknown')
  })

  it('extracts error pattern from content', () => {
    const result = detectIssueSignature('error: "connection timed out after 30s to api-server"')
    expect(result.errorPattern).toBeDefined()
    expect(result.errorPattern).toContain('connection timed out')
  })

  it('is case-insensitive for pattern matching', () => {
    expect(detectIssueSignature('CRASHLOOPBACKOFF').type).toBe('CrashLoopBackOff')
    expect(detectIssueSignature('imagepullbackoff').type).toBe('ImagePullBackOff')
  })
})

// ---------------------------------------------------------------------------
// calculateSignatureSimilarity
// ---------------------------------------------------------------------------

describe('calculateSignatureSimilarity', () => {
  it('returns 1.0 for identical signatures', () => {
    const sig: IssueSignature = {
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
      namespace: 'default',
      errorPattern: 'exit code 137',
    }
    expect(calculateSignatureSimilarity(sig, sig)).toBe(1)
  })

  it('returns high score for same type and resource kind', () => {
    const a: IssueSignature = { type: 'OOMKilled', resourceKind: 'Pod' }
    const b: IssueSignature = { type: 'OOMKilled', resourceKind: 'Pod' }
    expect(calculateSignatureSimilarity(a, b)).toBe(1)
  })

  it('returns 0 when types differ completely', () => {
    const a: IssueSignature = { type: 'CrashLoopBackOff', resourceKind: 'Pod' }
    const b: IssueSignature = { type: 'QuotaExceeded', resourceKind: 'Node' }
    expect(calculateSignatureSimilarity(a, b)).toBe(0)
  })

  it('gives partial credit for matching type but different resource kind', () => {
    const a: IssueSignature = { type: 'CrashLoopBackOff', resourceKind: 'Pod' }
    const b: IssueSignature = { type: 'CrashLoopBackOff', resourceKind: 'Deployment' }
    const score = calculateSignatureSimilarity(a, b)
    expect(score).toBeGreaterThan(0.5) // type matches (weight 3) but resource differs
    expect(score).toBeLessThan(1)
  })

  it('gives extra credit for matching namespace', () => {
    const a: IssueSignature = { type: 'OOMKilled', namespace: 'production' }
    const b: IssueSignature = { type: 'OOMKilled', namespace: 'production' }
    const withNamespace = calculateSignatureSimilarity(a, b)

    const c: IssueSignature = { type: 'OOMKilled', namespace: 'production' }
    const d: IssueSignature = { type: 'OOMKilled', namespace: 'staging' }
    const withoutNamespace = calculateSignatureSimilarity(c, d)

    expect(withNamespace).toBeGreaterThan(withoutNamespace)
  })

  it('is case-insensitive for type comparison', () => {
    const a: IssueSignature = { type: 'crashloopbackoff' }
    const b: IssueSignature = { type: 'CrashLoopBackOff' }
    expect(calculateSignatureSimilarity(a, b)).toBe(1)
  })

  it('returns 0 for signatures with no overlapping fields', () => {
    const a: IssueSignature = { type: '' }
    const b: IssueSignature = { type: '' }
    // Empty strings are falsy — the type comparison is skipped,
    // so factors stays 0 and the function returns 0.
    expect(calculateSignatureSimilarity(a, b)).toBe(0)
  })

  it('includes error pattern similarity', () => {
    const a: IssueSignature = { type: 'Unknown', errorPattern: 'connection refused to database' }
    const b: IssueSignature = { type: 'Unknown', errorPattern: 'connection refused to api server' }
    const score = calculateSignatureSimilarity(a, b)
    // "connection" and "refused" match, "to" is filtered (<=2 chars)
    expect(score).toBeGreaterThan(0.5)
  })

  it('handles undefined fields gracefully', () => {
    const a: IssueSignature = { type: 'CrashLoopBackOff' }
    const b: IssueSignature = { type: 'CrashLoopBackOff', resourceKind: 'Pod', namespace: 'default' }
    // Only type is compared since a has no resourceKind/namespace
    const score = calculateSignatureSimilarity(a, b)
    expect(score).toBe(1) // type matches, other fields aren't compared
  })
})

// ---------------------------------------------------------------------------
// generateResolutionPromptContext
// ---------------------------------------------------------------------------

describe('generateResolutionPromptContext', () => {
  const makeResolution = (overrides?: Partial<Resolution>): Resolution => ({
    id: 'res-1',
    missionId: 'mission-1',
    userId: 'user-1',
    title: 'Fix OOMKilled pods',
    visibility: 'private',
    issueSignature: { type: 'OOMKilled', resourceKind: 'Pod' },
    resolution: {
      summary: 'Increase memory limits',
      steps: ['kubectl edit deployment', 'set resources.limits.memory=512Mi', 'apply changes'],
    },
    context: {},
    effectiveness: { timesUsed: 5, timesSuccessful: 4 },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  })

  it('returns empty string for no resolutions', () => {
    expect(generateResolutionPromptContext([])).toBe('')
  })

  it('includes resolution title and source', () => {
    const result = generateResolutionPromptContext([
      { resolution: makeResolution(), similarity: 0.9, source: 'personal' },
    ])
    expect(result).toContain('Fix OOMKilled pods')
    expect(result).toContain('Your history')
  })

  it('shows team knowledge for shared resolutions', () => {
    const result = generateResolutionPromptContext([
      { resolution: makeResolution(), similarity: 0.9, source: 'shared' },
    ])
    expect(result).toContain('Team knowledge')
  })

  it('includes success rate when timesUsed > 0', () => {
    const result = generateResolutionPromptContext([
      {
        resolution: makeResolution({ effectiveness: { timesUsed: 10, timesSuccessful: 8 } }),
        similarity: 0.9,
        source: 'personal',
      },
    ])
    expect(result).toContain('80% success rate')
  })

  it('shows "new resolution" for unused resolutions', () => {
    const result = generateResolutionPromptContext([
      {
        resolution: makeResolution({ effectiveness: { timesUsed: 0, timesSuccessful: 0 } }),
        similarity: 0.9,
        source: 'personal',
      },
    ])
    expect(result).toContain('new resolution')
  })

  it('includes fix summary', () => {
    const result = generateResolutionPromptContext([
      { resolution: makeResolution(), similarity: 0.9, source: 'personal' },
    ])
    expect(result).toContain('Increase memory limits')
  })

  it('includes steps (up to 3)', () => {
    const result = generateResolutionPromptContext([
      { resolution: makeResolution(), similarity: 0.9, source: 'personal' },
    ])
    expect(result).toContain('kubectl edit deployment')
    expect(result).toContain('set resources.limits.memory=512Mi')
  })

  it('limits to 3 resolutions in prompt', () => {
    const resolutions: SimilarResolution[] = Array.from({ length: 5 }, (_, i) => ({
      resolution: makeResolution({ id: `res-${i}`, title: `Fix ${i}` }),
      similarity: 0.9 - i * 0.1,
      source: 'personal' as const,
    }))
    const result = generateResolutionPromptContext(resolutions)
    expect(result).toContain('Fix 0')
    expect(result).toContain('Fix 1')
    expect(result).toContain('Fix 2')
    expect(result).not.toContain('Fix 3')
    expect(result).not.toContain('Fix 4')
  })

  it('includes issue type', () => {
    const result = generateResolutionPromptContext([
      { resolution: makeResolution(), similarity: 0.9, source: 'personal' },
    ])
    expect(result).toContain('OOMKilled')
  })
})

// ---------------------------------------------------------------------------
// findSimilarResolutionsStandalone
// ---------------------------------------------------------------------------

describe('findSimilarResolutionsStandalone', () => {
  const mockResolution: Resolution = {
    id: 'res-1',
    missionId: 'mission-1',
    userId: 'user-1',
    title: 'Fix OOMKilled pods',
    visibility: 'private',
    issueSignature: { type: 'OOMKilled', resourceKind: 'Pod' },
    resolution: { summary: 'Increase memory', steps: [] },
    context: {},
    effectiveness: { timesUsed: 1, timesSuccessful: 1 },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear()
  })

  it('returns empty array when no resolutions stored', () => {
    const result = findSimilarResolutionsStandalone({ type: 'OOMKilled' })
    expect(result).toEqual([])
  })

  it('finds matching resolutions from localStorage', () => {
    localStorage.setItem('kc_resolutions', JSON.stringify([mockResolution]))
    const result = findSimilarResolutionsStandalone({ type: 'OOMKilled', resourceKind: 'Pod' })
    expect(result).toHaveLength(1)
    expect(result[0].resolution.id).toBe('res-1')
    expect(result[0].source).toBe('personal')
  })

  it('finds matching shared resolutions', () => {
    localStorage.setItem('kc_shared_resolutions', JSON.stringify([{ ...mockResolution, visibility: 'shared' }]))
    const result = findSimilarResolutionsStandalone({ type: 'OOMKilled', resourceKind: 'Pod' })
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('shared')
  })

  it('respects minSimilarity threshold', () => {
    localStorage.setItem('kc_resolutions', JSON.stringify([mockResolution]))
    // Different type should have low similarity
    const result = findSimilarResolutionsStandalone(
      { type: 'QuotaExceeded', resourceKind: 'Namespace' },
      { minSimilarity: 0.5 }
    )
    expect(result).toHaveLength(0)
  })

  it('respects limit option', () => {
    const resolutions = Array.from({ length: 10 }, (_, i) => ({
      ...mockResolution,
      id: `res-${i}`,
    }))
    localStorage.setItem('kc_resolutions', JSON.stringify(resolutions))
    const result = findSimilarResolutionsStandalone(
      { type: 'OOMKilled', resourceKind: 'Pod' },
      { limit: 3 }
    )
    expect(result.length).toBeLessThanOrEqual(3)
  })

  it('sorts results by similarity descending', () => {
    const resolutions: Resolution[] = [
      { ...mockResolution, id: 'res-exact', issueSignature: { type: 'OOMKilled', resourceKind: 'Pod', namespace: 'prod' } },
      { ...mockResolution, id: 'res-partial', issueSignature: { type: 'OOMKilled', resourceKind: 'Deployment' } },
    ]
    localStorage.setItem('kc_resolutions', JSON.stringify(resolutions))
    const result = findSimilarResolutionsStandalone(
      { type: 'OOMKilled', resourceKind: 'Pod', namespace: 'prod' },
      { minSimilarity: 0.3 }
    )
    expect(result.length).toBe(2)
    expect(result[0].similarity).toBeGreaterThanOrEqual(result[1].similarity)
  })

  it('handles invalid JSON in localStorage gracefully', () => {
    localStorage.setItem('kc_resolutions', 'not-json')
    const result = findSimilarResolutionsStandalone({ type: 'OOMKilled' })
    expect(result).toEqual([])
  })
})
