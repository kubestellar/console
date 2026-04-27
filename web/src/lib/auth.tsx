import { createContext, use, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react'
import { MS_PER_SECOND } from './constants/time'
import { checkOAuthConfigured, checkOAuthConfiguredWithRetry } from './api'
import { dashboardSync } from './dashboards/dashboardSync'
import { clearPermissionsCache } from '../hooks/usePermissions'
import { disconnectPresence } from '../hooks/useActiveUsers'
import { clearSSECache } from './sseClient'
import { clearClusterCacheOnLogout } from '../hooks/mcp/shared'
import { STORAGE_KEY_TOKEN, DEMO_TOKEN_VALUE, STORAGE_KEY_DEMO_MODE, STORAGE_KEY_ONBOARDED, STORAGE_KEY_USER_CACHE, STORAGE_KEY_HAS_SESSION, FETCH_DEFAULT_TIMEOUT_MS } from './constants'
/** localStorage key for the kc-agent shared secret (must match shared.ts) */
const AGENT_TOKEN_STORAGE_KEY = 'kc-agent-token'
import { emitLogin, emitLogout, setAnalyticsUserId, setAnalyticsUserProperties, emitConversionStep, emitDeveloperSession, emitSessionRefreshFailure } from './analytics'
import { setDemoMode as setGlobalDemoMode } from './demoMode'
import { AuthRefreshResponseSchema, UserSchema } from './schemas'
import { validateResponse } from './schemas/validate'

interface User {
  id: string
  github_id: string
  github_login: string
  email?: string
  slack_id?: string
  avatar_url?: string
  role?: 'admin' | 'editor' | 'viewer'
  onboarded: boolean
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: () => void
  logout: () => void
  setToken: (token: string, onboarded: boolean) => void
  refreshUser: (overrideToken?: string) => Promise<void>
}

const AUTH_USER_CACHE_KEY = STORAGE_KEY_USER_CACHE
/** Timestamp (ms) of the last successful /api/me round-trip — tracked so we
 *  can bound how long cached user data is trusted when the backend is down (#6067). */
const AUTH_USER_CACHE_VALIDATED_KEY = 'kc-user-cache-validated'

// How often (in ms) to check if the JWT is nearing expiry
const EXPIRY_CHECK_INTERVAL_MS = 60_000
// Show a warning banner when the token expires within this many ms
const EXPIRY_WARNING_THRESHOLD_MS = 30 * 60_000

/** #6067 — maximum age of cached user data (5 min) before we force re-validation. */
const MAX_CACHED_USER_AGE_MS = 5 * 60 * 1_000
/** #6067 — interval for background re-validation when the backend is unreachable. */
const BACKEND_REVALIDATE_INTERVAL_MS = 30_000

/**
 * Decode the expiry timestamp from a JWT without verifying signature.
 * Returns the `exp` value in ms, or null if the token isn't decodable.
 */
function getJwtExpiryMs(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    // JWT uses base64url encoding — convert to standard base64 for atob()
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64))
    if (typeof payload.exp !== 'number') return null
    return payload.exp * MS_PER_SECOND
  } catch {
    return null
  }
}

/**
 * #6058 — Return true only when a token is a *parseable* JWT whose `exp`
 * has passed. For opaque / non-JWT tokens we return false (not expired)
 * so we still attempt the /api/me call and let the backend decide. This
 * avoids false-positive logouts for tokens that simply aren't JWTs.
 */
export function isJWTExpired(token: string): boolean {
  const expiryMs = getJwtExpiryMs(token)
  if (expiryMs === null) return false
  return Date.now() >= expiryMs
}


/**
 * Inject a DOM-based warning banner when the session is about to expire.
 * The user can click "Refresh Now" to silently renew their token.
 */
