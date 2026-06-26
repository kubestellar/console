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
import { Suspense, useRef, useEffect, useState } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { ContentLoadingSkeleton } from './Layout'
import { ChunkErrorBoundary } from '../ChunkErrorBoundary'
import { PageErrorBoundary } from '../PageErrorBoundary'
import { KeepAliveActiveContext } from '../../hooks/useKeepAliveActive'
import { formatTimeAgo } from '../../lib/formatters'

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

  // Re-render every 30s to update freshness indicators
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(interval)
  }, [])

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
      {entries.map(({ path, element, active }) => {
        const entry = cache.get(path)
        const lastAccessed = entry?.lastAccessed
        return (
          <div
            key={path}
            data-keepalive-route={path}
            data-keepalive-active={active ? 'true' : 'false'}
            style={{ display: active ? 'contents' : 'none' }}
          >
            <KeepAliveActiveContext.Provider value={active}>
              <ChunkErrorBoundary>
                <PageErrorBoundary>
                  <Suspense fallback={<ContentLoadingSkeleton />}>
                    {!active && lastAccessed && (
                      <div
                        className="fixed bottom-4 right-4 z-50 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-1 rounded border border-border"
                        title={`Route cached at ${new Date(lastAccessed).toLocaleString()}`}
                      >
                        Cached {formatTimeAgo(lastAccessed, { compact: true })}
                      </div>
                    )}
                    {element}
                  </Suspense>
                </PageErrorBoundary>
              </ChunkErrorBoundary>
            </KeepAliveActiveContext.Provider>
          </div>
        )
      })}
    </>
  )
}
