/**
 * GitHub API fetch utilities for GitHub Pipelines Dashboard
 */
import { GITHUB_API, GH_RETRY_MAX_ATTEMPTS, GH_RETRY_BASE_DELAY_MS } from "./constants";

/** Maximum response body size (512 KB) before rejecting upstream data */
const MAX_RESPONSE_BYTES = 512_000;

export async function gh(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  const headers = {
    Accept: "application/vnd.github.v3+json",
    Authorization: `Bearer ${token}`,
    ...(init.headers ?? {}),
  };
  for (let attempt = 0; attempt < GH_RETRY_MAX_ATTEMPTS; attempt++) {
    const resp = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(10_000) });
    if (resp.status !== 429 && resp.status !== 403) return resp;
    if (attempt === GH_RETRY_MAX_ATTEMPTS - 1) {
      console.warn(`[github-pipelines] retries exhausted for ${path}, status=${resp.status}`);
      return resp;
    }
    const retryAfter = resp.headers.get("Retry-After");
    const waitMs = retryAfter
      ? Math.min(parseInt(retryAfter, 10) * 1000, 10_000)
      : GH_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error("Unreachable");
}

/**
 * Read a Response as JSON with a size cap to prevent memory exhaustion.
 * Reads body as text first, rejects if larger than MAX_RESPONSE_BYTES,
 * then parses JSON only after the size check passes.
 */
export async function readCappedJson<T>(res: Response): Promise<T> {
  const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new Error(`Response too large: content-length ${contentLength} exceeds ${MAX_RESPONSE_BYTES}`);
  }
  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new Error(`Response too large: body ${text.length} bytes exceeds ${MAX_RESPONSE_BYTES}`);
  }
  return JSON.parse(text) as T;
}
