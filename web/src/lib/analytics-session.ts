/**
 * analytics-session.ts
 *
 * Client & session identity, bot/headless detection, engagement time tracking,
 * and UTM parameter capture. All state here is module-level and long-lived for
 * the duration of the page session.
 */

import { STORAGE_KEY_ANALYTICS_OPT_OUT, STORAGE_KEY_ANONYMOUS_USER_ID } from './constants'
import type { UtmParams } from './analytics-types'
import { MS_PER_MINUTE } from './constants/time'

// ── Storage keys ───────────────────────────────────────────────────

export const CID_KEY = '_ksc_cid'
export const SID_KEY = '_ksc_sid'
export const SC_KEY = '_ksc_sc'
export const LAST_KEY = '_ksc_last'

// ── Session ────────────────────────────────────────────────────────

export const SESSION_TIMEOUT_MS = 30 * MS_PER_MINUTE // 30 min

// ── Bot / Headless Detection ────────────────────────────────────────
// Automated installs (CI pipelines, cloud VMs running curl|bash) start
// the console but never interact with it. Without filtering, these
// generate tens of thousands of fake "users" from data center IPs.
// We gate analytics on real user interaction to exclude them.

/** Returns true if the environment looks automated/headless */
export function isAutomatedEnvironment(): boolean {
  try {
    // WebDriver flag — set by Puppeteer, Selenium, Playwright, headless Chrome
    if (navigator.webdriver) return true
    // Headless Chrome UA substring
    if (/HeadlessChrome/i.test(navigator.userAgent)) return true
    // PhantomJS
    if (/PhantomJS/i.test(navigator.userAgent)) return true
    // No browser plugins (headless browsers have none)
    // navigator.plugins is a PluginArray — check length, not truthiness
    if (navigator.plugins && navigator.plugins.length === 0 && !/Firefox/i.test(navigator.userAgent)) return true
    // No language preferences (bots often skip this)
    if (!navigator.languages || navigator.languages.length === 0) return true
  } catch {
    // If any check throws, assume real browser
  }
  return false
}

// ── Opt-out ────────────────────────────────────────────────────────

export function isOptedOut(): boolean {
  return localStorage.getItem(STORAGE_KEY_ANALYTICS_OPT_OUT) === 'true'
}

// ── Deployment type ────────────────────────────────────────────────

export type DeploymentType =
  | 'localhost'
  | 'containerized'
  | 'console.kubestellar.io'
  | 'netlify-preview'
  | 'unknown'

export function getDeploymentType(): DeploymentType {
  const h = window.location.hostname
  if (h === 'console.kubestellar.io') return 'console.kubestellar.io'
  if (h.includes('netlify.app')) return 'netlify-preview'
  if (h === 'localhost' || h === '127.0.0.1') return 'localhost'
  return 'containerized'
}

// ── Random helpers ─────────────────────────────────────────────────

export function rand(): string {
  return Math.floor(Math.random() * 2147483647).toString()
}

// ── Client & Session Management ────────────────────────────────────

export function getClientId(): string {
  let cid = localStorage.getItem(CID_KEY)
  if (!cid) {
    cid = `${rand()}.${Math.floor(Date.now() / 1000)}`
    localStorage.setItem(CID_KEY, cid)
  }
  return cid
}

export function getSession(): { sid: string; sc: number; isNew: boolean } {
  const now = Date.now()
  const lastActivity = Number(localStorage.getItem(LAST_KEY) || '0')
  let sid = localStorage.getItem(SID_KEY) || ''
  let sc = Number(localStorage.getItem(SC_KEY) || '0')
  const expired = !sid || (now - lastActivity > SESSION_TIMEOUT_MS)

  if (expired) {
    sid = Math.floor(now / 1000).toString()
    sc += 1
    localStorage.setItem(SID_KEY, sid)
    localStorage.setItem(SC_KEY, String(sc))
  }
  localStorage.setItem(LAST_KEY, String(now))
  return { sid, sc, isNew: expired }
}

// ── Anonymous User ID ──────────────────────────────────────────────

