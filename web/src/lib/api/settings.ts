/**
 * api/settings.ts — Settings and configuration API operations.
 * Created per issue #19013 to split api.ts by domain.
 */
import { api } from './client'

export interface OnboardingResponse {
  completed: boolean
}

/**
 * Submit onboarding responses.
 */
export async function submitOnboardingResponses(responses: Record<string, unknown>): Promise<void> {
  await api.post('/api/onboarding/responses', responses)
}

/**
 * Mark onboarding as complete.
 */
export async function completeOnboarding(data: Record<string, unknown>): Promise<void> {
  await api.post('/api/onboarding/complete', data)
}

/**
 * Get settings from backend.
 */
export async function getSettings(): Promise<unknown> {
  const { data } = await api.get('/api/settings')
  return data
}

/**
 * Update settings.
 */
export async function updateSettings(settings: Record<string, unknown>): Promise<unknown> {
  const { data } = await api.post('/api/settings', settings)
  return data
}
