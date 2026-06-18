export {
  UnauthenticatedError,
  UnauthorizedError,
  RateLimitError,
  BackendUnavailableError,
} from './apiErrors'

export {
  checkBackendAvailability,
  checkOAuthConfigured,
  checkOAuthConfiguredWithRetry,
  isBackendUnavailable,
} from './apiBackendCheck'

export {
  api,
  authFetch,
  safeJson,
} from './apiClient'
