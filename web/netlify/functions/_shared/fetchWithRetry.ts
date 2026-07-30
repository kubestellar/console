/**
 * Shared fetch wrapper with exponential backoff retry logic.
 * This eliminates boilerplate across Netlify functions that need to
 * retry on transient failures (5xx, timeout, network errors).
 */

export interface FetchWithRetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  timeoutMs?: number;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with exponential backoff retry on transient errors.
 * Retries on 5xx status codes and network errors.
 * Does not retry on 4xx client errors.
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit & FetchWithRetryOptions,
): Promise<Response> {
  const {
    maxRetries = 3,
    initialDelayMs = 100,
    timeoutMs = 10_000,
    ...fetchOpts
  } = options || {};

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...fetchOpts,
        signal: AbortSignal.timeout(timeoutMs),
      });

      // Don't retry on 4xx (client errors)
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Retry on 5xx (server errors)
      if (response.status >= 500) {
        if (attempt < maxRetries) {
          const delayMs = initialDelayMs * Math.pow(2, attempt);
          await delay(delayMs);
          continue;
        }
        return response;
      }

      // Success (2xx, 3xx)
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If this was the last attempt, rethrow
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Exponential backoff before retry
      const delayMs = initialDelayMs * Math.pow(2, attempt);
      await delay(delayMs);
    }
  }

  // Should not reach here, but just in case
  throw lastError || new Error("fetch with retry failed");
}
