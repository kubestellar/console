export {
  API_BASE,
  BACKEND_OUTAGE_EXEMPT_PREFIXES,
  DEFAULT_TIMEOUT,
  PUBLIC_API_PREFIXES,
  TOKEN_REFRESH_HEADER,
  UnauthenticatedError,
  UnauthorizedError,
  RateLimitError,
  BackendUnavailableError,
  handle429,
  handle401,
  checkBackendAvailability,
  markBackendFailure,
  markBackendSuccess,
  createErrorWithCause,
  safeReadTextOrEmpty,
  safeParseJsonOrNull,
  isBackendUnavailable,
  extractRequestPath,
  shouldTreatAsBackendOutage,
} from './apiBackendState'

export {
  checkOAuthConfigured,
  checkOAuthConfiguredWithRetry,
} from './apiOAuth'

export { api } from './apiClient'
export { safeJson, authFetch } from './apiFetch'
