/**
 * Analytics ACCM — Gist fetch for precomputed historical data
 */

import type { ACCMData } from "./helpers";

/** Public gist (raw URL) holding the precomputed full ACCM history.
 *  Updated daily by .github/workflows/accm-history-update.yml. */
const ACCM_HISTORY_GIST_URL =
  "https://gist.githubusercontent.com/clubanderson/21a665e2a49ced34f83bc290c3fd6a23/raw/accm-history.json";
/** Timeout for the gist fetch (short — we want to fall back fast). */
const GIST_FETCH_TIMEOUT_MS = 5_000;
/** Maximum response body size (512 KB) */
const MAX_RESPONSE_BYTES = 512_000;

/** Fetch the precomputed full-history ACCM dataset from the public gist.
 *  Returns null on any failure so callers fall back to live computation. */
export async function fetchACCMFromGist(): Promise<ACCMData | null> {
  if (ACCM_HISTORY_GIST_URL.includes("__GIST_ID__")) return null;
  try {
    const res = await fetch(ACCM_HISTORY_GIST_URL, {
      signal: AbortSignal.timeout(GIST_FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_RESPONSE_BYTES) {
      console.warn(`[analytics-accm] gist response too large: ${contentLength} bytes`);
      return null;
    }
    const text = await res.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      console.warn(`[analytics-accm] gist response too large: ${text.length} bytes`);
      return null;
    }
    const data = JSON.parse(text) as ACCMData;
    if (!Array.isArray(data.weeklyActivity) || data.weeklyActivity.length === 0) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}
