/**
 * Hook for managing insight acknowledgement and dismissal state.
 *
 * - Acknowledged insights persist in localStorage across sessions
 * - Dismissed insights persist only in sessionStorage (current session)
 */

import { useState, useEffect } from 'react'
import { useToast } from '../../ui/Toast'

/** localStorage key for acknowledged insight IDs */
const INSIGHT_ACKNOWLEDGE_KEY = 'acknowledged-insights'
/** sessionStorage key for dismissed insight IDs (session only) */
const INSIGHT_DISMISS_KEY = 'dismissed-insights-session'

/** User-facing message when insight preferences fail to save */
const SAVE_ERROR_MESSAGE = 'Failed to save insight preference. Your browser storage may be full.'
/** User-facing message when insight preferences fail to load */
const LOAD_ERROR_MESSAGE = 'Failed to load insight preferences. Previously acknowledged insights may reappear.'

function loadSet(storage: Storage, key: string): Set<string> {
  try {
    const raw = storage.getItem(key)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      console.warn(`[useInsightActions] Invalid data in ${key}: expected array, got ${typeof parsed}`)
      return new Set()
    }
    return new Set(parsed.filter((v): v is string => typeof v === 'string'))
  } catch (err) {
    console.error(`[useInsightActions] Failed to load ${key} from storage:`, err)
    return new Set()
  }
}

type ErrorCallback = (message: string) => void

function saveSet(storage: Storage, key: string, set: Set<string>, onError?: ErrorCallback): void {
  try {
    storage.setItem(key, JSON.stringify(Array.from(set)))
  } catch (err) {
    console.error(`[useInsightActions] Failed to save ${key} to storage:`, err)
    onError?.(SAVE_ERROR_MESSAGE)
  }
}

export function useInsightActions() {
  const { showToast } = useToast()

  const onSaveError = (message: string) => {
    showToast(message, 'error')
  }

  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(
    () => loadSet(localStorage, INSIGHT_ACKNOWLEDGE_KEY)
  )
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(
    () => loadSet(sessionStorage, INSIGHT_DISMISS_KEY)
  )

  // Detect load errors on mount and notify user
  useEffect(() => {
    const ackRaw = localStorage.getItem(INSIGHT_ACKNOWLEDGE_KEY)
    const dismissRaw = sessionStorage.getItem(INSIGHT_DISMISS_KEY)
    let hasError = false
    if (ackRaw) {
      try {
        const parsed = JSON.parse(ackRaw)
        if (!Array.isArray(parsed)) hasError = true
      } catch { hasError = true }
    }
    if (dismissRaw) {
      try {
        const parsed = JSON.parse(dismissRaw)
        if (!Array.isArray(parsed)) hasError = true
      } catch { hasError = true }
    }
    if (hasError) {
      showToast(LOAD_ERROR_MESSAGE, 'warning')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const acknowledgeInsight = (id: string) => {
    setAcknowledgedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      saveSet(localStorage, INSIGHT_ACKNOWLEDGE_KEY, next, onSaveError)
      return next
    })
  }

  const dismissInsight = (id: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      saveSet(sessionStorage, INSIGHT_DISMISS_KEY, next, onSaveError)
      return next
    })
  }

  const isAcknowledged = (id: string) => acknowledgedIds.has(id)
  const isDismissed = (id: string) => dismissedIds.has(id)

  const acknowledgedCount = acknowledgedIds.size

  return {
    acknowledgeInsight,
    dismissInsight,
    isAcknowledged,
    isDismissed,
    acknowledgedCount }
}
