import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { getLastRoute } from '../../hooks/useLastRoute'
import { ROUTES, getLoginWithError } from '../../config/routes'
import { useTranslation } from 'react-i18next'
import { useToast } from '../ui/Toast'
import { safeGetItem, safeRemoveItem, safeSetItem } from '../../lib/utils/localStorage'
import { emitGitHubConnected } from '../../lib/analytics'
import { STORAGE_KEY_HAS_SESSION } from '../../lib/constants/storage'
import { captureClientCtxFromFragment } from '../../lib/clientCtx'

/** Timeout (ms) for the /auth/refresh call that confirms the HttpOnly cookie session. */
const AUTH_REFRESH_TIMEOUT_MS = 5_000

/** Short delay (ms) before navigating after a partial failure. */
const NAVIGATE_AFTER_ERROR_DELAY_MS = 500

export function AuthCallback() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { refreshUser } = useAuth()
  const { showToast } = useToast()
  // Initial status reflects the work the effect is about to do, so we can
  // skip calling setStatus synchronously inside the effect body
  // (react-hooks/set-state-in-effect).
  const [status, setStatus] = useState(() => t('authCallback.fetchingUserInfo'))
  const hasProcessed = useRef(false)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    // Prevent running multiple times
    if (hasProcessed.current) return
    hasProcessed.current = true

    const error = searchParams.get('error')

    if (error) {
      navigate(getLoginWithError(error))
      return
    }

    // Capture the one-shot credential passed via URL fragment by the
    // OAuth callback, stash it (obfuscated) in session storage, then
    // strip the fragment so it doesn't linger in history.
    captureClientCtxFromFragment()

    // The backend sets the JWT in an HttpOnly cookie during the OAuth redirect
    // (#4278 — never put the token in the URL). We call POST /auth/refresh to
    // confirm the cookie is valid and to mint a fresh JWT — but the token is
    // delivered EXCLUSIVELY via the cookie (#6590), never via the JSON body.
    // After confirming, we mark the session and let refreshUser() bootstrap
    // the user via /api/me using cookie auth.
    const onboarded = searchParams.get('onboarded') === 'true'

    // Check for a return-to URL saved by ProtectedRoute (deep-link through OAuth),
    // then fall back to the last visited dashboard route, then '/'.
    const RETURN_TO_KEY = 'kubestellar-return-to'
    const returnTo = safeGetItem(RETURN_TO_KEY)
    if (returnTo) safeRemoveItem(RETURN_TO_KEY)
    const destination = returnTo || getLastRoute() || ROUTES.HOME

    // Track whether the component is still mounted and whether the token
    // exchange actually succeeded. If `setToken` ran, the user is logged in
    // — a later `refreshUser` failure is non-fatal and must NOT trigger
    // the "failed to fetch user info" warning toast or the navigate-to-login,
    // both of which were leaking through during the StrictMode double-mount
    // race and after legitimate token exchanges (#6214 follow-up).
    let cancelled = false
    let tokenExchangeSucceeded = false

    // Exchange the HttpOnly cookie for a token via /auth/refresh
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), AUTH_REFRESH_TIMEOUT_MS)

    fetch('/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin', // send the HttpOnly cookie
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      signal: controller.signal,
    })
      .then((res) => {
        clearTimeout(timeoutId)
        if (!res.ok) throw new Error(`refresh failed: ${res.status}`)
        return res.json()
      })
      .then((data: { refreshed?: boolean; onboarded?: boolean }) => {
        // #6590 — /auth/refresh delivers the JWT exclusively via the
        // HttpOnly kc_auth cookie. The body carries only the success
        // signal and onboarding state. The JWT is intentionally NOT
        // returned in JSON so JavaScript / XSS / extensions cannot read it.
        if (!data.refreshed) {
          throw new Error('refresh did not return refreshed:true')
        }

        // Persist the "we have a session" hint so future page loads attempt
        // /auth/refresh from the cookie rather than going straight to login.
        safeSetItem(STORAGE_KEY_HAS_SESSION, 'true')

        emitGitHubConnected()
        tokenExchangeSucceeded = true

        // Bootstrap the user via /api/me using the cookie. refreshUser()
        // will fall through to the cookie-only path because no JS-readable
        // token exists.
        const _isOnboarded = data.onboarded ?? onboarded
        void _isOnboarded // reserved for future onboarding routing
        return refreshUser()
      })
      .then(() => {
        if (cancelled) return
        navigate(destination)
      })
      .catch((_err) => {
        clearTimeout(timeoutId)
        if (cancelled) return

        // Token exchange already succeeded — user is authenticated. The only
        // thing that failed was the follow-up refreshUser() call, which the
        // auth context will retry on demand. Proceed to the destination
        // silently rather than bouncing back to login with a misleading toast.
        if (tokenExchangeSucceeded) {
          navigate(destination)
          return
        }

        showToast(t('authCallback.failedToFetchUser'), 'warning')
        setStatus(t('authCallback.completingSignIn'))
        errorTimerRef.current = setTimeout(() => {
          navigate(getLoginWithError('token_exchange_failed'))
        }, NAVIGATE_AFTER_ERROR_DELAY_MS)
      })

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      clearTimeout(errorTimerRef.current)
    }
  }, [searchParams, refreshUser, navigate, showToast, t])

  return (
    <div className="min-h-screen flex items-center justify-center bg-terminal">
      <div className="text-center">
        <div className="spinner w-12 h-12 mx-auto mb-4" role="status" />
        <p className="text-muted-foreground">{status}</p>
      </div>
    </div>
  )
}
