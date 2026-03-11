/**
 * Hook for managing insight acknowledgement and dismissal state.
 *
 * - Acknowledged insights persist in localStorage across sessions
 * - Dismissed insights persist only in sessionStorage (current session)
 */

import { useState, useCallback, useMemo } from 'react'

/** localStorage key for acknowledged insight IDs */
const INSIGHT_ACKNOWLEDGE_KEY = 'acknowledged-insights'
/** sessionStorage key for dismissed insight IDs (session only) */
const INSIGHT_DISMISS_KEY = 'dismissed-insights-session'

function loadSet(storage: Storage, key: string): Set<string> {
  try {
    const raw = storage.getItem(key)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function saveSet(storage: Storage, key: string, set: Set<string>): void {
  try {
    storage.setItem(key, JSON.stringify(Array.from(set)))
  } catch {
    // Ignore storage errors
  }
}

export function useInsightActions() {
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(
    () => loadSet(localStorage, INSIGHT_ACKNOWLEDGE_KEY)
  )
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(
    () => loadSet(sessionStorage, INSIGHT_DISMISS_KEY)
  )

  const acknowledgeInsight = useCallback((id: string) => {
    setAcknowledgedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      saveSet(localStorage, INSIGHT_ACKNOWLEDGE_KEY, next)
      return next
    })
  }, [])

  const dismissInsight = useCallback((id: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      saveSet(sessionStorage, INSIGHT_DISMISS_KEY, next)
      return next
    })
  }, [])

  const isAcknowledged = useCallback((id: string) => acknowledgedIds.has(id), [acknowledgedIds])
  const isDismissed = useCallback((id: string) => dismissedIds.has(id), [dismissedIds])

  const acknowledgedCount = useMemo(() => acknowledgedIds.size, [acknowledgedIds])

  return {
    acknowledgeInsight,
    dismissInsight,
    isAcknowledged,
    isDismissed,
    acknowledgedCount,
  }
}
