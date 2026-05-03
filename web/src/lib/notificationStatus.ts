import { MS_PER_DAY } from './constants/time'

const STORAGE_KEY = 'kc_browser_notif_verified'

/** Verification expiry — 30 days in milliseconds */
const VERIFICATION_TTL_MS = 30 * MS_PER_DAY

/** Returns true if user has confirmed browser notifications work */
export function isBrowserNotifVerified(): boolean {
  try {
    const val = localStorage.getItem(STORAGE_KEY)
    if (!val) return false
    const { verified, at } = JSON.parse(val)
    if (Date.now() - at > VERIFICATION_TTL_MS) return false
    return verified === true
  } catch {
    return false
  }
}

/**
 * Persist whether the user has verified browser notifications.
 * Returns true if the value was successfully written to localStorage,
 * false if the write failed (e.g., quota exceeded, private-browsing
 * mode, or storage disabled). Without this guard, setItem could throw
 * uncaught — crashing the click handler — or silently appear to succeed
 * while the value evaporates on reload (#8866).
 */
export function setBrowserNotifVerified(verified: boolean): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ verified, at: Date.now() }))
    return true
  } catch (e: unknown) {
    // Common causes: QuotaExceededError, SecurityError (private browsing
    // with storage disabled), or browser storage policies. Log so the
    // failure isn't completely silent for users / support.
    console.warn('[notificationStatus] Failed to persist verification flag:', e)
    return false
  }
}
