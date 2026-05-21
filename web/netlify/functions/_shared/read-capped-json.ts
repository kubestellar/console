/**
 * Shared utility for reading upstream HTTP responses with a size cap.
 * Prevents memory exhaustion from unexpectedly large upstream payloads.
 */

/** Maximum upstream response size (512 KB). */
export const MAX_RESPONSE_BYTES = 512_000;

/**
 * Reads an HTTP response body as JSON with a 512 KB size guard.
 * Checks both `content-length` header and actual body length before parsing.
 */
export async function readCappedJson<T>(response: Response, label = "upstream"): Promise<T> {
  const contentLength = parseInt(response.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new Error(`${label} response too large (content-length: ${contentLength})`);
  }

  const rawText = await response.text();
  if (rawText.length > MAX_RESPONSE_BYTES) {
    throw new Error(`${label} response too large (body: ${rawText.length} bytes)`);
  }

  return JSON.parse(rawText) as T;
}