function showExpiryWarningBanner(onRefresh: () => void): void {
  if (document.getElementById('session-expiry-warning')) return

  /* Spacing constants for DOM-based banner (Tailwind unavailable in imperative DOM) */
  const BANNER_BOTTOM_PX = '24px'
  const BANNER_GAP_PX = '12px'
  const BANNER_PAD_V_PX = '12px'
  const BANNER_PAD_H_PX = '20px'
  const BANNER_RADIUS_PX = '8px'
  const BTN_MARGIN_LEFT_PX = '8px'
  const BTN_PAD_V_PX = '4px'
  const BTN_PAD_H_PX = '12px'

  const banner = document.createElement('div')
  banner.id = 'session-expiry-warning'
  banner.style.cssText = `
    position: fixed; bottom: ${BANNER_BOTTOM_PX}; left: 50%; transform: translateX(-50%); z-index: 99999;
    display: flex; align-items: center; gap: ${BANNER_GAP_PX};
    padding: ${BANNER_PAD_V_PX} ${BANNER_PAD_H_PX};
    background: rgba(234,179,8,0.15);
    border: 1px solid rgba(234,179,8,0.4);
    border-radius: ${BANNER_RADIUS_PX}; backdrop-filter: blur(8px);
    color: #fbbf24; font-family: system-ui, sans-serif; font-size: 14px;
    animation: slideUp 0.3s ease-out;
  `
  banner.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
    <span><strong>Session expires soon</strong></span>
  `

  const btn = document.createElement('button')
  btn.textContent = 'Refresh Now'
  btn.style.cssText = `
    margin-left: ${BTN_MARGIN_LEFT_PX}; padding: ${BTN_PAD_V_PX} ${BTN_PAD_H_PX}; border-radius: ${BANNER_RADIUS_PX};
    background: rgba(234,179,8,0.3); border: 1px solid rgba(234,179,8,0.5);
    color: #fbbf24; cursor: pointer; font-size: 13px; font-family: inherit;
  `
  btn.onclick = () => {
    onRefresh()
    banner.remove()
  }
  banner.appendChild(btn)

  // Reuse a single <style> element for the slideUp animation to avoid unbounded DOM growth
  const STYLE_ID = 'session-banner-animation'
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `@keyframes slideUp { from { transform: translateX(-50%) translateY(100%); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }`
    document.head.appendChild(style)
  }
  document.body.appendChild(banner)
}

function getCachedUser(): User | null {
  try {
    const cached = localStorage.getItem(AUTH_USER_CACHE_KEY)
    return cached ? JSON.parse(cached) : null
  } catch {
    return null
  }
}

function cacheUser(userData: User | null) {
  if (userData) {
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(userData))
  } else {
    localStorage.removeItem(AUTH_USER_CACHE_KEY)
  }
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getCachedUser)
  const [token, setTokenState] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY_TOKEN)
  )
  // Start loading until refreshUser() resolves — this prevents a flash of the login
  // page while we check whether to auto-enable demo mode (Helm installs / from-lens).
  // Exception: if we already have a token AND cached user, skip loading (stale-while-revalidate).
  const [isLoading, setIsLoading] = useState(() => {
    const hasToken = !!localStorage.getItem(STORAGE_KEY_TOKEN)
    const hasCachedUser = !!getCachedUser()
    // No token: still loading — refreshUser() will check OAuth and may auto-demo
    // Has token + no cache: loading — refreshUser() will fetch user
    // Has token + cache: not loading — show cached data immediately
    return !hasToken || (hasToken && !hasCachedUser)
  })

  const logout = useCallback(() => {
    emitLogout()

    // Invalidate the server-side session before clearing client state (#4751).
    // Fire-and-forget: even if the backend call fails, we still clear local state
    // so the user is logged out on the client side.
    const currentToken = localStorage.getItem(STORAGE_KEY_TOKEN)
    if (currentToken && currentToken !== DEMO_TOKEN_VALUE) {
      fetch('/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentToken}` },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      }).catch(() => {
        // Backend unreachable — token will expire naturally
      })
    }

    // Clear every place a token or cached user could live. The token is
    // written to localStorage today, but defensively wipe sessionStorage as
    // well so that any past or future code path that parks a token there
    // can't leak into the next session (#6004).
    localStorage.removeItem(STORAGE_KEY_TOKEN)
    localStorage.removeItem(AGENT_TOKEN_STORAGE_KEY)
    localStorage.removeItem(AUTH_USER_CACHE_KEY)
    localStorage.removeItem(STORAGE_KEY_HAS_SESSION)
    try {
      sessionStorage.removeItem(STORAGE_KEY_TOKEN)
      sessionStorage.removeItem(AUTH_USER_CACHE_KEY)
      // Rotate the presence session ID so the next login is tracked as a
      // brand-new session instead of inheriting the logged-out user's.
      sessionStorage.removeItem('kc-session-id')
    } catch {
      // sessionStorage may be unavailable in some embedded contexts — ignore.
    }
    cacheUser(null)
    // Flush in-memory auth context state so no stale references survive
    // the logout call (#6004).
    setTokenState(null)
    setUser(null)
    // Clear dashboard sync cache
    dashboardSync.clearCache()
    // Clear permissions cache so the next login doesn't serve stale data
    clearPermissionsCache()
    // Clear SSE result cache to prevent stale data from previous session (#4712)
    clearSSECache()
    // Clear cluster caches (localStorage + in-memory) so the next user
    // doesn't see stale cluster names, metrics, or distributions (#5405)
    clearClusterCacheOnLogout()
    // Disconnect presence WebSocket to stop transmitting stale auth tokens (#4936)
    disconnectPresence()
  }, [])

  const setDemoMode = useCallback(() => {
    // If user explicitly disabled demo mode, respect their choice.
    // They want AI mode (agent) or live mode (backend) — not demo fallback.
    const userExplicitlyDisabledDemo = localStorage.getItem(STORAGE_KEY_DEMO_MODE) === 'false'
    if (userExplicitlyDisabledDemo) return

    const isNetlifyPreview = import.meta.env.VITE_DEMO_MODE === 'true' ||
      window.location.hostname.includes('netlify.app') ||
      window.location.hostname.includes('deploy-preview-')
    const demoOnboarded = isNetlifyPreview || localStorage.getItem(STORAGE_KEY_ONBOARDED) === 'true'
    localStorage.setItem(STORAGE_KEY_TOKEN, DEMO_TOKEN_VALUE)
    setTokenState(DEMO_TOKEN_VALUE)
    const demoUser: User = {
      id: 'demo-user',
      github_id: '12345',
      github_login: 'demo-user',
      email: 'demo@example.com',
      avatar_url: 'https://api.dicebear.com/9.x/bottts/svg?seed=stellar-commander&backgroundColor=0d1117',
      role: 'viewer',
      onboarded: demoOnboarded }
    setUser(demoUser)
    cacheUser(demoUser)
    setAnalyticsUserId(demoUser.id)
    setAnalyticsUserProperties({ auth_mode: 'demo' })
    // Sync the global demoMode singleton so Layout banners and useDemoMode() hook
    // reflect demo state immediately — without this, the in-cluster banner won't
    // render because Layout's auto-demo-enable effect skips when isInClusterMode.
    setGlobalDemoMode(true)
  }, [])

  const refreshUser = useCallback(async (overrideToken?: string) => {
    const effectiveToken = overrideToken || localStorage.getItem(STORAGE_KEY_TOKEN)
    if (!effectiveToken) {
      // #6055 — Retry the OAuth-configured probe during backend startup so we
      // don't race the backend into demo mode when the server is still coming
      // online. checkOAuthConfiguredWithRetry attempts up to
      // OAUTH_STARTUP_RETRY_ATTEMPTS times before giving up.
      let backendUp = false
      let oauthConfigured = false
      try {
        ({ backendUp, oauthConfigured } = await checkOAuthConfiguredWithRetry())
      } catch {
        // Complete failure — fall through to demo mode
      }

      if (backendUp && oauthConfigured) {
        // #6925 — Only attempt /auth/refresh if we have evidence of a prior
        // session. The HttpOnly cookie is invisible to JS, so we check the
        // kc-has-session localStorage hint set during the OAuth callback.
        // Without this gate, fresh visitors see a spurious 401 in DevTools.
        const hadPriorSession = !!localStorage.getItem(STORAGE_KEY_HAS_SESSION)
        if (!hadPriorSession) {
          // No prior session — go straight to login page, no network call
          return
        }
        // #6066 — If the user has a valid HttpOnly cookie from a previous
        // session, /auth/refresh will mint a new JWT. Try that before showing
        // the login page so a page reload can restore the session silently.
        try {
          const refreshResponse = await fetch('/auth/refresh', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              // #6588 — CSRF gate on /auth/refresh
              'X-Requested-With': 'XMLHttpRequest',
            },
            signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
          })
          if (refreshResponse.ok) {
            // #6590 — /auth/refresh delivers the new JWT EXCLUSIVELY via the
            // HttpOnly kc_auth cookie. The body carries only
            // { refreshed: true, onboarded }. Since the cookie is HttpOnly,
            // we cannot read the token from JS — but the JWTAuth middleware
            // accepts the cookie on subsequent requests, so we can call
            // /api/me directly via cookie credentials to populate the user.
            const rawRefresh = await refreshResponse.json().catch(() => null)
            const data = validateResponse(AuthRefreshResponseSchema, rawRefresh, '/auth/refresh')
            if (data?.refreshed) {
              try {
                localStorage.setItem(STORAGE_KEY_HAS_SESSION, 'true')
              } catch {
                // localStorage quota — best-effort hint
              }
              // Fetch kc-agent token so agentFetch/WebSocket can authenticate
              try {
                const agentRes = await fetch('/api/agent/token', {
                  credentials: 'same-origin',
                  headers: { 'X-Requested-With': 'XMLHttpRequest' },
                  signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
                })
                if (agentRes.ok) {
                  const agentData = await agentRes.json()
                  if (agentData.token) localStorage.setItem(AGENT_TOKEN_STORAGE_KEY, agentData.token)
                }
              } catch {
                // Non-fatal — agent auth will fail but session is intact
              }
              const meResponse = await fetch('/api/me', {
                credentials: 'include',
                signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
              })
              if (meResponse.ok) {
                const rawUser = await meResponse.json().catch(() => null)
                const userData = validateResponse(UserSchema, rawUser, '/api/me') as User | null
                if (userData) {
                  setUser(userData)
                  cacheUser(userData)
                  try {
                    localStorage.setItem(AUTH_USER_CACHE_VALIDATED_KEY, String(Date.now()))
                  } catch {
                    // localStorage quota — best-effort
                  }
                  setAnalyticsUserId(userData.id)
                  setAnalyticsUserProperties({ auth_mode: 'github-oauth' })
                  return
                }
              }
            }
          }
          // #6930 — A 401/403 from /auth/refresh is a definitive signal that
          // the server session has expired. Clear the session hint so future
          // page loads don't keep hitting /auth/refresh in a loop.
          const HTTP_UNAUTHORIZED = 401
          const HTTP_FORBIDDEN = 403
          if (refreshResponse.status === HTTP_UNAUTHORIZED || refreshResponse.status === HTTP_FORBIDDEN) {
            localStorage.removeItem(STORAGE_KEY_HAS_SESSION)
          }
        } catch {
          // Refresh failed (network error / timeout) — fall through to show
          // login page. Do NOT clear kc-has-session here: the server may be
          // temporarily unreachable and the session could still be valid.
        }
        // OAuth configured + no valid cookie — show login page
        return
      }
      setDemoMode()
      return
    }

    // #6058 — If the token is a real JWT but already expired, don't attempt
    // /api/me with it (which will just 401). Clear it and recurse so the
    // no-token branch above can try restoring from the HttpOnly cookie.
    if (effectiveToken !== DEMO_TOKEN_VALUE && isJWTExpired(effectiveToken)) {
      localStorage.removeItem(STORAGE_KEY_TOKEN)
      localStorage.removeItem(AUTH_USER_CACHE_KEY)
      localStorage.removeItem(AUTH_USER_CACHE_VALIDATED_KEY)
      setTokenState(null)
      setUser(null)
      await refreshUser()
      return
    }

    // Demo token — check if the backend has come online since the token was issued.
    // If the user explicitly enabled demo mode (via the toggle), keep it even if
    // the backend is available. Otherwise, clear the stale demo token so the user
    // can authenticate with a real JWT.
    if (effectiveToken === DEMO_TOKEN_VALUE) {
      const userExplicitlyEnabledDemo = localStorage.getItem(STORAGE_KEY_DEMO_MODE) === 'true'
      if (!userExplicitlyEnabledDemo) {
        const { backendUp, oauthConfigured } = await checkOAuthConfigured()
        if (backendUp) {
          if (!oauthConfigured) {
            // No OAuth — stay in demo mode. The Layout will auto-enable demo mode
            // when the agent is disconnected, providing the same experience as
            // console.kubestellar.io. If an agent connects later, demo mode will
            // auto-disable and the user gets live data.
            setDemoMode()
            return
          }
          // OAuth configured — clear demo token so login page appears
          localStorage.removeItem(STORAGE_KEY_TOKEN)
          cacheUser(null)
          setTokenState(null)
          setUser(null)
          return
        }
      }
      setDemoMode()
      return
    }

    try {
      // Use fetch directly instead of api.get to bypass the backend availability
      // cache. refreshUser is the auth bootstrapping function — it must always
      // attempt the request, even if a stale cache says the backend is down.
      const meResponse = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${effectiveToken}` },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (meResponse.status === 429) {
        const cachedUser = getCachedUser()
        if (cachedUser) {
          console.warn('Backend rate-limited (429), using cached user data')
          setUser(prev => {
            if (prev && prev.id === cachedUser.id && prev.github_login === cachedUser.github_login) return prev
            return cachedUser
          })
          setAnalyticsUserId(cachedUser.id)
          return
        }
      }
      if (!meResponse.ok) throw new Error(`/api/me returned ${meResponse.status}`)
      const rawMe = await meResponse.json().catch(() => null)
      const userData = validateResponse(UserSchema, rawMe, '/api/me') as User | null
      if (!userData) throw new Error('Invalid JSON from /api/me')
      // #6149 — Avoid triggering an AuthProvider re-render cascade when the
      // background /api/me poll returns an identical user. Shallow-compare
      // the fields that actually matter for downstream consumers.
      setUser(prev => {
        if (
          prev &&
          prev.id === userData.id &&
          prev.github_id === userData.github_id &&
          prev.github_login === userData.github_login &&
          prev.email === userData.email &&
          prev.avatar_url === userData.avatar_url &&
          prev.role === userData.role &&
          prev.onboarded === userData.onboarded &&
          prev.slack_id === userData.slack_id
        ) {
          return prev
        }
        return userData
      })
      cacheUser(userData)
      // #6925 — Mark that an authenticated session exists so future page
      // loads know it's worth attempting /auth/refresh from the HttpOnly cookie.
      try {
        localStorage.setItem(STORAGE_KEY_HAS_SESSION, 'true')
      } catch {
        // localStorage quota — session hint is best-effort
      }
      // #6067 — record when the cache was last validated so we can bound
      // how long it's trusted if the backend later becomes unreachable.
      try {
        localStorage.setItem(AUTH_USER_CACHE_VALIDATED_KEY, String(Date.now()))
      } catch {
        // localStorage quota / private mode — cache will just be treated as fresh
      }
      // Set anonymous analytics ID (SHA-256 hash — no PII)
      setAnalyticsUserId(userData.id)
      setAnalyticsUserProperties({ auth_mode: 'github-oauth' })
      // Detect developer running cloned repo with startup-oauth.sh
      emitDeveloperSession()
    } catch (error) {
      // #6067 — If the backend is temporarily unreachable but we have a real
      // token, keep the cached user ONLY if it's still fresh. Stale caches
      // drop the user to login instead of silently trusting old data forever.
      const cachedUser = getCachedUser()
      const validatedAtRaw = (() => {
        try { return localStorage.getItem(AUTH_USER_CACHE_VALIDATED_KEY) } catch { return null }
      })()
      const validatedAt = validatedAtRaw ? Number(validatedAtRaw) : 0
      const cacheAge = validatedAt ? Date.now() - validatedAt : Number.POSITIVE_INFINITY
      if (cachedUser && cacheAge <= MAX_CACHED_USER_AGE_MS) {
        console.warn('Backend unreachable, using cached user data (age ms):', cacheAge)
        // #6149 — Only call setUser when the cached user differs from
        // current state. setUser with a brand-new object reference would
        // otherwise trigger a provider-wide re-render on every background
        // revalidate tick even when nothing changed.
        setUser(prev => {
          if (prev && prev.id === cachedUser.id && prev.github_login === cachedUser.github_login) {
            return prev
          }
          return cachedUser
        })
        setAnalyticsUserId(cachedUser.id)
        setAnalyticsUserProperties({ auth_mode: 'github-oauth' })
        return
      }
      // Cache is stale or missing — drop to login (clear token so the
      // ProtectedRoute redirects and the user re-authenticates).
      // #6930 — Do NOT clear STORAGE_KEY_HAS_SESSION here. An /api/me
      // failure could be a transient network issue; clearing the hint
      // would prevent silent session recovery on the next page load.
      // The hint is cleared authoritatively when /auth/refresh returns
      // 401/403 (definitive proof the server session is gone).
      console.error('Failed to fetch user (cache stale or missing), dropping to login:', error)
      localStorage.removeItem(STORAGE_KEY_TOKEN)
      localStorage.removeItem(AUTH_USER_CACHE_KEY)
      localStorage.removeItem(AUTH_USER_CACHE_VALIDATED_KEY)
      setTokenState(null)
      setUser(null)
    }
  }, [setDemoMode])

  const login = useCallback(async () => {
    // Demo mode enabled via:
    // 1. Explicit environment variable VITE_DEMO_MODE=true
    // 2. Netlify deploy previews (deploy-preview-* hostnames) - safe because these are ephemeral test environments
    // 3. Backend is unavailable (graceful fallback for local development)
    // 4. Backend has no OAuth configured (Helm install / from-lens — same UX as console.kubestellar.io)
    const explicitDemoMode = import.meta.env.VITE_DEMO_MODE === 'true' ||
      window.location.hostname.includes('deploy-preview-') ||
      window.location.hostname.includes('netlify.app')

    // Single check: backend availability + OAuth config (the /health endpoint returns both)
    let backendUp = false
    let oauthConfigured = false
    try {
      ({ backendUp, oauthConfigured } = await checkOAuthConfigured())
    } catch {
      // Backend unreachable — fall through to demo mode
    }

    // When backend is up but no OAuth is configured (e.g. Helm install with no agent),
    // go straight to demo mode — same auto-login behavior as console.kubestellar.io.
    // If an agent connects later, Layout will auto-disable demo mode for live data.
    const shouldUseDemoMode = explicitDemoMode || !backendUp || !oauthConfigured

    if (shouldUseDemoMode) {
      emitLogin('demo')
      emitConversionStep(2, 'login', { method: 'demo' })
      setDemoMode()
      return
    }
    emitLogin('github-oauth')
    emitConversionStep(2, 'login', { method: 'github-oauth' })
    window.location.href = '/auth/github'
  }, [setDemoMode])

  const setToken = useCallback((newToken: string, onboarded: boolean) => {
    localStorage.setItem(STORAGE_KEY_TOKEN, newToken)
    setTokenState(newToken)
    // Clear stale cached user — refreshUser() will fetch and cache real data.
    // Do NOT cache the temp user: if refreshUser fails, the empty-field temp
    // user persists in localStorage and the profile shows "No email set".
    cacheUser(null)
    setUser({ id: '', github_id: '', github_login: '', onboarded } as User)
  }, [])

  // Periodically check if the JWT is nearing expiry and show a warning banner.
  // When the user clicks "Refresh Now", silently call /auth/refresh for a new token.
  useEffect(() => {
    if (!token || token === DEMO_TOKEN_VALUE) return

    const checkExpiry = () => {
      const currentToken = localStorage.getItem(STORAGE_KEY_TOKEN)
      if (!currentToken || currentToken === DEMO_TOKEN_VALUE) return

      const expiryMs = getJwtExpiryMs(currentToken)
      if (expiryMs === null) return

      const timeUntilExpiry = expiryMs - Date.now()
      // #6069 — Proactively log the user out the moment the token expires
      // instead of waiting for the next 401 to surface. This prevents a
      // window where the UI still looks authenticated but every API call
      // returns 401.
      if (timeUntilExpiry <= 0) {
        document.getElementById('session-expiry-warning')?.remove()
        logout()
        return
      }
      if (timeUntilExpiry > EXPIRY_WARNING_THRESHOLD_MS) {
        // Token not near expiry — remove stale banner if present
        document.getElementById('session-expiry-warning')?.remove()
        return
      }
      showExpiryWarningBanner(async () => {
        // Re-read the token at click time instead of using the stale closure
        // value — the token may have been silently refreshed since the banner
        // was shown (#3909).
        const freshToken = localStorage.getItem(STORAGE_KEY_TOKEN)
        if (!freshToken || freshToken === DEMO_TOKEN_VALUE) return
        try {
          // #8108 — Do NOT send Authorization to /auth/refresh. Backend
          // RefreshToken revokes the JTI of the presented bearer before
          // minting the replacement; sending `freshToken` would invalidate
          // the token the rest of this page is still using. Cookie-only
          // flow: rely on the HttpOnly kc_auth cookie + CSRF header.
          const response = await fetch('/auth/refresh', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              // #6588 — CSRF gate on /auth/refresh
              'X-Requested-With': 'XMLHttpRequest' },
            signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
          if (response.ok) {
            // #6590 — /auth/refresh delivers the new JWT exclusively via the
            // HttpOnly kc_auth cookie. There is no token in the JSON body to
            // copy into localStorage; the browser will use the refreshed
            // cookie automatically on subsequent requests. Mark the session
            // hint so future page loads know to attempt cookie restoration.
            try {
              localStorage.setItem(STORAGE_KEY_HAS_SESSION, 'true')
            } catch {
              // localStorage quota — best-effort hint
            }
          } else {
            // #6930 — A definitive auth failure from the banner refresh
            // should also clear the session hint to prevent stale loops.
            const HTTP_UNAUTHORIZED = 401
            const HTTP_FORBIDDEN = 403
            if (response.status === HTTP_UNAUTHORIZED || response.status === HTTP_FORBIDDEN) {
              localStorage.removeItem(STORAGE_KEY_HAS_SESSION)
            }
          }
        } catch (err) {
          emitSessionRefreshFailure(err instanceof Error ? err.message : 'network error')
        }
      })
    }

    // Check once immediately, then every EXPIRY_CHECK_INTERVAL_MS
    checkExpiry()
    const intervalId = setInterval(checkExpiry, EXPIRY_CHECK_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [token, logout])

  // Listen for token updates from silentRefresh() (dispatched via StorageEvent)
  // so the AuthProvider state stays in sync without a full page reload.
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY_TOKEN) return
      // #6065 — cross-tab logout: when another tab removes the token,
      // `e.newValue` is null. Immediately clear local auth state and
      // redirect to /login so both tabs end up logged out. Without this
      // branch, the other tab silently keeps stale auth until the user
      // triggers an API call that 401s.
      if (e.newValue === null) {
        setTokenState(null)
        setUser(null)
        cacheUser(null)
        try {
          localStorage.removeItem(AUTH_USER_CACHE_VALIDATED_KEY)
        } catch (e) { console.warn('[auth] failed to clear cached user validation key:', e) }
        document.getElementById('session-expiry-warning')?.remove()
        // Only redirect if we're not already on the login page to avoid a loop
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login'
        }
        return
      }
      if (e.newValue && e.newValue !== DEMO_TOKEN_VALUE) {
        setTokenState(e.newValue)
        // Remove the expiry warning banner since the token was just refreshed
        document.getElementById('session-expiry-warning')?.remove()
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  // #6067 — When the backend is unreachable, re-validate the cached user
  // periodically. If validation continues to fail past MAX_CACHED_USER_AGE_MS,
  // refreshUser() itself will drop the session. This background retry gives
  // us an opportunity to recover without requiring the user to interact.
  useEffect(() => {
    if (!token || token === DEMO_TOKEN_VALUE) return
    const intervalId = setInterval(() => {
      // Only re-validate if the cache is getting close to stale
      const validatedAtRaw = (() => {
        try { return localStorage.getItem(AUTH_USER_CACHE_VALIDATED_KEY) } catch { return null }
      })()
      const validatedAt = validatedAtRaw ? Number(validatedAtRaw) : 0
      const cacheAge = validatedAt ? Date.now() - validatedAt : Number.POSITIVE_INFINITY
      // Only re-validate if cache is older than half the max age — otherwise
      // we're spending cycles validating fresh data.
      const REVALIDATE_AGE_THRESHOLD_MS = MAX_CACHED_USER_AGE_MS / 2
      if (cacheAge >= REVALIDATE_AGE_THRESHOLD_MS) {
        refreshUser().catch(() => { /* refreshUser handles its own errors */ })
      }
    }, BACKEND_REVALIDATE_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [token, refreshUser])

  // Always attempt to resolve the user on mount — even with no token.
  // When there's no token, refreshUser() auto-enables demo mode so the user
  // lands on the dashboard immediately (same UX as console.kubestellar.io)
  // instead of flashing through the login page.
  const authInitRef = useRef(false)
  const authRunCount = useRef(0)
  useEffect(() => {
    authRunCount.current++
    if (authRunCount.current > 3) {
      console.error('[AUTH DEBUG] refreshUser effect fired', authRunCount.current, 'times — likely infinite loop. authInitRef:', authInitRef.current)
      return
    }
    if (authInitRef.current) return
    authInitRef.current = true
    refreshUser().finally(() => setIsLoading(false))
  }, [refreshUser])

  // #6058 — A real JWT that has already passed its `exp` must be treated as
  // unauthenticated immediately, even before the background checkExpiry
  // interval fires. Demo tokens (non-JWT sentinel values) are always valid
  // as long as they're present.
  // #6590 / #8087 — A cookie-only session has no JS-readable token but does
  // have a populated `user` (refreshUser sets it after /api/me succeeds via
  // the HttpOnly kc_auth cookie). Treat that combination as authenticated
  // so the rest of the app stops gating UI behind a Bearer token that no
  // longer needs to live in localStorage.
  const isAuthenticated = (() => {
    // Demo sentinel wins unconditionally.
    if (token === DEMO_TOKEN_VALUE) return true
    // #8108 — The cookie-only session (user + kc-has-session) is authoritative
    // and must be checked BEFORE falling back to the JS-readable token. Since
    // /auth/refresh no longer populates localStorage (#6590), any pre-existing
    // token will eventually cross its `exp` while the HttpOnly kc_auth cookie
    // is still perfectly valid — previously that short-circuited to
    // `false` here and logged the user out mid-session.
    if (user) {
      try {
        if (localStorage.getItem(STORAGE_KEY_HAS_SESSION) === 'true') return true
      } catch {
        // localStorage unavailable — fall through to the token check
      }
    }
    if (token) {
      return !isJWTExpired(token)
    }
    return false
  })()

  // #6149 — Memoize the context value so the AuthProvider doesn't cascade
  // a re-render across EVERY consumer (dashboard, cards, layout, etc.) on
  // every render of AuthProvider itself. Without this, the background
  // BACKEND_REVALIDATE_INTERVAL_MS / EXPIRY_CHECK_INTERVAL_MS timers produce
  // hundreds of spurious React commits during normal dashboard navigation.
  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      token,
      isAuthenticated,
      isLoading,
      login,
      logout,
      setToken,
      refreshUser }),
    [user, token, isAuthenticated, isLoading, login, logout, setToken, refreshUser]
  )

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Safe fallback for when useAuth is called outside AuthProvider.
 *
 * This can happen transiently during error-boundary recovery, stale chunk
 * re-evaluation, or KeepAlive route transitions.  Rather than throwing
 * (which triggers cascading GA4 runtime errors), return a "loading" stub
 * so the UI shows a spinner until the provider tree re-mounts.
 */
const AUTH_FALLBACK: AuthContextType = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  login: () => {},
  logout: () => {},
  setToken: () => {},
  refreshUser: () => Promise.resolve() }

export function useAuth() {
  const context = use(AuthContext)
  if (!context) {
    if (import.meta.env.DEV) {
      console.warn('useAuth was called outside AuthProvider — returning safe fallback')
    }
    return AUTH_FALLBACK
  }
  return context
}
