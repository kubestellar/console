const STORAGE_KEY = 'kc_browser_notif_verified'

/** Verification expiry — 30 days in milliseconds */
const VERIFICATION_TTL_MS = 30 * 24 * 60 * 60 * 1000

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

/** Persist whether the user has verified browser notifications */
export function setBrowserNotifVerified(verified: boolean): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ verified, at: Date.now() }))
}
