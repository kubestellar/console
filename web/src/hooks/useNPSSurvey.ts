import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/auth'
import { isDemoMode } from '../lib/demoMode'
import { safeGetJSON, safeSetJSON, safeGetItem } from '../lib/utils/localStorage'
import { STORAGE_KEY_NPS_STATE, STORAGE_KEY_SESSION_COUNT } from '../lib/constants/storage'
import { emitNPSSurveyShown, emitNPSResponse, emitNPSDismissed } from '../lib/analytics'
import { api } from '../lib/api'
import { useRewards } from './useRewards'

/** Minimum sessions before showing NPS for the first time */
const MIN_SESSIONS_BEFORE_NPS = 5
/** Idle delay in ms before the widget slides up */
const NPS_IDLE_DELAY_MS = 30_000
/** Days to wait after submission before re-prompting */
const NPS_REPROMPT_DAYS = 30
/** Days to wait after a dismissal before retrying */
const NPS_DISMISS_RETRY_DAYS = 7
/** Max dismissals before stopping for NPS_REPROMPT_DAYS */
const NPS_MAX_DISMISSALS = 3
/** Milliseconds per day */
const MS_PER_DAY = 86_400_000
/** Timeout for the NPS POST — keep short; the UI is blocked on this */
const NPS_POST_TIMEOUT_MS = 5_000

/** NPS category labels for GA4 */
const NPS_CATEGORIES = ['detractor', 'passive', 'satisfied', 'promoter'] as const

interface NPSPersistentState {
  lastSubmittedAt: string | null
  lastDismissedAt: string | null
  dismissCount: number
  maxDismissalsReachedAt: string | null
}

const DEFAULT_STATE: NPSPersistentState = {
  lastSubmittedAt: null,
  lastDismissedAt: null,
  dismissCount: 0,
  maxDismissalsReachedAt: null,
}

export interface NPSSurveyState {
  isVisible: boolean
  submitResponse: (score: number, feedback?: string) => Promise<void>
  dismiss: () => void
}

/** Minimum description length required by the backend feedback API */
const MIN_FEEDBACK_LENGTH = 20

function daysSince(isoDate: string | null): number {
  if (!isoDate) return Infinity
  const timestamp = new Date(isoDate).getTime()
  if (!Number.isFinite(timestamp)) return 0
  return (Date.now() - timestamp) / MS_PER_DAY
}

function isEligible(state: NPSPersistentState): boolean {
  // Recently submitted — wait for reprompt period
  if (daysSince(state.lastSubmittedAt) < NPS_REPROMPT_DAYS) return false

  // Hit max dismissals — wait for reprompt period from that point
  if (
    state.dismissCount >= NPS_MAX_DISMISSALS &&
    daysSince(state.maxDismissalsReachedAt) < NPS_REPROMPT_DAYS
  ) return false

  // Recently dismissed — wait for retry period
  if (daysSince(state.lastDismissedAt) < NPS_DISMISS_RETRY_DAYS) return false

  return true
}

export function useNPSSurvey(): NPSSurveyState {
  const { isAuthenticated } = useAuth()
  const { awardCoins } = useRewards()
  const [isVisible, setIsVisible] = useState(false)

  // Check eligibility and start idle timer
  useEffect(() => {
    // Auth + demo guard
    if (!isAuthenticated || isDemoMode()) return

    // Session threshold guard
    const sessionCount = parseInt(safeGetItem(STORAGE_KEY_SESSION_COUNT) || '0', 10)
    if (sessionCount < MIN_SESSIONS_BEFORE_NPS) return

    // Timing guard
    const state = safeGetJSON<NPSPersistentState>(STORAGE_KEY_NPS_STATE) ?? DEFAULT_STATE
    if (!isEligible(state)) return

    // Idle timer
    const timer = setTimeout(() => {
      setIsVisible(true)
      emitNPSSurveyShown()
    }, NPS_IDLE_DELAY_MS)

    return () => clearTimeout(timer)
  }, [isAuthenticated])

  const submitResponse = useCallback(async (score: number, feedback?: string) => {
    if (!Number.isInteger(score) || score < 1 || score > 4) return

    // Send to our own NPS backend FIRST. Errors propagate so the UI can
    // show a failure toast instead of silently losing the response, and
    // so we don't emit a GA4 event for a submission that never reached
    // the backend (which would diverge the two data sources).
    const apiBase = import.meta.env.VITE_API_BASE_URL || ''
    const resp = await fetch(`${apiBase}/api/nps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        score,
        feedback: feedback?.trim() || undefined,
      }),
      signal: AbortSignal.timeout(NPS_POST_TIMEOUT_MS),
    })
    if (!resp.ok) {
      throw new Error(`NPS submit failed: ${resp.status} ${resp.statusText}`)
    }

    // Backend accepted the response — mirror it into GA4. emitNPSResponse
    // bypasses the analytics opt-out gate because NPS is voluntary,
    // user-initiated feedback (see analytics.ts).
    const category = NPS_CATEGORIES[score - 1]
    emitNPSResponse(score, category, feedback ? feedback.length : undefined)

    // Create GitHub issue for detractors (score 1 = "Not great")
    // Backend requires description >= MIN_FEEDBACK_LENGTH chars
    const trimmed = feedback?.trim() || ''
    if (score === 1 && trimmed.length >= MIN_FEEDBACK_LENGTH) {
      try {
        await api.post('/api/feedback/requests', {
          title: `NPS Detractor Feedback (Score: ${score})`,
          description: trimmed,
          request_type: 'bug',
        })
      } catch {
        // Non-critical — GA4 event already captured the response
      }
    }

    // Update persistent state
    const newState: NPSPersistentState = {
      lastSubmittedAt: new Date().toISOString(),
      lastDismissedAt: null,
      dismissCount: 0,
      maxDismissalsReachedAt: null,
    }
    safeSetJSON(STORAGE_KEY_NPS_STATE, newState)

    awardCoins('nps_survey')
    setIsVisible(false)
  }, [awardCoins])

  const dismiss = useCallback(() => {
    const state = safeGetJSON<NPSPersistentState>(STORAGE_KEY_NPS_STATE) ?? DEFAULT_STATE
    const newDismissCount = state.dismissCount + 1

    const newState: NPSPersistentState = {
      ...state,
      lastDismissedAt: new Date().toISOString(),
      dismissCount: newDismissCount,
      maxDismissalsReachedAt: newDismissCount >= NPS_MAX_DISMISSALS
        ? new Date().toISOString()
        : state.maxDismissalsReachedAt,
    }
    safeSetJSON(STORAGE_KEY_NPS_STATE, newState)

    emitNPSDismissed(newDismissCount)
    setIsVisible(false)
  }, [])

  return { isVisible, submitResponse, dismiss }
}
