/**
 * Shared chunk-load error detection used by both ChunkErrorBoundary
 * (global, auto-reloads) and DynamicCardErrorBoundary (per-card).
 *
 * When a new build is deployed, Vite chunk filenames change due to
 * content hashing. Browsers with cached HTML still reference old
 * chunk URLs, producing these characteristic error messages.
 */
export function isChunkLoadError(error: Error): boolean {
  const msg = error.message || ''
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk') ||
    msg.includes('dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    // Vite-specific preload error
    msg.includes('Unable to preload CSS')
  )
}
