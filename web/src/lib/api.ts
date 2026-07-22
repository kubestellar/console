/**
 * Public API surface for the console HTTP client.
 *
 * Re-exports from focused sub-modules in api/:
 *   - api/types.ts    — Error classes and the OAuthProbeResult interface
 *   - api/endpoints.ts — Endpoint path constants
 *   - api/helpers.ts  — Response parsing utilities (safeJson, etc.)
 *   - api/session.ts  — Session/auth error handling (handle401/429, expiry)
 *   - api/backend.ts  — Backend availability tracking and OAuth probing
 *   - api/client.ts   — ApiClient class, singleton `api`, and authFetch
 *
 * Tracked by #21384 (part of #21375).
 */

export {
  UnauthenticatedError,
  UnauthorizedError,
  RateLimitError,
  BackendUnavailableError,
  type OAuthProbeResult,
} from './api/types'

export {
  checkBackendAvailability,
  checkOAuthConfigured,
  checkOAuthConfiguredWithRetry,
  isBackendUnavailable,
} from './api/backend'

export { safeJson } from './api/helpers'

export { api, authFetch } from './api/client'

import { resetBackendStateForTests } from './api/backend'
import { resetSessionStateForTests } from './api/session'

export function resetApiClientStateForTests(): void {
  resetBackendStateForTests()
  resetSessionStateForTests()
}
