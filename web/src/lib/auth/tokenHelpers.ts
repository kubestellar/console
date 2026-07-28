// Token/JWT helpers and user-cache utilities extracted from auth.tsx so the
// provider implementation file stays under the max-lines limit (tracked by
// #15790, split by #21605). No behaviour change — these are the same
// functions/constants that previously lived at module scope in auth.tsx.

import { MS_PER_SECOND } from '../constants/time'
import { STORAGE_KEY_USER_CACHE } from '../constants'
import { safeRemove, safeSetJSON } from '../safeLocalStorage'
import i18n from '../i18n'
import type { User } from './types'

export const AUTH_USER_CACHE_KEY = STORAGE_KEY_USER_CACHE
/** Timestamp (ms) of the last successful /api/me round-trip — tracked so we
 *  can bound how long cached user data is trusted when the backend is down (#6067). */
export const AUTH_USER_CACHE_VALIDATED_KEY = 'kc-user-cache-validated'

// How often (in ms) to check if the JWT is nearing expiry
export const EXPIRY_CHECK_INTERVAL_MS = 60_000
// Show a warning banner when the token expires within this many ms
export const EXPIRY_WARNING_THRESHOLD_MS = 30 * 60_000

/** #6067 — maximum age of cached user data (5 min) before we force re-validation. */
export const MAX_CACHED_USER_AGE_MS = 5 * 60 * 1_000
/** #6067 — interval for background re-validation when the backend is unreachable. */
export const BACKEND_REVALIDATE_INTERVAL_MS = 30_000

/**
 * Decode the expiry timestamp from a JWT without verifying signature.
 * Returns the `exp` value in ms, or null if the token isn't decodable.
 */
export function getJwtExpiryMs(token: string): number | null {
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
export function showExpiryWarningBanner(onRefresh: () => void): void {
  if (document.getElementById('session-expiry-warning')) return

  /* Spacing & color constants for DOM-based banner (Tailwind unavailable in imperative DOM) */
  const BANNER_BOTTOM_PX = '24px'
  const BANNER_GAP_PX = '12px'
  const BANNER_PAD_V_PX = '12px'
  const BANNER_PAD_H_PX = '20px'
  const BANNER_RADIUS_PX = '8px'
  const WARN_BG = 'hsl(var(--warning) / 0.15)'
  const WARN_BORDER = 'hsl(var(--warning) / 0.4)'
  const WARN_TEXT = 'hsl(var(--warning-foreground))'
  const BTN_MARGIN_LEFT_PX = '8px'
  const BTN_PAD_V_PX = '4px'
  const BTN_PAD_H_PX = '12px'
  const TOAST_Z_INDEX = 99_999

  const banner = document.createElement('div')
  banner.id = 'session-expiry-warning'
  banner.style.cssText = `
    position: fixed; bottom: ${BANNER_BOTTOM_PX}; left: 50%; transform: translateX(-50%); z-index: ${TOAST_Z_INDEX};
    display: flex; align-items: center; gap: ${BANNER_GAP_PX};
    padding: ${BANNER_PAD_V_PX} ${BANNER_PAD_H_PX};
    background: ${WARN_BG};
    border: 1px solid ${WARN_BORDER};
    border-radius: ${BANNER_RADIUS_PX}; backdrop-filter: blur(8px);
    color: ${WARN_TEXT}; font-family: system-ui, sans-serif; font-size: 14px;
    animation: slideUp 0.3s ease-out;
  `
  banner.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
    <span><strong>${i18n.t('session.expiresSoon')}</strong></span>
  `

  const btn = document.createElement('button')
  btn.textContent = i18n.t('session.refreshNow')
  btn.style.cssText = `
    margin-left: ${BTN_MARGIN_LEFT_PX}; padding: ${BTN_PAD_V_PX} ${BTN_PAD_H_PX}; border-radius: ${BANNER_RADIUS_PX};
    background: hsl(var(--warning) / 0.3); border: 1px solid hsl(var(--warning) / 0.5);
    color: hsl(var(--warning-foreground)); cursor: pointer; font-size: 13px; font-family: inherit;
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

export function getCachedUser(): User | null {
  try {
    const cached = localStorage.getItem(AUTH_USER_CACHE_KEY)
    return cached ? JSON.parse(cached) : null
  } catch {
    return null
  }
}

export function cacheUser(userData: User | null) {
  if (userData) {
    safeSetJSON(AUTH_USER_CACHE_KEY, userData)
  } else {
    safeRemove(AUTH_USER_CACHE_KEY)
  }
}
