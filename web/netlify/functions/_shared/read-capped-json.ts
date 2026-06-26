/**
 * Shared utility for reading upstream HTTP responses with a size cap.
 * Prevents memory exhaustion from unexpectedly large upstream payloads.
 */

/** Maximum upstream JSON response size (500 KB). */
export const MAX_RESPONSE_BYTES = 512_000;
const EMPTY_BYTES = new Uint8Array(0);

function getContentLength(response: Response): number | null {
  const header = response.headers.get("content-length");
  if (!header) return null;

  const contentLength = Number.parseInt(header, 10);
  return Number.isFinite(contentLength) ? contentLength : null;
}

function assertContentLengthWithinLimit(response: Response, maxBytes: number, label: string): void {
  const contentLength = getContentLength(response);
  if (contentLength !== null && contentLength > maxBytes) {
    throw new Error(`${label} response too large (content-length: ${contentLength})`);
  }
}

export function isResponseTooLargeError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("response too large");
}

export async function readCappedBuffer(
  response: Response,
  maxBytes: number,
  label = "upstream",
): Promise<Uint8Array> {
  assertContentLengthWithinLimit(response, maxBytes, label);

  if (!response.body) {
    return EMPTY_BYTES;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

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
      throw new Error(`${label} response too large (body: ${totalBytes} bytes)`);
    }
    chunks.push(value);
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

export async function readCappedText(
  response: Response,
  maxBytes: number,
  label = "upstream",
): Promise<string> {
  const buffer = await readCappedBuffer(response, maxBytes, label);
  return new TextDecoder().decode(buffer);
}

/**
 * Reads an HTTP response body as JSON with a 512 KB size guard.
 * Checks both `content-length` header and actual body length before parsing.
 */
export async function readCappedJson<T>(response: Response, label = "upstream"): Promise<T> {
  const rawText = await readCappedText(response, MAX_RESPONSE_BYTES, label);
  return JSON.parse(rawText) as T;
}
