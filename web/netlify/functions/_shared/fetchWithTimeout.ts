/**
 * Shared fetch wrapper with timeout using AbortSignal.timeout().
 * This eliminates boilerplate across Netlify functions that need to
 * enforce a fetch timeout.
 */

export interface FetchWithTimeoutOptions {
  timeoutMs: number;
}

/**
 * Fetch with automatic timeout via AbortSignal.timeout().
 * Throws if the request exceeds timeoutMs.
 */
export async function fetchWithTimeout(
  url: string,
  options?: RequestInit & FetchWithTimeoutOptions,
): Promise<Response> {
  const { timeoutMs = 10_000, ...fetchOpts } = options || {};

  return fetch(url, {
    ...fetchOpts,
    signal: AbortSignal.timeout(timeoutMs),
  });
}
