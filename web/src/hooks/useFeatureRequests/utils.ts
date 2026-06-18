import { getStoredAuthToken } from '../../lib/authToken'
import { STORAGE_KEY_TOKEN, STORAGE_KEY_HAS_SESSION, DEMO_TOKEN_VALUE } from '../../lib/constants'
import type { FeatureRequest } from './types'

/** Cache TTL: 30 seconds — polling interval for status updates */
export const CACHE_TTL_MS = 30_000

export async function isDemoUser(): Promise<boolean> {
  if (localStorage.getItem(STORAGE_KEY_HAS_SESSION) === 'true') return false
  const token = await getStoredAuthToken() || localStorage.getItem(STORAGE_KEY_TOKEN)
  return !token || token === DEMO_TOKEN_VALUE
}

export function isFeedbackBodyLimitError(message: string): boolean {
  return message.includes('Request Entity Too Large') ||
    message.includes('Feedback attachments exceed the 10 MB upload limit') ||
    message.includes('413')
}

export function sortRequests(requests: FeatureRequest[], currentGitHubLogin: string): FeatureRequest[] {
  const userRequests: FeatureRequest[] = []
  const otherRequests: FeatureRequest[] = []

  for (const request of (requests || [])) {
    const isOwner = request.github_login
      ? request.github_login === currentGitHubLogin
      : request.user_id === currentGitHubLogin
    if (isOwner) {
      userRequests.push(request)
    } else {
      otherRequests.push(request)
    }
  }

  const sortByDate = (a: FeatureRequest, b: FeatureRequest) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()

  userRequests.sort(sortByDate)
  otherRequests.sort(sortByDate)

  return [...userRequests, ...otherRequests]
}