export async function hashUserId(uid: string): Promise<string> {
  const data = new TextEncoder().encode(`ksc-analytics:${uid}`)

  // crypto.subtle is only available in secure contexts (HTTPS / localhost).
  // Fall back to a simple FNV-1a-style hash so analytics still works over HTTP.
  // Guard both `crypto` and `crypto.subtle` — some browsers (Safari on HTTP)
  // have `crypto` but `subtle` is undefined; others lack `crypto` entirely.
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    const FNV_OFFSET_BASIS = 0x811c9dc5
    const FNV_PRIME = 0x01000193
    let h = FNV_OFFSET_BASIS
    for (const byte of data) {
      h ^= byte
      h = Math.imul(h, FNV_PRIME)
    }
    return (h >>> 0).toString(16).padStart(8, '0')
  }

  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Get or create a persistent anonymous user ID for demo/unauthenticated users.
 * Stored in localStorage so the same browser always gets the same ID.
 * This ensures GA4 receives a unique user_id for every user — mixing
 * identified and anonymous sessions causes GA4 to delete data.
 */
export function getOrCreateAnonymousId(): string {
  let anonId = localStorage.getItem(STORAGE_KEY_ANONYMOUS_USER_ID)
  if (!anonId) {
    anonId = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY_ANONYMOUS_USER_ID, anonId)
  }
  return anonId
}

// ── Engagement Time Tracking ──────────────────────────────────────
// GA4 requires the `_et` parameter (engagement time in milliseconds)
// to calculate Average Engagement Time. Without it, GA4 reports 0s.
// We track active user time via visibility + interaction signals.

/** How often to sample engagement state */
const ENGAGEMENT_HEARTBEAT_MS = 5_000
/** Consider user idle after 60s of no interaction */
const ENGAGEMENT_IDLE_MS = 60_000

let engagementStartMs = 0          // Timestamp when current active period began
let accumulatedEngagementMs = 0    // Total accumulated engagement time for current page
// Cumulative engagement across the whole session (not reset between page_views).
// Used to drive the engaged-session flag so a user who clicks through several
// routes — each with under 10s dwell — still gets counted as engaged once
// their total time crosses the threshold. Reset only on new session.
let sessionEngagementMs = 0
// Count of page_views in the current session. Drives the engaged-session
// flag via GA4's "2+ pageviews" rule so SPA route-nav shows up as
// engaged even if the per-page engagement accumulator is short.
let sessionPageViewCount = 0
let lastInteractionMs = 0          // Timestamp of last user interaction
let isUserActive = false           // Whether user is currently considered active
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

/** Mark the user as actively engaged */
export function markActive() {
  const now = Date.now()
  lastInteractionMs = now
  if (!isUserActive) {
    isUserActive = true
    engagementStartMs = now
  }
}

/** Check if user has gone idle and accumulate engagement time */
function checkEngagement() {
  if (!isUserActive) return
  const now = Date.now()
  if (now - lastInteractionMs > ENGAGEMENT_IDLE_MS) {
    // User went idle — accumulate time up to last interaction
    const delta = lastInteractionMs - engagementStartMs
    accumulatedEngagementMs += delta
    sessionEngagementMs += delta
    isUserActive = false
  }
}

/** Get total engagement time in ms without resetting (peek) */
export function peekEngagementMs(): number {
  let total = accumulatedEngagementMs
  if (isUserActive) {
    total += Date.now() - engagementStartMs
  }
  return total
}

/** Session-wide engagement total including any currently-active time.
 *
 *  Includes `accumulatedEngagementMs` because the visibilitychange handler
 *  folds active time into `accumulatedEngagementMs` without updating
 *  `sessionEngagementMs`. Without this, peek reads after a tab-hidden flush
 *  are stale until the next user_engagement send() folds accumulated back
 *  into the session counter. No double-count risk: when
 *  `getAndResetEngagementMs` later drains `accumulatedEngagementMs` into
 *  `sessionEngagementMs`, accumulated is zeroed — so the sum stays stable. */
