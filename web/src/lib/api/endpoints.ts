/** Endpoint used to invalidate the HttpOnly auth cookie on the server side (#6061). */
export const AUTH_LOGOUT_ENDPOINT = '/auth/logout'

/** Endpoint used to verify the HttpOnly cookie is still valid. A 200 here
 *  means the cookie still authenticates, so a 401 from another endpoint was
 *  endpoint-specific (not a session expiry). */
export const AUTH_VERIFY_ENDPOINT = '/api/me'

/** Public API paths that don't require authentication (served without JWT on the backend). */
export const PUBLIC_API_PREFIXES = ['/api/missions/browse', '/api/missions/file', '/api/compliance/']

/**
 * Routes whose 5xx responses indicate an optional upstream/dependency issue,
 * not that the console backend itself is down.
 */
export const BACKEND_OUTAGE_EXEMPT_PREFIXES = ['/api/kagent/', '/api/kagenti-provider/']
