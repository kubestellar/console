import { lazy, type ComponentType } from 'react'

/** Maximum number of retry attempts before giving up on a failed dynamic import */
const LAZY_IMPORT_MAX_RETRIES = 2
/** Base delay in ms between retry attempts (doubles each retry via exponential backoff) */
const LAZY_IMPORT_RETRY_BASE_MS = 1_000

/**
 * Safe wrapper around React.lazy() for named exports.
 *
 * The standard pattern `lazy(() => import('./Foo').then(m => ({ default: m.Foo })))`
 * crashes when a chunk loads stale content after a deploy — `m.Foo` becomes undefined
 * and React receives `{ default: undefined }`, causing "Cannot read properties of
 * undefined" errors.
 *
 * This helper:
 * 1. Throws a descriptive error that triggers the ChunkErrorBoundary's
 *    auto-reload recovery instead of silently crashing.
 * 2. Retries the import with exponential backoff on network/chunk errors (#4933)
 *    so transient failures don't crash the app.
 */
export function safeLazy<T extends Record<string, unknown>>(
  importFn: () => Promise<T>,
  exportName: keyof T & string,
): ReturnType<typeof lazy> {
  return lazy(() => {
    const attemptImport = (retriesLeft: number): Promise<{ default: ComponentType<Record<string, unknown>> }> =>
      importFn()
        .then((m) => {
          // When an eagerly-loaded bundle uses .catch(() => undefined) to suppress
          // unhandled rejections, a stale-chunk failure resolves the promise to
          // undefined instead of rejecting it. Without this guard, accessing
          // m[exportName] throws a generic TypeError that isChunkLoadMessage()
          // does not recognise, so ChunkErrorBoundary never triggers auto-reload.
          if (!m) {
            throw new Error(
              'Module failed to load — chunk may be stale. ' +
              'Reload the page to get the latest version.',
            )
          }
          const component = m[exportName]
          if (!component) {
            throw new Error(
              `Export "${exportName}" not found in module — chunk may be stale. ` +
              'Reload the page to get the latest version.',
            )
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return { default: component as ComponentType<any> }
        })
        .catch((err: Error) => {
          if (retriesLeft > 0) {
            const delay = LAZY_IMPORT_RETRY_BASE_MS * Math.pow(2, LAZY_IMPORT_MAX_RETRIES - retriesLeft)
            console.warn(
              `[safeLazy] Import failed for "${exportName}" (${retriesLeft} retries left), ` +
              `retrying in ${delay}ms: ${err.message}`,
            )
            return new Promise<{ default: ComponentType<Record<string, unknown>> }>((resolve) =>
              setTimeout(() => resolve(attemptImport(retriesLeft - 1)), delay),
            )
          }
          // All retries exhausted — re-throw so ChunkErrorBoundary can handle it
          throw err
        })

    return attemptImport(LAZY_IMPORT_MAX_RETRIES)
  })
}
