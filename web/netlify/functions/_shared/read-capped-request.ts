/**
 * Shared utility for reading incoming request bodies with a size cap.
 * Does NOT trust Content-Length — enforces the limit on actual bytes read.
 * Prevents DoS via chunked encoding or lying Content-Length (CWE-400, #16666).
 */

export class RequestBodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Request body exceeds ${maxBytes} byte limit`);
    this.name = "RequestBodyTooLargeError";
  }
}

/**
 * Reads the full request body up to `maxBytes`. Throws RequestBodyTooLargeError
 * if the actual bytes read exceed the limit, regardless of Content-Length header.
 */
export async function readCappedRequestText(
  req: Request,
  maxBytes: number,
): Promise<string> {
  const body = req.body;
  if (!body) {
    return "";
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        reader.cancel();
        throw new RequestBodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) throw err;
    throw new Error(`Failed to read request body: ${err}`);
  }

  if (chunks.length === 0) return "";
  if (chunks.length === 1) return new TextDecoder().decode(chunks[0]);

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

/**
 * Reads and parses the request body as JSON with a byte-limit guard.
 * Throws RequestBodyTooLargeError if actual body exceeds maxBytes.
 */
export async function readCappedRequestJson<T>(
  req: Request,
  maxBytes: number,
): Promise<T> {
  const text = await readCappedRequestText(req, maxBytes);
  return JSON.parse(text) as T;
}
