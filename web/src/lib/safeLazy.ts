import { lazy, type ComponentType } from 'react'

/** Maximum number of retry attempts before giving up on a failed dynamic import */
const LAZY_IMPORT_MAX_RETRIES = 2
/** Base delay in ms between retry attempts (doubles each retry via exponential backoff) */
const LAZY_IMPORT_RETRY_BASE_MS = 1_000
/**
 * Per-attempt timeout for a dynamic import. If the backend that serves the
 * chunk is restarting (#6098), the native `import()` has no built-in timeout
 * and can hang indefinitely, leaving the Suspense fallback stuck on a
 * "loading" spinner until the user manually closes and reopens the view.
 * Racing the import against this timeout turns a hang into a recoverable
 * rejection that feeds into the existing retry + error-boundary recovery.
 */
const LAZY_IMPORT_ATTEMPT_TIMEOUT_MS = 8_000

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
 * 3. Races each import attempt against a timeout (#6098) so a hung dynamic
 *    import (e.g. during a backend restart) becomes a recoverable rejection
 *    instead of leaving the Suspense fallback stuck on a loading spinner.
 */
export function safeLazy<T extends Record<string, unknown>>(
  importFn: () => Promise<T>,
  exportName: keyof T & string,
): ReturnType<typeof lazy> {
  return lazy(() => {
    const importWithTimeout = (): Promise<T> => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error(
              `Dynamic import for "${exportName}" timed out after ${LAZY_IMPORT_ATTEMPT_TIMEOUT_MS}ms — ` +
              'the chunk server may be unreachable or restarting.',
            ),
          )
        }, LAZY_IMPORT_ATTEMPT_TIMEOUT_MS)
      })
      return Promise.race([importFn(), timeoutPromise]).finally(() => {
        if (timeoutId !== undefined) clearTimeout(timeoutId)
      })
    }

    const attemptImport = (retriesLeft: number): Promise<{ default: ComponentType<Record<string, unknown>> }> =>
      importWithTimeout()
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
