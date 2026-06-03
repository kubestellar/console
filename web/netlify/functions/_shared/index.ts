// Barrel exports for shared Netlify function utilities
export {
  isAllowedOrigin,
  buildCorsHeaders,
  handlePreflight,
  buildStrictKubestellarCorsHeaders,
  getStrictKubestellarCorsOrigin,
  STRICT_KUBESTELLAR_ORIGINS,
} from "./cors";
export type { CorsOptions, StrictCorsOptions } from "./cors";

export { enforceSimpleRateLimit } from "./rate-limit";
export type { SimpleRateLimitOptions, SimpleRateLimitResult } from "./rate-limit";

export {
  DEFAULT_ALLOWED_REPOS,
  getAllowedRepoSlugs,
  isAllowedRepo,
  isAllowedRepoSlug,
} from "./repo-allowlist";

export { checkInMemoryRateLimit, getClientIp } from "./inMemoryRateLimit";
export type {
  CheckInMemoryRateLimitOptions,
  InMemoryRateLimitEntry,
  InMemoryRateLimitResult,
} from "./inMemoryRateLimit";

export { fetchWithTimeout } from "./fetchWithTimeout";
export type { FetchWithTimeoutOptions } from "./fetchWithTimeout";

export { readCappedBody, BodyTooLargeError } from "./readCappedBody";

export { fetchWithRetry } from "./fetchWithRetry";
export type { FetchWithRetryOptions } from "./fetchWithRetry";

export {
  errorResponse,
  rateLimitResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  serverErrorResponse,
} from "./errorResponse";
export type { ErrorResponseOptions, ErrorResponseBody } from "./errorResponse";
