/**
 * Read a request body with an enforced byte limit.
 *
 * Unlike checking Content-Length (which can be omitted or spoofed via chunked
 * encoding), this reads the actual stream and aborts if the limit is exceeded.
 * Mitigates CWE-400 (Uncontrolled Resource Consumption).
 */
export class BodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Request body exceeds ${maxBytes} byte limit`);
    this.name = "BodyTooLargeError";
  }
}

/**
 * Reads the request body as text, enforcing a hard byte limit on actual bytes read.
 * Does NOT trust Content-Length header.
 *
 * @throws {BodyTooLargeError} if actual body exceeds maxBytes
 */
export async function readCappedBody(
  req: Request,
  maxBytes: number
): Promise<string> {
  const reader = req.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        reader.cancel();
        throw new BodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
}
