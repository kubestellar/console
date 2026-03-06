/**
 * Feature Hints — inline, one-time tooltips for feature discovery.
 *
 * Unlike the tour (which interrupts the whole UI), hints appear
 * near the feature itself and fire once per user (localStorage).
 *
 * Hint types:
 *   - 'cmd-k'     — "Press Cmd+K to search" near search box
 *   - 'card-drag' — "Drag cards to reorder" near card grid
 *   - 'missions'  — "Try AI Missions" near missions toggle
 *   - 'fab-add'   — shimmer ring on the floating "+" button
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  STORAGE_KEY_FEATURE_HINTS_DISMISSED,
  STORAGE_KEY_HINTS_SUPPRESSED,
} from '../lib/constants/storage'
import {
  emitFeatureHintShown,
  emitFeatureHintDismissed,
  emitFeatureHintActioned,
} from '../lib/analytics'
import { safeGetJSON, safeSetJSON, safeGetItem } from '../lib/utils/localStorage'

export type FeatureHintType = 'cmd-k' | 'card-drag' | 'missions' | 'fab-add'

/** Auto-dismiss feature hints after this duration (ms) */
const FEATURE_HINT_AUTO_DISMISS_MS = 8_000

function getDismissedHints(): Set<string> {
  const raw = safeGetJSON<string[]>(STORAGE_KEY_FEATURE_HINTS_DISMISSED)
  return new Set(raw || [])
}

function dismissHintInStorage(hintType: string) {
  const dismissed = getDismissedHints()
  dismissed.add(hintType)
  safeSetJSON(STORAGE_KEY_FEATURE_HINTS_DISMISSED, Array.from(dismissed))
}

interface FeatureHintState {
  isVisible: boolean
  dismiss: () => void
  action: () => void
}

export function useFeatureHints(hintType: FeatureHintType): FeatureHintState {
  const [isVisible, setIsVisible] = useState(() => {
    // Suppress all hints if master toggle is off
    if (safeGetItem(STORAGE_KEY_HINTS_SUPPRESSED) === 'true') return false
    return !getDismissedHints().has(hintType)
  })

  const emittedRef = useRef(false)

  // Emit shown analytics once and set auto-dismiss timer
  useEffect(() => {
    if (!isVisible || emittedRef.current) return
    emittedRef.current = true
    emitFeatureHintShown(hintType)

    const timer = setTimeout(() => {
      setIsVisible(false)
      dismissHintInStorage(hintType)
    }, FEATURE_HINT_AUTO_DISMISS_MS)

    return () => clearTimeout(timer)
  }, [isVisible, hintType])

  const dismiss = useCallback(() => {
    if (!isVisible) return
    emitFeatureHintDismissed(hintType)
    dismissHintInStorage(hintType)
    setIsVisible(false)
  }, [isVisible, hintType])

  const action = useCallback(() => {
    if (!isVisible) return
    emitFeatureHintActioned(hintType)
    dismissHintInStorage(hintType)
    setIsVisible(false)
  }, [isVisible, hintType])

  return { isVisible, dismiss, action }
}
