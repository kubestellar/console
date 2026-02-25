/**
 * KeepAliveOutlet — preserves route component instances across navigations.
 *
 * Instead of unmounting/remounting dashboard components on every route change
 * (which destroys component state, scroll position, chart render state, etc.),
 * this component keeps previously-visited routes alive in the DOM with
 * `display: none`. When the user navigates back, the component is instantly
 * revealed — no re-mount, no re-fetch, no re-render.
 *
 * Caps at MAX_CACHED routes to bound memory. Least-recently-used eviction.
 */
import { Suspense, useRef, useCallback, useMemo } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { ContentLoadingSkeleton } from './Layout'
import { ChunkErrorBoundary } from '../ChunkErrorBoundary'

const MAX_CACHED = 8

interface CachedRoute {
  element: React.ReactNode
  lastAccessed: number
}

export function KeepAliveOutlet() {
  const location = useLocation()
  const outlet = useOutlet()
  const cacheRef = useRef(new Map<string, CachedRoute>())

  const currentPath = location.pathname

  // Update cache with current route
  const cache = cacheRef.current
  if (outlet) {
    if (cache.has(currentPath)) {
      // Update access time (for LRU eviction), keep existing element
      cache.get(currentPath)!.lastAccessed = Date.now()
    } else {
      // New route — cache it
      cache.set(currentPath, { element: outlet, lastAccessed: Date.now() })

      // Evict if over limit (LRU: remove least recently accessed)
      if (cache.size > MAX_CACHED) {
        let oldestPath = ''
        let oldestTime = Infinity
        for (const [path, entry] of cache) {
          if (path !== currentPath && entry.lastAccessed < oldestTime) {
            oldestTime = entry.lastAccessed
            oldestPath = path
          }
        }
        if (oldestPath) cache.delete(oldestPath)
      }
    }
  }

  // Trigger re-render on window resize so hidden charts can recalculate
  const triggerResizeOnActivation = useCallback((path: string) => {
    if (path === currentPath) {
      // Small delay to let display:contents take effect before dispatching resize
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'))
      })
    }
  }, [currentPath])

  // Build the rendered output — all cached routes, only active one visible
  const entries = useMemo(() => {
    const result: Array<{ path: string; element: React.ReactNode; active: boolean }> = []
    for (const [path, entry] of cacheRef.current) {
      result.push({ path, element: entry.element, active: path === currentPath })
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, cache.size])

  return (
    <>
      {entries.map(({ path, element, active }) => (
        <div
          key={path}
          data-keepalive-route={path}
          data-keepalive-active={active ? 'true' : 'false'}
          style={{ display: active ? 'contents' : 'none' }}
          ref={active ? () => triggerResizeOnActivation(path) : undefined}
        >
          <ChunkErrorBoundary>
            <Suspense fallback={<ContentLoadingSkeleton />}>
              {element}
            </Suspense>
          </ChunkErrorBoundary>
        </div>
      ))}
    </>
  )
}
