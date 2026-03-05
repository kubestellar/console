/**
 * Contextual Nudges — replaces the traditional step-by-step tour with
 * context-aware hints that appear at the right moment.
 *
 * Nudge types:
 *   - 'customize'   — after 3+ visits with no card changes, suggest customization
 *   - 'drag-hint'   — on first visit, briefly animate cards to show they're draggable
 *   - 'pwa-install' — after 3+ sessions, suggest installing the PWA widget
 */

import { useState, useEffect, useCallback } from 'react'
import {
  STORAGE_KEY_NUDGE_DISMISSED,
  STORAGE_KEY_DRAG_HINT_SHOWN,
  STORAGE_KEY_PWA_PROMPT_DISMISSED,
  STORAGE_KEY_SESSION_COUNT,
  STORAGE_KEY_VISIT_COUNT,
} from '../lib/constants/storage'
import { emitNudgeShown, emitNudgeDismissed, emitNudgeActioned } from '../lib/analytics'
import { safeGetItem, safeSetItem, safeGetJSON, safeSetJSON } from '../lib/utils/localStorage'

export type NudgeType = 'customize' | 'drag-hint' | 'pwa-install'

/** Number of dashboard visits before showing the "customize" nudge */
const CUSTOMIZE_NUDGE_VISIT_THRESHOLD = 3
/** Number of sessions before showing the PWA install nudge */
const PWA_NUDGE_SESSION_THRESHOLD = 3

interface NudgeState {
  /** Which nudge (if any) should currently be shown */
  activeNudge: NudgeType | null
  /** Whether the drag-hint shimmy animation should play */
  showDragHint: boolean
  /** Dismiss the active nudge */
  dismissNudge: () => void
  /** Mark the active nudge as actioned (user clicked the CTA) */
  actionNudge: () => void
  /** Increment the visit counter (call on dashboard mount) */
  recordVisit: () => void
}

function getDismissedNudges(): Set<string> {
  const raw = safeGetJSON<string[]>(STORAGE_KEY_NUDGE_DISMISSED)
  return new Set(raw || [])
}

function dismissNudgeInStorage(nudgeType: string) {
  const dismissed = getDismissedNudges()
  dismissed.add(nudgeType)
  safeSetJSON(STORAGE_KEY_NUDGE_DISMISSED, Array.from(dismissed))
}

export function useContextualNudges(hasCustomizedDashboard: boolean): NudgeState {
  const [activeNudge, setActiveNudge] = useState<NudgeType | null>(null)
  const [showDragHint, setShowDragHint] = useState(false)

  // Increment session count on first mount of the app
  useEffect(() => {
    const current = Number(safeGetItem(STORAGE_KEY_SESSION_COUNT) || '0')
    safeSetItem(STORAGE_KEY_SESSION_COUNT, String(current + 1))
  }, [])

  const recordVisit = useCallback(() => {
    const current = Number(safeGetItem(STORAGE_KEY_VISIT_COUNT) || '0')
    safeSetItem(STORAGE_KEY_VISIT_COUNT, String(current + 1))
  }, [])

  // Determine which nudge to show
  useEffect(() => {
    const dismissed = getDismissedNudges()
    const visitCount = Number(safeGetItem(STORAGE_KEY_VISIT_COUNT) || '0')
    const sessionCount = Number(safeGetItem(STORAGE_KEY_SESSION_COUNT) || '0')

    // Priority 1: Drag hint on first visit (auto-dismiss, no user action needed)
    if (!safeGetItem(STORAGE_KEY_DRAG_HINT_SHOWN)) {
      setShowDragHint(true)
      safeSetItem(STORAGE_KEY_DRAG_HINT_SHOWN, 'true')
      // Auto-hide shimmy after animation completes
      const SHIMMY_DURATION_MS = 2000
      const timer = setTimeout(() => setShowDragHint(false), SHIMMY_DURATION_MS)
      return () => clearTimeout(timer)
    }

    // Priority 2: Customize nudge after 3+ visits with no changes
    if (
      visitCount >= CUSTOMIZE_NUDGE_VISIT_THRESHOLD &&
      !hasCustomizedDashboard &&
      !dismissed.has('customize')
    ) {
      setActiveNudge('customize')
      emitNudgeShown('customize')
      return
    }

    // Priority 3: PWA install nudge after 3+ sessions
    if (
      sessionCount >= PWA_NUDGE_SESSION_THRESHOLD &&
      !dismissed.has('pwa-install') &&
      !safeGetItem(STORAGE_KEY_PWA_PROMPT_DISMISSED) &&
      !isStandalonePwa()
    ) {
      setActiveNudge('pwa-install')
      emitNudgeShown('pwa-install')
      return
    }

    setActiveNudge(null)
  }, [hasCustomizedDashboard])

  const dismissNudge = useCallback(() => {
    if (activeNudge) {
      emitNudgeDismissed(activeNudge)
      dismissNudgeInStorage(activeNudge)
      if (activeNudge === 'pwa-install') {
        safeSetItem(STORAGE_KEY_PWA_PROMPT_DISMISSED, 'true')
      }
      setActiveNudge(null)
    }
  }, [activeNudge])

  const actionNudge = useCallback(() => {
    if (activeNudge) {
      emitNudgeActioned(activeNudge)
      dismissNudgeInStorage(activeNudge)
      setActiveNudge(null)
    }
  }, [activeNudge])

  return { activeNudge, showDragHint, dismissNudge, actionNudge, recordVisit }
}

/** Check if the app is already running as a standalone PWA */
function isStandalonePwa(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as Record<string, unknown>).standalone === true
}
