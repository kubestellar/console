import { useState, useEffect, useCallback, useRef } from 'react'
import { safeGetJSON, safeSetJSON, safeGetItem } from '../lib/utils/localStorage'
import { STORAGE_KEY_NPS_STATE, STORAGE_KEY_SESSION_COUNT } from '../lib/constants/storage'
import { emitNPSSurveyShown, emitNPSResponse, emitNPSDismissed } from '../lib/analytics'
import { api } from '../lib/api'
import { useRewards } from './useRewards'
import { MS_PER_DAY, MS_PER_MINUTE, MS_PER_SECOND } from '../lib/constants/time'
import { peekSessionEngagementMs } from '../lib/analytics-session'

/** Minimum sessions before showing NPS for the first time */
const MIN_SESSIONS_BEFORE_NPS = 2
/** Returning users on their 3rd+ session can be asked sooner */
const NPS_RETURNING_USER_SESSION_THRESHOLD = 3
/** Minimum engaged time for a second-session visitor before prompting */
const NPS_SECOND_SESSION_MIN_ENGAGEMENT_MS = 5 * MS_PER_MINUTE
/** Minimum engaged time for a third-or-later-session visitor before prompting */
const NPS_RETURNING_USER_MIN_ENGAGEMENT_MS = 1 * MS_PER_MINUTE
/** How often to re-check engagement before showing the survey */
const NPS_ENGAGEMENT_POLL_MS = 15 * MS_PER_SECOND
/** Days to wait after submission before re-prompting */
const NPS_REPROMPT_DAYS = 30
/** Days to wait after a dismissal before retrying */
const NPS_DISMISS_RETRY_DAYS = 7
/** Max dismissals before stopping for NPS_REPROMPT_DAYS */
const NPS_MAX_DISMISSALS = 3
/** Timeout for the NPS POST — keep short; the UI is blocked on this */
const NPS_POST_TIMEOUT_MS = 5_000

/** NPS category labels for GA4 */
const NPS_CATEGORIES = ['detractor', 'passive', 'satisfied', 'promoter'] as const

interface NPSPersistentState {
  lastSubmittedAt: string | null
  lastDismissedAt: string | null
  snoozedUntil: string | null
  dismissCount: number
  maxDismissalsReachedAt: string | null
}

const DEFAULT_STATE: NPSPersistentState = {
  lastSubmittedAt: null,
  lastDismissedAt: null,
  snoozedUntil: null,
  dismissCount: 0,
  maxDismissalsReachedAt: null,
}

export interface SubmitNPSOptions {
  allowPublicIssue?: boolean
}

export interface NPSSurveyState {
  isVisible: boolean
  submitResponse: (score: number, feedback?: string, options?: SubmitNPSOptions) => Promise<void>
  dismiss: () => void
}

interface UseNPSSurveyOptions {
  isEnabled?: boolean
}

/** Minimum description length required by the backend feedback API */
export const MIN_NPS_PUBLIC_ISSUE_FEEDBACK_LENGTH = 20

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

  const snoozedUntil = state.snoozedUntil ? new Date(state.snoozedUntil).getTime() : 0
  if (Number.isFinite(snoozedUntil) && snoozedUntil > Date.now()) return false

  // Preserve compatibility with older state that only stored lastDismissedAt.
  if (daysSince(state.lastDismissedAt) < NPS_DISMISS_RETRY_DAYS) return false

  return true
}

function getSessionCount(): number {
  const rawCount = parseInt(safeGetItem(STORAGE_KEY_SESSION_COUNT) || '0', 10)
  return Number.isFinite(rawCount) ? rawCount : 0
}

function getRequiredEngagementMs(sessionCount: number): number {
  return sessionCount >= NPS_RETURNING_USER_SESSION_THRESHOLD
    ? NPS_RETURNING_USER_MIN_ENGAGEMENT_MS
    : NPS_SECOND_SESSION_MIN_ENGAGEMENT_MS
}

function hasEnoughUsage(sessionCount: number): boolean {
  if (sessionCount < MIN_SESSIONS_BEFORE_NPS) return false
  return peekSessionEngagementMs() >= getRequiredEngagementMs(sessionCount)
}