export function peekSessionEngagementMs(): number {
  let total = sessionEngagementMs + accumulatedEngagementMs
  if (isUserActive) {
    total += Date.now() - engagementStartMs
  }
  return total
}

/** Get total engagement time in ms and reset the accumulator.
 *  Only called for user_engagement events — GA4 calculates Engaged Sessions
 *  and Average Engagement Time exclusively from _et on user_engagement hits.
 *  Other events get a non-resetting peek so the accumulator isn't drained.
 *
 *  Note: the PER-PAGE accumulator is reset, but the SESSION-wide counter
 *  (sessionEngagementMs) keeps growing so the engaged-session gate can fire
 *  even for users who click through many short-dwell routes. */
export function getAndResetEngagementMs(): number {
  const total = peekEngagementMs()
  // Fold the drained total into the session counter so engaged-session
  // checks see cumulative time, not just the current page's time.
  sessionEngagementMs += total
  accumulatedEngagementMs = 0
  if (isUserActive) {
    engagementStartMs = Date.now()
  }
  return total
}

/** Reset all session-scoped engagement state (called on new session) */
export function resetSessionEngagement() {
  sessionEngagementMs = 0
  sessionPageViewCount = 0
  accumulatedEngagementMs = 0
  engagementStartMs = 0
  lastInteractionMs = 0
  isUserActive = false
}

/** Increment the page view counter */
export function incrementSessionPageViewCount() {
  sessionPageViewCount += 1
}

/** Get the current session page view count */
export function getSessionPageViewCount(): number {
  return sessionPageViewCount
}

/** Stored reference to the visibility handler so it can be removed on stop */
let visibilityHandler: (() => void) | null = null

/** Interaction events tracked for engagement */
const INTERACTION_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const

/** Start tracking user engagement via interaction and visibility signals */
export function startEngagementTracking(onFlush: () => void) {
  for (const event of INTERACTION_EVENTS) {
    document.addEventListener(event, markActive, { passive: true })
  }

  // Track page visibility — pause engagement when tab is hidden
  visibilityHandler = () => {
    if (document.visibilityState === 'hidden') {
      if (isUserActive) {
        accumulatedEngagementMs += Date.now() - engagementStartMs
        isUserActive = false
      }
      onFlush() // Flush engagement to GA4 before tab goes away
    } else {
      markActive()
    }
  }
  document.addEventListener('visibilitychange', visibilityHandler)

  // Start heartbeat to detect idle
  heartbeatTimer = setInterval(checkEngagement, ENGAGEMENT_HEARTBEAT_MS)

  // Initial mark — user is active when page loads
  markActive()
}

/** Stop engagement tracking (called on opt-out) */
export function stopEngagementTracking() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  for (const event of INTERACTION_EVENTS) {
    document.removeEventListener(event, markActive)
  }
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler)
    visibilityHandler = null
  }
}

// ── UTM Tracking ───────────────────────────────────────────────────

/** Maximum length for UTM parameter values to avoid oversized beacon URLs */
const UTM_PARAM_MAX_LEN = 100

let utmParams: UtmParams = {}

export function getUtmParams(): UtmParams {
  return { ...utmParams }
}

/**
 * Internal: populate utmParams from URL search params or sessionStorage.
 * Returns captured params so the caller (analytics-core) can fire the event.
 * Only used by analytics-core.ts — prefer captureUtmParams() from analytics.ts.
 */
export function _loadUtmParams(): UtmParams | null {
  utmParams = {}
  const params = new URLSearchParams(window.location.search)
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
  for (const key of utmKeys) {
    const val = params.get(key)
    if (val) utmParams[key as keyof UtmParams] = val.slice(0, UTM_PARAM_MAX_LEN)
  }
  if (Object.keys(utmParams).length > 0) {
    sessionStorage.setItem('_ksc_utm', JSON.stringify(utmParams))
    return { ...utmParams }
  }
  const stored = sessionStorage.getItem('_ksc_utm')
  if (stored) {
    try { utmParams = JSON.parse(stored) as UtmParams } catch { /* ignore */ }
  }
  return null
}
