import type { FeatureRequest } from '../../hooks/useFeatureRequests'

const VERIFIED_FIX_STORAGE_KEY_PREFIX = 'ks-console:verified-fix'

export function getVerifiedFixStorageKey(request: FeatureRequest): string {
  const issueId = request.github_issue_number ?? request.id
  const fixId = request.pr_number ?? 'no-pr'

  return `${VERIFIED_FIX_STORAGE_KEY_PREFIX}:${issueId}:${fixId}`
}

export function readVerifiedFixState(storageKey: string): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.localStorage.getItem(storageKey) === 'true'
  } catch {
    return false
  }
}

export function writeVerifiedFixState(storageKey: string, isVerified: boolean): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (isVerified) {
      window.localStorage.setItem(storageKey, 'true')
      return
    }

    window.localStorage.removeItem(storageKey)
  } catch {
    // Ignore storage failures so the verification flow still works.
  }
}
