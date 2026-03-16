import { lazy, type ComponentType } from 'react'

/**
 * Safe wrapper around React.lazy() for named exports.
 *
 * The standard pattern `lazy(() => import('./Foo').then(m => ({ default: m.Foo })))`
 * crashes when a chunk loads stale content after a deploy — `m.Foo` becomes undefined
 * and React receives `{ default: undefined }`, causing "Cannot read properties of
 * undefined" errors.
 *
 * This helper throws a descriptive error that triggers the ChunkErrorBoundary's
 * auto-reload recovery instead of silently crashing.
 */
export function safeLazy<T extends Record<string, unknown>>(
  importFn: () => Promise<T>,
  exportName: keyof T & string,
): ReturnType<typeof lazy> {
  return lazy(() =>
    importFn().then((m) => {
      const component = m[exportName]
      if (!component) {
        throw new Error(
          `Export "${exportName}" not found in module — chunk may be stale. ` +
          'Reload the page to get the latest version.',
        )
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { default: component as ComponentType<any> }
    }),
  )
}
