import {
  MCP_HOOK_TIMEOUT_MS,
  BACKEND_HEALTH_CHECK_TIMEOUT_MS,
  FETCH_DEFAULT_TIMEOUT_MS,
} from '../constants'

export const API_BASE = ''
export const DEFAULT_TIMEOUT = MCP_HOOK_TIMEOUT_MS
export const BACKEND_HEALTH_TIMEOUT_MS = BACKEND_HEALTH_CHECK_TIMEOUT_MS
export const BACKEND_CHECK_INTERVAL_MS = 10_000
export const BACKEND_CACHE_TTL_MS = 300_000
export const BACKEND_OUTAGE_EXEMPT_PREFIXES = ['/api/kagent/', '/api/kagenti-provider/']
export const SESSION_EXPIRY_REDIRECT_MS = 3_000
export const TOKEN_REFRESH_HEADER = 'X-Token-Refresh'
export const AUTH_LOGOUT_ENDPOINT = '/auth/logout'
export const AUTH_VERIFY_ENDPOINT = '/api/me'
export const PUBLIC_API_PREFIXES = ['/api/missions/browse', '/api/missions/file', '/api/compliance/']
export const STORAGE_KEY_RATE_LIMIT_UNTIL = 'kc-api-rate-limit-until'
export const DEFAULT_RATE_LIMIT_RETRY_AFTER_S = 60
export const HANDLING_401_RESET_MS = 10_000
export const SESSION_VERIFY_TIMEOUT_MS = 3_000
export const BACKEND_STATUS_KEY = 'kc-backend-status'
export const OAUTH_STARTUP_RETRY_ATTEMPTS = 5
export const OAUTH_STARTUP_RETRY_DELAY_MS = 2_000
export { FETCH_DEFAULT_TIMEOUT_MS }
