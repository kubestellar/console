/**
 * api/index.ts — Barrel export for API modules.
 * Created per issue #19013 to modularize api.ts.
 */

// Re-export error classes
export { UnauthenticatedError, UnauthorizedError, RateLimitError, BackendUnavailableError } from '../apiErrors'

// Re-export backend check functions
export { checkOAuthConfiguredWithRetry, checkOAuthConfigured, isBackendUnavailable } from '../apiBackendCheck'

// Re-export core client
export { ApiClient } from './client'

// Re-export utilities
export { safeJson, authFetch } from './utils'
