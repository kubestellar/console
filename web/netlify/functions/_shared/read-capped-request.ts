/**
 * Shared utility for reading incoming request bodies with a size cap.
 * Prevents memory exhaustion and DoS attacks via chunked transfer encoding bypass.
 * 
 * SECURITY: Do NOT trust Content-Length header — enforce limits on actual bytes read.
 * Chunked encoding can bypass Content-Length checks (CWE-400).
 */

/**
 * Reads a request body with a hard byte limit enforced on actual bytes read.
 * Throws if the body exceeds maxBytes.
 * 
 * @param request - The incoming request
 * @param maxBytes - Maximum allowed body size in bytes
 * @param label - Descriptive label for error messages
 * @returns The raw body as a Uint8Array
 * @throws Error if body exceeds maxBytes
 */
export async function readCappedRequestBuffer(
  request: Request,
  maxBytes: number,
  label = "request",
): Promise<Uint8Array> {
  if (!request.body) {
    return new Uint8Array(0);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        throw new Error(`${label} body too large (read ${totalBytes} bytes, limit ${maxBytes})`);
      }
      chunks.push(value);
    }
  } finally {
    // Ensure reader is released even on error
    reader.releaseLock();
  }

  // Combine chunks into single buffer
  if (chunks.length === 0) {
    return new Uint8Array(0);
  }
  if (chunks.length === 1) {
    return chunks[0];
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return combined;
}

/**
 * Reads a request body as text with a hard byte limit enforced on actual bytes read.
 * 
 * @param request - The incoming request
 * @param maxBytes - Maximum allowed body size in bytes
 * @param label - Descriptive label for error messages
 * @returns The body as a UTF-8 string
 * @throws Error if body exceeds maxBytes
 */
export async function readCappedRequestText(
  request: Request,
  maxBytes: number,
  label = "request",
): Promise<string> {
  const buffer = await readCappedRequestBuffer(request, maxBytes, label);
  return new TextDecoder().decode(buffer);
}

/**
 * Reads a request body as JSON with a hard byte limit enforced on actual bytes read.
 * 
 * @param request - The incoming request
 * @param maxBytes - Maximum allowed body size in bytes
 * @param label - Descriptive label for error messages
 * @returns The parsed JSON object
 * @throws Error if body exceeds maxBytes or JSON is invalid
 */
export async function readCappedRequestJson<T>(
  request: Request,
  maxBytes: number,
  label = "request",
): Promise<T> {
  const rawText = await readCappedRequestText(request, maxBytes, label);
  return JSON.parse(rawText) as T;
}
