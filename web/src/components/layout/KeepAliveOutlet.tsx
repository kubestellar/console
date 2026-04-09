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
import { Suspense, useRef, useEffect } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { ContentLoadingSkeleton } from './Layout'
import { ChunkErrorBoundary } from '../ChunkErrorBoundary'
import { PageErrorBoundary } from '../PageErrorBoundary'

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
      // Update access time and element (outlet may change on re-navigation)
      const entry = cache.get(currentPath)!
      entry.lastAccessed = Date.now()
      entry.element = outlet
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

  // Trigger resize once when the active route changes so hidden charts can recalculate (#5710).
  // Using useEffect instead of an inline ref callback to avoid re-dispatching on every render.
  const lastResizedPathRef = useRef<string>('')
  useEffect(() => {
    if (currentPath && currentPath !== lastResizedPathRef.current) {
      lastResizedPathRef.current = currentPath
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'))
      })
    }
  }, [currentPath])

  // Build the rendered output — all cached routes, only active one visible
  const entries = (() => {
    const result: Array<{ path: string; element: React.ReactNode; active: boolean }> = []
    for (const [path, entry] of cacheRef.current) {
      result.push({ path, element: entry.element, active: path === currentPath })
    }
    return result
     
  })()

  return (
    <>
      {entries.map(({ path, element, active }) => (
        <div
          key={path}
          data-keepalive-route={path}
          data-keepalive-active={active ? 'true' : 'false'}
          style={{ display: active ? 'contents' : 'none' }}
        >
          <ChunkErrorBoundary>
            <PageErrorBoundary>
              <Suspense fallback={<ContentLoadingSkeleton />}>
                {element}
              </Suspense>
            </PageErrorBoundary>
          </ChunkErrorBoundary>
        </div>
      ))}
    </>
  )
}
