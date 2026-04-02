/**
 * Shared chunk-load error detection used by both ChunkErrorBoundary
 * (global, auto-reloads) and DynamicCardErrorBoundary (per-card).
 *
 * When a new build is deployed, Vite chunk filenames change due to
 * content hashing. Browsers with cached HTML still reference old
 * chunk URLs, producing these characteristic error messages.
 */

/** SessionStorage key set before auto-reload, checked after to measure recovery */
export const CHUNK_RELOAD_TS_KEY = 'chunk-reload-ts'

export function isChunkLoadError(error: Error): boolean {
  return isChunkLoadMessage(error.message || '')
}

/**
 * Check if an error message string indicates a chunk/module load failure.
 * Used by both Error-object callers (isChunkLoadError) and the global
 * window 'error' event handler which only has a message string.
 */
export function isChunkLoadMessage(msg: string): boolean {
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk') ||
    msg.includes('dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    // Vite-specific preload error
    msg.includes('Unable to preload CSS') ||
    // Server returned HTML instead of JS (404 → SPA fallback for missing chunk)
    msg.includes('is not a valid JavaScript MIME type') ||
    // Safari/WebKit uses this message for failed dynamic import()
    msg.includes('Importing a module script failed') ||
    // safeLazy() throws this when a named export is missing from a stale chunk
    msg.includes('chunk may be stale') ||
    // Generic fetch failure — often occurs when a chunk 404s on the CDN
    msg.includes('Failed to fetch') ||
    // Network error variant seen in Firefox for missing chunks
    msg.includes('NetworkError when attempting to fetch resource') ||
    // Chrome: TypeError when dynamic import() receives a non-JS response (e.g. 404 HTML)
    msg.includes("Unexpected token '<'")
  )
}
