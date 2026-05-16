// Barrel exports for shared Netlify function utilities
export { isAllowedOrigin, buildCorsHeaders, handlePreflight } from "./cors";
export type { CorsOptions } from "./cors";

export { enforceSimpleRateLimit } from "./rate-limit";
export type { SimpleRateLimitOptions, SimpleRateLimitResult } from "./rate-limit";

export { fetchWithTimeout } from "./fetchWithTimeout";
export type { FetchWithTimeoutOptions } from "./fetchWithTimeout";

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
