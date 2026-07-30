/**
 * Safe localStorage wrappers.
 *
 * `localStorage` throws in several real-world scenarios:
 *   - Private / incognito browsing mode (Safari historically, some Firefox configs)
 *   - Quota exceeded (especially on mobile)
 *   - Sandboxed iframes or strict site-data settings
 *   - SSR / non-browser environments where `localStorage` is undefined
 *
 * Any unguarded `localStorage.getItem` / `setItem` / `removeItem` call can
 * therefore crash the component tree. These helpers wrap each operation in a
 * try/catch so callers can use best-effort persistence without boilerplate.
 *
 * Use these helpers for ANY non-critical localStorage access (UI state,
 * dismissed banners, game high scores, cached preferences, etc.). For data
 * that MUST persist (auth tokens, etc.), use a dedicated store with
 * explicit error handling instead.
 */

/**
 * Read a value from localStorage. Returns `null` on any error (including
 * the key not being set), matching the native `getItem` contract.
 */
export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Write a value to localStorage. Silently swallows errors (quota exceeded,
 * private mode, etc.) — callers treat persistence as best-effort.
 */
export function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota exceeded / private mode / unavailable — best-effort write */
  }
}

/**
 * Remove a key from localStorage. Silently swallows errors.
 */
export function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore — best-effort removal */
  }
}

/**
 * Read and JSON.parse a value from localStorage. Returns `fallback` on any
 * error (missing key, parse failure, localStorage unavailable).
 */
export function safeGetJSON<T>(key: string, fallback: T): T {
  const raw = safeGet(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * JSON.stringify and write a value to localStorage. Silently swallows errors.
 */
export function safeSetJSON(key: string, value: unknown): void {
  try {
    safeSet(key, JSON.stringify(value));
  } catch {
    /* stringify failure (circular refs, BigInt, etc.) — best-effort write */
  }
}