export function useNPSSurvey(options: UseNPSSurveyOptions = {}): NPSSurveyState {
  const { isEnabled = true } = options
  const { awardCoins } = useRewards()
  const [isVisible, setIsVisible] = useState(false)
  const hasShownThisLoadRef = useRef(false)

  // Check eligibility and wait for enough real usage before prompting.
  // Demo-mode and unauthenticated visitors are both eligible: NPS is
  // voluntary feedback, and since the vast majority of console.kubestellar.io
  // traffic is demo visitors, gating it behind authenticated non-demo
  // sessions left us with almost no data. Feedback still has to be
  // explicitly submitted by the user.
  useEffect(() => {
    if (!isEnabled) {
      setIsVisible(false)
      return
    }

    if (hasShownThisLoadRef.current) return

    const state = safeGetJSON<NPSPersistentState>(STORAGE_KEY_NPS_STATE) ?? DEFAULT_STATE
    if (!isEligible(state)) return

    const sessionCount = getSessionCount()
    if (sessionCount < MIN_SESSIONS_BEFORE_NPS) return

    const showSurvey = () => {
      if (hasShownThisLoadRef.current) return
      hasShownThisLoadRef.current = true
      setIsVisible(true)
      emitNPSSurveyShown()
    }

    if (hasEnoughUsage(sessionCount)) {
      showSurvey()
      return
    }

    const timer = setInterval(() => {
      if (hasEnoughUsage(sessionCount)) {
        clearInterval(timer)
        showSurvey()
      }
    }, NPS_ENGAGEMENT_POLL_MS)

    return () => clearInterval(timer)
  }, [isEnabled])

  const submitResponse = useCallback(async (score: number, feedback?: string, options?: SubmitNPSOptions) => {
    if (!Number.isInteger(score) || score < 1 || score > 4) return

    // Try the /api/nps backend first. In production it's a Netlify Function
    // that stores aggregate data in Netlify Blobs; on localhost (Go backend)
    // the route does not exist — we fall back to GA4-only capture in that
    // case so dev/self-hosted users still get a success toast and their
    // feedback isn't silently dropped.
    //
    // The only failures we surface to the UI are genuine *network* errors
    // (server reachable but broken) or the timeout — a clean 404/405 from
    // a backend that simply doesn't implement the route is treated as
    // "no aggregation backend available, GA4 is sufficient."
    const apiBase = import.meta.env.VITE_API_BASE_URL || ''
    let backendAccepted = false
    try {
      const resp = await fetch(`${apiBase}/api/nps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          score,
          feedback: feedback?.trim() || undefined,
        }),
        signal: AbortSignal.timeout(NPS_POST_TIMEOUT_MS),
      })
      if (resp.ok) {
        backendAccepted = true
      } else if (resp.status === 404 || resp.status === 405) {
        // Backend route not implemented (localhost dev / self-hosted with
        // Go-only backend). Fall through to GA4-only capture.
        console.debug(`[NPS] backend ${resp.status} — falling back to GA4-only capture`)
      } else {
        // 5xx / 400 / 401 / 403 — real server failure, surface to the user.
        throw new Error(`NPS submit failed: ${resp.status} ${resp.statusText}`)
      }
    } catch (err: unknown) {
      // Re-throw only if this wasn't a 404/405 we already swallowed above.
      // Network errors (DNS failure, connection refused, timeout) still
      // propagate so the user sees a failure toast and can retry.
      if (err instanceof Error && err.message.startsWith('NPS submit failed:')) {
        throw err
      }
      console.debug('[NPS] backend unreachable — falling back to GA4-only capture', err)
    }

    // Emit to GA4 regardless of backend status — this is the canonical
    // record. emitNPSResponse bypasses the analytics opt-out gate because
    // NPS is voluntary, user-initiated feedback (see analytics.ts).
    // `backendAccepted` is tracked locally for future persistent-state
    // enrichment; not yet surfaced to GA4.
    void backendAccepted
    const category = NPS_CATEGORIES[score - 1]
    emitNPSResponse(score, category, feedback ? feedback.length : undefined)

    // Create GitHub issue for detractors only when the user explicitly opts in.
    const trimmed = feedback?.trim() || ''
    if (score === 1 && options?.allowPublicIssue && trimmed.length >= MIN_NPS_PUBLIC_ISSUE_FEEDBACK_LENGTH) {
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
      snoozedUntil: null,
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
    const dismissedAt = new Date()

    const newState: NPSPersistentState = {
      ...state,
      lastDismissedAt: dismissedAt.toISOString(),
      snoozedUntil: new Date(dismissedAt.getTime() + (NPS_DISMISS_RETRY_DAYS * MS_PER_DAY)).toISOString(),
      dismissCount: newDismissCount,
      maxDismissalsReachedAt: newDismissCount >= NPS_MAX_DISMISSALS
        ? dismissedAt.toISOString()
        : state.maxDismissalsReachedAt,
    }
    safeSetJSON(STORAGE_KEY_NPS_STATE, newState)

    emitNPSDismissed(newDismissCount)
    setIsVisible(false)
  }, [])

  return { isVisible, submitResponse, dismiss }
}
