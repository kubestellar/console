/**
 * Runtime validation utilities for API responses using Zod.
 *
 * These helpers wrap `.safeParse()` so that validation failures log a
 * warning instead of crashing. This is intentional: we want to know
 * when the backend contract drifts, but we don't want a schema mismatch
 * to hard-crash the UI for users.
 */
import type { ZodType, ZodError } from 'zod'

/** Maximum number of Zod issues to log per validation failure. */
const MAX_LOGGED_ISSUES = 5

/**
 * Validate `data` against a Zod schema. On success, returns the parsed
 * (and potentially coerced) value. On failure, logs a warning with the
 * endpoint label and returns `null`.
 *
 * @param schema  Zod schema to validate against
 * @param data    Raw data from `response.json()`
 * @param label   Human-readable label for log messages (e.g. "/auth/refresh")
 */
export function validateResponse<T>(
  schema: ZodType<T>,
  data: unknown,
  label: string,
): T | null {
  const result = schema.safeParse(data)
  if (result.success) {
    return result.data
  }
  logValidationWarning(label, result.error)
  return null
}

/**
 * Validate an API response that wraps an array in an envelope object
 * (e.g. `{ pods: [...] }`). The schema is used only for validation — the
 * original data is returned on success (preserving the caller's expected
 * TypeScript type). On failure, logs a warning and returns a safe fallback
 * with an empty array for the result key so callers never crash on undefined.
 *
 * The `TResult` type parameter is the caller's expected shape (e.g.
 * `{ pods: PodInfo[] }`). It is separate from the Zod schema's inferred
 * type to avoid structural mismatches between Zod output and existing
 * TypeScript interfaces.
 *
 * @param schema    Zod schema for the envelope object
 * @param data      Raw data from `response.json()`
 * @param label     Human-readable label for log messages
 * @param resultKey The key holding the array (e.g. "pods", "nodes")
 */
export function validateArrayResponse<TResult>(
  schema: ZodType,
  data: unknown,
  label: string,
  resultKey: string,
): TResult {
  const result = schema.safeParse(data)
  if (result.success) {
    // Return original data (not result.data) to preserve the caller's TS type
    return data as TResult
  }
  logValidationWarning(label, result.error)
  // Return a safe fallback with an empty array so callers never crash
  return { [resultKey]: [] } as unknown as TResult
}

/**
 * Log a structured warning for a validation failure.
 * Limits the number of issues logged to avoid flooding the console.
 */
function logValidationWarning(label: string, error: ZodError): void {
  const issues = error.issues.slice(0, MAX_LOGGED_ISSUES)
  const summary = issues.map(
    (i) => `  path: ${i.path.join('.')}, code: ${i.code}, message: ${i.message}`,
  ).join('\n')
  const truncated = error.issues.length > MAX_LOGGED_ISSUES
    ? `\n  ... and ${error.issues.length - MAX_LOGGED_ISSUES} more issues`
    : ''
  console.warn(
    `[Zod] API response validation failed for "${label}":\n${summary}${truncated}`,
  )
}
