import { BACKEND_HEALTH_CHECK_TIMEOUT_MS } from './constants'
import { safeParseJsonOrNull, API_BASE } from './apiBackendState'
import { reportAppError } from './errors/handleError'

const OAUTH_STARTUP_RETRY_ATTEMPTS = 5
const OAUTH_STARTUP_RETRY_DELAY_MS = 2_000

export async function checkOAuthConfiguredWithRetry(): Promise<{ backendUp: boolean; oauthConfigured: boolean }> {
  let lastResult: { backendUp: boolean; oauthConfigured: boolean } = { backendUp: false, oauthConfigured: false }
  for (let attempt = 0; attempt < OAUTH_STARTUP_RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await checkOAuthConfigured()
      lastResult = result
      if (result.backendUp) return result
    } catch (error: unknown) {
      reportAppError(error, {
        context: '[api] OAuth startup check failed; retrying',
        level: 'warn',
        fallbackMessage: 'oauth startup check failed',
      })
    }
    if (attempt < OAUTH_STARTUP_RETRY_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, OAUTH_STARTUP_RETRY_DELAY_MS))
    }
  }
  return lastResult
}

export async function checkOAuthConfigured(): Promise<{ backendUp: boolean; oauthConfigured: boolean }> {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(BACKEND_HEALTH_CHECK_TIMEOUT_MS),
    })
    if (!response.ok) return { backendUp: false, oauthConfigured: false }
    const data = await safeParseJsonOrNull<{ oauth_configured?: boolean }>(
      response,
      '[api] /health OAuth config parse failed',
    )
    if (!data) return { backendUp: false, oauthConfigured: false }
    return {
      backendUp: true,
      oauthConfigured: !!data.oauth_configured,
    }
  } catch (error: unknown) {
    reportAppError(error, {
      context: '[api] OAuth configured check failed',
      level: 'warn',
      fallbackMessage: 'oauth configured check failed',
    })
    return { backendUp: false, oauthConfigured: false }
  }
}
