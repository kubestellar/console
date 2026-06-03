const EMPTY_BYTES = new Uint8Array(0);
const BODY_TOO_LARGE_SUFFIX = "body too large";

interface BodySource {
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
}

function getContentLength(source: BodySource): number | null {
  const header = source.headers.get("content-length");
  if (!header) return null;

  const contentLength = Number.parseInt(header, 10);
  return Number.isFinite(contentLength) ? contentLength : null;
}

function assertContentLengthWithinLimit(source: BodySource, maxBytes: number, label: string): void {
  const contentLength = getContentLength(source);
  if (contentLength !== null && contentLength > maxBytes) {
    throw new Error(`${label} ${BODY_TOO_LARGE_SUFFIX} (content-length: ${contentLength})`);
  }
}

export function isBodyTooLargeError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(BODY_TOO_LARGE_SUFFIX);
}

export async function readCappedBodyBuffer(
  source: BodySource,
  maxBytes: number,
  label = "request",
): Promise<Uint8Array> {
  assertContentLengthWithinLimit(source, maxBytes, label);

  if (!source.body) {
    return EMPTY_BYTES;
  }

  const reader = source.body.getReader();
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
      await reader.cancel(`${label} ${BODY_TOO_LARGE_SUFFIX} (body: ${totalBytes} bytes)`);
      throw new Error(`${label} ${BODY_TOO_LARGE_SUFFIX} (body: ${totalBytes} bytes)`);
    }
    chunks.push(value);
  }

  if (chunks.length === 0) {
    return EMPTY_BYTES;
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

export async function readCappedBodyText(
  source: BodySource,
  maxBytes: number,
  label = "request",
): Promise<string> {
  const buffer = await readCappedBodyBuffer(source, maxBytes, label);
  return new TextDecoder().decode(buffer);
}

export async function readCappedBodyJson<T>(
  source: BodySource,
  maxBytes: number,
  label = "request",
): Promise<T> {
  const rawText = await readCappedBodyText(source, maxBytes, label);
  return JSON.parse(rawText) as T;
}
