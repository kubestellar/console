/**
 * HTTP Status Constants
 *
 * Centralizes HTTP status codes that were previously re-declared as file-local
 * magic numbers across 20+ hooks and libraries (`const NOT_FOUND_STATUS = 404`,
 * `const STATUS_SERVICE_UNAVAILABLE = 503`, ...).
 *
 * Import from here instead of introducing a new local constant.
 */

/** 200 — request succeeded. */
export const HTTP_OK = 200

/** 204 — request succeeded with an intentionally empty body. */
export const HTTP_NO_CONTENT = 204

/** 400 — malformed request; retrying without changes will fail again. */
export const HTTP_BAD_REQUEST = 400

/** 401 — missing/expired credentials; the caller should re-authenticate. */
export const HTTP_UNAUTHORIZED = 401

/** 403 — authenticated but not permitted (commonly RBAC denials). */
export const HTTP_FORBIDDEN = 403

/** 404 — resource absent. Often treated as "feature not installed" / empty. */
export const HTTP_NOT_FOUND = 404

/** 409 — conflicting concurrent write; the caller should refetch and retry. */
export const HTTP_CONFLICT = 409

/** 429 — client is rate limited; back off before retrying. */
export const HTTP_TOO_MANY_REQUESTS = 429

/** 500 — unexpected server-side failure. */
export const HTTP_INTERNAL_SERVER_ERROR = 500

/** 503 — backend reachable but dependency (agent/cluster) is unavailable. */
export const HTTP_SERVICE_UNAVAILABLE = 503
