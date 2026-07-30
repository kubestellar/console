/**
 * useKeepAliveActive — returns whether the current component is on the active
 * KeepAlive route.
 *
 * Components inside a KeepAliveOutlet stay mounted even when their route is
 * hidden (`display: none`). This hook lets polling hooks (e.g. useCache) pause
 * auto-refresh while the route is inactive, preventing hidden dashboards from
 * continuously fetching and triggering React state updates that block the
 * active route from rendering (#5856).
 *
 * Returns `true` when:
 *   - The component is on the currently-active KeepAlive route, OR
 *   - The component is NOT inside a KeepAlive wrapper (safe default).
 */

import { useContext, createContext } from 'react'

export const KeepAliveActiveContext = createContext<boolean>(true)

export function useKeepAliveActive(): boolean {
  return useContext(KeepAliveActiveContext)
}
