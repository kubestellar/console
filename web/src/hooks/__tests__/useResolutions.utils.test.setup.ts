import type { Resolution } from '../useResolutions'

export {
  detectIssueSignature,
  findSimilarResolutionsStandalone,
  generateResolutionPromptContext,
  calculateSignatureSimilarity,
  useResolutions,
  type IssueSignature,
  type Resolution,
  type SimilarResolution,
} from '../useResolutions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function makeResolution(overrides: Partial<Resolution> = {}): Resolution {
  return {
    id: `res-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    missionId: 'mission-1',
    userId: 'user-1',
    title: 'Fix CrashLoopBackOff',
    visibility: 'private',
    issueSignature: {
      type: 'CrashLoopBackOff',
      resourceKind: 'Pod',
    },
    resolution: {
      summary: 'Increase memory limits',
      steps: ['kubectl edit deployment', 'Set memory to 512Mi'],
    },
    context: {},
    effectiveness: { timesUsed: 5, timesSuccessful: 4 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function seedLocalStorage(
  personal: Resolution[] = [],
  shared: Resolution[] = [],
): void {
  if (personal.length > 0) {
    localStorage.setItem('kc_resolutions', JSON.stringify(personal))
  }
  if (shared.length > 0) {
    localStorage.setItem('kc_shared_resolutions', JSON.stringify(shared))
  }
}

// ---------------------------------------------------------------------------
// detectIssueSignature
// ---------------------------------------------------------------------------
