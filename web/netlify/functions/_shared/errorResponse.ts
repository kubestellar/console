/**
 * Shared error response formatting for Netlify functions.
 * This provides a consistent JSON error shape across all endpoints.
 */

export interface ErrorResponseOptions {
  status?: number;
  headers?: Record<string, string>;
}

export interface ErrorResponseBody {
  error: string;
  code?: string;
}

/**
 * Build a consistent error response as JSON.
 * Default status is 500 (Internal Server Error) if not specified.
 */
export function errorResponse(
  message: string,
  options?: ErrorResponseOptions,
): Response {
  const { status = 500, headers = {} } = options || {};

  const body: ErrorResponseBody = {
    error: message,
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

/**
 * Build a rate limit error response with Retry-After header.
 */
export function rateLimitResponse(
  retryAfterSeconds: number,
  headers?: Record<string, string>,
): Response {
  const body = {
    error: "Rate limit exceeded",
    retryAfter: retryAfterSeconds,
  };

  return new Response(JSON.stringify(body), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSeconds),
      ...headers,
    },
  });
}

/**
 * Build a bad request (400) error response.
 */
export function badRequestResponse(
  message: string,
  headers?: Record<string, string>,
): Response {
  return errorResponse(message, { status: 400, headers });
}

/**
 * Build an unauthorized (401) error response.
 */
export function unauthorizedResponse(
  message: string = "Unauthorized",
  headers?: Record<string, string>,
): Response {
  return errorResponse(message, { status: 401, headers });
}

/**
 * Build a not found (404) error response.
 */
export function notFoundResponse(
  message: string,
  headers?: Record<string, string>,
): Response {
  return errorResponse(message, { status: 404, headers });
}

/**
 * Build a server error (500) response.
 */
export function serverErrorResponse(
  message: string = "Internal server error",
  headers?: Record<string, string>,
): Response {
  return errorResponse(message, { status: 500, headers });
}
