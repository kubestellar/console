/**
 * api/index.ts — Barrel export for API modules.
 * Created per issue #19013 to modularize api.ts by domain.
 */

// Re-export error classes from separate modules
export { UnauthenticatedError, UnauthorizedError, RateLimitError, BackendUnavailableError } from '../apiErrors'

// Re-export backend check functions
export { checkOAuthConfiguredWithRetry, checkOAuthConfigured, isBackendUnavailable } from '../apiBackendCheck'

// Re-export core client
export { ApiClient, api } from './client'

// Re-export utilities
export { safeJson, authFetch } from './utils'

// Re-export domain-specific API functions
export * from './cluster'
export * from './settings'
export * from './dashboard'
export * from './agent'
