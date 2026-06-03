// Barrel exports for shared Netlify function utilities
export {
  isAllowedOrigin,
  isAllowedConsoleOrigin,
  buildCorsHeaders,
  buildConsoleCorsHeaders,
  handlePreflight,
  handleConsolePreflight,
} from "./cors";
export type { CorsOptions } from "./cors";

export { enforceSimpleRateLimit } from "./rate-limit";
export type { SimpleRateLimitOptions, SimpleRateLimitResult } from "./rate-limit";

export { checkInMemoryRateLimit, getClientIp } from "./inMemoryRateLimit";
export type { InMemoryRateLimitEntry, InMemoryRateLimitResult } from "./inMemoryRateLimit";

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
