import { useState, useEffect } from 'react'
import { BACKEND_DEFAULT_URL } from '../../lib/constants'
import { isDemoModeForced } from '../../lib/demoMode'

const FEEDBACK_TOKEN_CHECK_TIMEOUT_MS = 10_000

/**
 * Checks whether the FEEDBACK_GITHUB_TOKEN is configured on the backend.
 * Returns true when the token is missing, false when present or unchecked.
 */
export function useFeedbackToken(isOpen: boolean, token: string | null | undefined): boolean {
  const [feedbackTokenMissing, setFeedbackTokenMissing] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setFeedbackTokenMissing(false)
      return
    }
    if (isDemoModeForced) return

    setFeedbackTokenMissing(false)

    fetch(`${BACKEND_DEFAULT_URL}/api/github/token/status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(FEEDBACK_TOKEN_CHECK_TIMEOUT_MS),
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setFeedbackTokenMissing(!data.hasToken)
        }
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          // Silently ignore — backend may not be reachable (e.g. demo mode)
        }
      })
  }, [isOpen, token])

  return feedbackTokenMissing
}
