/**
 * Anonymous Product Feedback — Lightweight Event Emitter
 *
 * Dual-path event delivery for maximum coverage:
 *   1. PRIMARY: gtag.js loaded via first-party proxy (/api/gtag) — events
 *      go directly from browser to GA4, appearing in Realtime reports.
 *   2. FALLBACK: Custom proxy path /api/m with base64-encoded payloads —
 *      used when ad blockers prevent gtag.js from loading. Events appear
 *      in standard GA4 reports but NOT in Realtime.
 *
 * The first-party proxy serves gtag.js from the console's own domain,
 * bypassing domain-based ad blockers. Content-based blockers may still
 * block it, in which case the custom proxy fallback kicks in.
 */

import { STORAGE_KEY_ANALYTICS_OPT_OUT, STORAGE_KEY_ANONYMOUS_USER_ID } from './constants'
import { CHUNK_RELOAD_TS_KEY, isChunkLoadMessage } from './chunkErrors'
import { isDemoMode, isNetlifyDeployment } from './demoMode'

// DECOY Measurement ID — the proxy rewrites this to the real ID server-side.
const GA_MEASUREMENT_ID = 'G-0000000000'

const PROXY_PATH = '/api/m'
const GTAG_SCRIPT_PATH = '/api/gtag'

// ── Umami Integration ─────────────────────────────────────────────
// Umami runs in parallel with GA4 for a 2-week validation period.
// Events flow to both platforms via the send() function.
// Umami auto-tracks pageviews; custom events use umami.track().

/** First-party proxy path for the Umami tracking script — bypasses ad blockers */
const UMAMI_SCRIPT_PATH = '/api/ksc'
/** Umami website ID — configurable via branding; defaults to KubeStellar's ID */
let umamiWebsiteId = '07111027-162f-4e37-a0bb-067b9d08b88a'

/** Load Umami tracking script via first-party proxy (async, non-blocking).
 *  data-host-url tells Umami to POST events to our own origin (which proxies
 *  to analytics.kubestellar.io/api/send) instead of the script's source domain. */
function loadUmamiScript() {
  const script = document.createElement('script')
  script.src = UMAMI_SCRIPT_PATH
  script.defer = true
  script.dataset.websiteId = umamiWebsiteId
  // Umami appends /api/send internally — set host to our origin so events
  // go through the first-party proxy at /api/send → analytics.kubestellar.io
  script.dataset.hostUrl = window.location.origin
  document.head.appendChild(script)
}

/** Send event to Umami (fire-and-forget, never blocks GA4) */
function sendToUmami(eventName: string, params?: Record<string, string | number | boolean>) {
  try {
    if (window.umami?.track) {
      window.umami.track(eventName, params)
    }
  } catch {
    // Umami failures must never affect GA4 tracking
  }
}

// ── gtag.js Integration ─────────────────────────────────────────────
// gtag.js sends events directly from browser → GA4, which is required
// for GA4 Realtime reports. The custom proxy approach (server → GA4)
// only populates standard reports with a 24-48h delay.

let gtagAvailable = false
let gtagDecided = false  // true once we know whether gtag.js loaded or was blocked
let realMeasurementId = ''

// Events queued while waiting for gtag.js load verdict.
// Without queuing, events fire via the proxy (with our custom client ID) AND
// gtag.js creates its own _ga cookie client ID — GA4 sees two separate users,
// inflating active user counts.
let pendingEvents: Array<{ name: string; params?: Record<string, string | number | boolean> }> = []

// Maximum time to wait for gtag.js before falling back to proxy
const GTAG_LOAD_TIMEOUT_MS = 5_000
// Delay after script.onload to verify gtag.js actually initialized
const GTAG_INIT_CHECK_MS = 100

// Extend window for gtag + Umami globals
declare global {
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
    google_tag_manager: unknown // Defined by gtag.js when it initializes
    umami?: {
      track: (eventName: string, data?: Record<string, string | number | boolean>) => void
    }
  }
}
const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 min
const CID_KEY = '_ksc_cid'
const SID_KEY = '_ksc_sid'
const SC_KEY = '_ksc_sc'
const LAST_KEY = '_ksc_last'

// ── Bot / Headless Detection ────────────────────────────────────────
// Automated installs (CI pipelines, cloud VMs running curl|bash) start
// the console but never interact with it. Without filtering, these
// generate tens of thousands of fake "users" from data center IPs.
// We gate analytics on real user interaction to exclude them.

/** Returns true if the environment looks automated/headless */
function isAutomatedEnvironment(): boolean {
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

/** Whether a real user interaction has been detected */
let userHasInteracted = false
/** Whether analytics scripts have been loaded (only after interaction) */
let analyticsScriptsLoaded = false

/**
 * Pending chunk-reload recovery event captured at startup (before user
 * interaction). send() gates on userHasInteracted, so we defer the emit
 * until onFirstInteraction() to ensure the event reaches GA4.
 *
 * Recovery events are intentionally scoped to interactive sessions: if the
 * user never interacts after a chunk-reload recovery the session wasn't
 * meaningful and we'd rather not inflate the tracked recovery count with
 * bot/automated load traffic.
 */
let pendingRecoveryEvent: { latencyMs: number; page: string } | null = null

/**
 * Called on first user interaction (click, scroll, keypress, touch).
 * Loads analytics scripts and flushes the initial page_view / conversion events.
 */
function onFirstInteraction() {
  if (userHasInteracted) return
  userHasInteracted = true

  // Remove interaction listeners — they're no longer needed
  for (const evt of INTERACTION_GATE_EVENTS) {
    document.removeEventListener(evt, onFirstInteraction)
  }

  // Emit deferred chunk-reload recovery event captured at startup.
  // Must happen after userHasInteracted = true so send() doesn't drop it.
  if (pendingRecoveryEvent) {
    const { latencyMs, page } = pendingRecoveryEvent
    pendingRecoveryEvent = null
    send('ksc_chunk_reload_recovery', {
      recovery_result: 'success',
      recovery_latency_ms: latencyMs,
      recovery_page: page,
    })
  }

  if (!analyticsScriptsLoaded) {
    analyticsScriptsLoaded = true
    // NOW load gtag.js and Umami — only after a real human interacted
    if (gtagMeasurementId) loadGtagScript()
    if (umamiWebsiteId) loadUmamiScript()
    startEngagementTracking()

    // Fire the events that would have fired at page load
    const deploymentType = getDeploymentType()
    emitConversionStep(1, 'discovery', { deployment_type: deploymentType })
    emitPageView(window.location.pathname)
  }
}

const INTERACTION_GATE_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const

// ── Engagement Time Tracking ──────────────────────────────────────
// GA4 requires the `_et` parameter (engagement time in milliseconds)
// to calculate Average Engagement Time. Without it, GA4 reports 0s.
// We track active user time via visibility + interaction signals.

const ENGAGEMENT_HEARTBEAT_MS = 5_000  // How often to sample engagement state
const ENGAGEMENT_IDLE_MS = 60_000      // Consider user idle after 60s of no interaction

let engagementStartMs = 0          // Timestamp when current active period began
let accumulatedEngagementMs = 0    // Total accumulated engagement time for current page
let lastInteractionMs = 0          // Timestamp of last user interaction
let isUserActive = false           // Whether user is currently considered active
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

/** Mark the user as actively engaged */
function markActive() {
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
    accumulatedEngagementMs += lastInteractionMs - engagementStartMs
    isUserActive = false
  }
}

/** Get total engagement time in ms without resetting (peek) */
function peekEngagementMs(): number {
  let total = accumulatedEngagementMs
  if (isUserActive) {
    total += Date.now() - engagementStartMs
  }
  return total
}

/** Get total engagement time in ms and reset the accumulator.
 *  Only called for user_engagement events — GA4 calculates Engaged Sessions
 *  and Average Engagement Time exclusively from _et on user_engagement hits.
 *  Other events get a non-resetting peek so the accumulator isn't drained. */
function getAndResetEngagementMs(): number {
  const total = peekEngagementMs()
  accumulatedEngagementMs = 0
  if (isUserActive) {
    engagementStartMs = Date.now()
  }
  return total
}

/** Start tracking user engagement via interaction and visibility signals */
function startEngagementTracking() {
  const interactionEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const
  for (const event of interactionEvents) {
    document.addEventListener(event, markActive, { passive: true })
  }

  // Track page visibility — pause engagement when tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (isUserActive) {
        accumulatedEngagementMs += Date.now() - engagementStartMs
        isUserActive = false
      }
      emitUserEngagement() // Flush engagement to GA4 before tab goes away
    } else {
      markActive()
    }
  })

  // Start heartbeat to detect idle
  heartbeatTimer = setInterval(checkEngagement, ENGAGEMENT_HEARTBEAT_MS)

  // Initial mark — user is active when page loads
  markActive()
}

/** Stop engagement tracking (called on opt-out) */
function stopEngagementTracking() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

/**
 * Emit a user_engagement event to GA4 with accumulated engagement time.
 * GA4 calculates Average Engagement Time exclusively from this event type —
 * the _et parameter on other events (page_view, custom events) is ignored
 * for engagement metrics.
 *
 * send() calls getAndResetEngagementMs() only for user_engagement events,
 * ensuring the full accumulated engagement time is attributed here.
 */
function emitUserEngagement() {
  if (peekEngagementMs() > 0) {
    send('user_engagement', {})
  }
}

// ── Types ──────────────────────────────────────────────────────────

type DeploymentType =
  | 'localhost'
  | 'containerized'
  | 'console.kubestellar.io'
  | 'netlify-preview'
  | 'unknown'

// ── Helpers ────────────────────────────────────────────────────────

function isOptedOut(): boolean {
  return localStorage.getItem(STORAGE_KEY_ANALYTICS_OPT_OUT) === 'true'
}

function getDeploymentType(): DeploymentType {
  const h = window.location.hostname
  if (h === 'console.kubestellar.io') return 'console.kubestellar.io'
  if (h.includes('netlify.app')) return 'netlify-preview'
  if (h === 'localhost' || h === '127.0.0.1') return 'localhost'
  return 'containerized'
}

function rand(): string {
  return Math.floor(Math.random() * 2147483647).toString()
}

// ── Client & Session Management ────────────────────────────────────

function getClientId(): string {
  let cid = localStorage.getItem(CID_KEY)
  if (!cid) {
    cid = `${rand()}.${Math.floor(Date.now() / 1000)}`
    localStorage.setItem(CID_KEY, cid)
  }
  return cid
}

function getSession(): { sid: string; sc: number; isNew: boolean } {
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

// ── Core Send ──────────────────────────────────────────────────────

let measurementId = ''
let pageId = ''
let userProperties: Record<string, string> = {}
let userId = ''
let initialized = false

// GA4 considers a session "engaged" after 10 seconds of active use.
// Once set, it stays true for the rest of the session.
const ENGAGED_SESSION_THRESHOLD_MS = 10_000
let sessionEngaged = false

/**
 * sendViaGtag sends an event through gtag.js (direct browser → GA4).
 * This path appears in GA4 Realtime reports because GA4 sees a real
 * browser session, not a server-side proxy request.
 */
function sendViaGtag(
  eventName: string,
  params?: Record<string, string | number | boolean>,
) {
  if (!window.gtag) return

  // Build gtag event parameters — gtag.js handles session management,
  // client ID, engagement time, etc. automatically. We only need to
  // pass event-specific params and user properties.
  const gtagParams: Record<string, string | number | boolean> = {
    ...(params || {}),
  }

  // Include engagement time for user_engagement events
  if (eventName === 'user_engagement') {
    const engagementMs = getAndResetEngagementMs()
    if (engagementMs > 0) {
      gtagParams.engagement_time_msec = engagementMs
    }
  } else {
    const engagementMs = peekEngagementMs()
    if (engagementMs > 0) {
      gtagParams.engagement_time_msec = engagementMs
    }
  }

  // Pass user ID if set
  if (userId) {
    gtagParams.user_id = userId
  }

  window.gtag('event', eventName, gtagParams)
}

/**
 * sendViaProxy sends an event through the custom first-party proxy
 * (/api/m). This fallback is used when gtag.js is blocked by ad blockers.
 * Events appear in standard GA4 reports but NOT in Realtime.
 */
function sendViaProxy(
  eventName: string,
  params?: Record<string, string | number | boolean>,
) {
  const { sid, sc, isNew } = getSession()

  const p = new URLSearchParams()
  p.set('v', '2')
  p.set('tid', measurementId)
  p.set('cid', getClientId())
  p.set('sid', sid)
  p.set('_p', pageId)
  p.set('en', eventName)
  p.set('_s', String(sc))
  p.set('dl', window.location.href)
  p.set('dt', document.title)
  p.set('ul', navigator.language)
  p.set('sr', `${screen.width}x${screen.height}`)

  if (isNew) {
    p.set('_ss', '1')
    p.set('_nsi', '1')
    sessionEngaged = false
  }
  if (sc === 1 && isNew) {
    p.set('_fv', '1')
  }

  if (!sessionEngaged && peekEngagementMs() >= ENGAGED_SESSION_THRESHOLD_MS) {
    sessionEngaged = true
  }
  if (sessionEngaged) {
    p.set('seg', '1')
  }

  if (eventName === 'user_engagement') {
    const engagementMs = getAndResetEngagementMs()
    if (engagementMs > 0) {
      p.set('_et', String(engagementMs))
    }
  } else {
    const engagementMs = peekEngagementMs()
    if (engagementMs > 0) {
      p.set('_et', String(engagementMs))
    }
  }

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'number') {
        p.set(`epn.${k}`, String(v))
      } else {
        p.set(`ep.${k}`, String(v))
      }
    }
  }

  for (const [k, v] of Object.entries(userProperties)) {
    p.set(`up.${k}`, v)
  }

  if (userId) {
    p.set('uid', userId)
  }

  if (utmParams.utm_source) p.set('cs', utmParams.utm_source)
  if (utmParams.utm_medium) p.set('cm', utmParams.utm_medium)
  if (utmParams.utm_campaign) p.set('cn', utmParams.utm_campaign)
  if (utmParams.utm_term) p.set('ck', utmParams.utm_term)
  if (utmParams.utm_content) p.set('cc', utmParams.utm_content)

  const encoded = btoa(p.toString())
  const url = `${PROXY_PATH}?d=${encodeURIComponent(encoded)}`

  if (navigator.sendBeacon) {
    navigator.sendBeacon(url)
  } else {
    fetch(url, { method: 'POST', keepalive: true }).catch(() => {})
  }
}

/**
 * Flush all queued events once we know whether gtag.js is available.
 * Called exactly once when gtagDecided transitions to true.
 */
function flushPendingEvents() {
  const queue = pendingEvents
  pendingEvents = []
  for (const evt of queue) {
    if (gtagAvailable) {
      sendViaGtag(evt.name, evt.params)
    } else {
      sendViaProxy(evt.name, evt.params)
    }
  }
}

/**
 * Mark gtag.js availability and flush any queued events.
 * Idempotent — only the first call takes effect.
 */
function markGtagDecided(available: boolean) {
  if (gtagDecided) return
  gtagAvailable = available
  gtagDecided = true
  flushPendingEvents()
}

function send(
  eventName: string,
  params?: Record<string, string | number | boolean>,
) {
  if (!initialized || isOptedOut()) return

  // Don't send any events until a real user has interacted.
  // This prevents automated/headless page loads from generating traffic.
  if (!userHasInteracted) return

  // Umami: send every event immediately (no queuing needed — Umami has its
  // own session management and doesn't conflict with GA4 client IDs)
  sendToUmami(eventName, params)

  // While waiting for gtag.js to load, queue events instead of sending
  // via the proxy. This prevents GA4 from seeing two different client IDs
  // (our _ksc_cid via proxy vs gtag's _ga cookie) for the same user.
  if (!gtagDecided) {
    pendingEvents.push({ name: eventName, params })
    return
  }

  // Primary path: gtag.js (appears in GA4 Realtime)
  if (gtagAvailable) {
    sendViaGtag(eventName, params)
    return
  }

  // Fallback: custom proxy (standard reports only, no Realtime)
  sendViaProxy(eventName, params)
}

// ── Initialization ─────────────────────────────────────────────────

// Public GA4 measurement ID — configurable via branding config.
// Defaults to KubeStellar's ID; overridden by initAnalytics().
let gtagMeasurementId = 'G-PXWNVQ8D1T'

// Google Tag Manager CDN — used when first-party proxy is unavailable (Netlify)
const GTAG_CDN_URL = 'https://www.googletagmanager.com/gtag/js'

/**
 * loadGtagScript loads gtag.js so events go directly from the browser to GA4.
 * This is required for GA4 Realtime — the custom proxy only populates standard
 * reports because GA4 can't see a real browser session through a server proxy.
 *
 * Loading order:
 *   1. Try first-party proxy (/api/gtag) — works with Go backend, bypasses
 *      domain-based ad blockers since it's same-origin.
 *   2. Fall back to Google CDN — works on Netlify (CSP allows it).
 *   3. If both fail (aggressive ad blocker) — custom proxy handles events.
 */
function loadGtagScript() {
  const mid = gtagMeasurementId
  realMeasurementId = mid

  // Initialize dataLayer and gtag function before script loads
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments)
  }
  window.gtag('js', new Date())

  // Pass our custom client_id so gtag.js uses the SAME identity as
  // our proxy fallback. Without this, gtag creates its own _ga cookie
  // client ID — GA4 sees two different users for the same person,
  // inflating active user counts.
  window.gtag('config', mid, {
    send_page_view: false, // We control page_view timing
    cookie_domain: 'auto',
    client_id: getClientId(),
  })

  // Set user properties explicitly via gtag('set') — more reliable than
  // passing them in the config call. This ensures deployment_type and
  // other user-scoped dimensions appear correctly in Realtime reports.
  window.gtag('set', 'user_properties', { ...userProperties })

  // Timeout: if gtag.js hasn't loaded in GTAG_LOAD_TIMEOUT_MS, fall back to proxy
  setTimeout(() => markGtagDecided(false), GTAG_LOAD_TIMEOUT_MS)

  // Helper: verify gtag.js actually initialized (not just HTTP 200 with wrong content).
  // On Netlify, /api/gtag returns HTML (SPA fallback) with HTTP 200 — the browser
  // fires onload but MIME-type checking prevents execution. We detect this by
  // checking for google_tag_manager, which real gtag.js always defines.
  const isGtagInitialized = () => typeof window.google_tag_manager !== 'undefined'

  // Helper: load gtag.js from Google CDN (used as fallback)
  const loadCdnFallback = () => {
    const cdnScript = document.createElement('script')
    cdnScript.async = true
    cdnScript.src = `${GTAG_CDN_URL}?id=${mid}`
    cdnScript.onload = () => {
      // Small delay to let gtag.js initialize before checking
      setTimeout(() => markGtagDecided(isGtagInitialized()), GTAG_INIT_CHECK_MS)
    }
    cdnScript.onerror = () => { markGtagDecided(false) } // Ad blocker blocked CDN too
    document.head.appendChild(cdnScript)
  }

  // Try first-party proxy first (Go backend serves gtag.js from same origin)
  const script = document.createElement('script')
  script.async = true
  script.src = `${GTAG_SCRIPT_PATH}?id=${mid}`
  script.onload = () => {
    // Verify the script actually initialized gtag.js — not just HTTP 200 with HTML.
    // On Netlify the SPA catch-all returns index.html for /api/gtag, which loads
    // (HTTP 200) but gets blocked by strict MIME type checking (nosniff).
    setTimeout(() => {
      if (isGtagInitialized()) {
        markGtagDecided(true)
      } else {
        loadCdnFallback()
      }
    }, GTAG_INIT_CHECK_MS)
  }
  script.onerror = () => {
    // First-party proxy returned non-200 — try Google CDN
    loadCdnFallback()
  }
  document.head.appendChild(script)
}

/**
 * Update analytics measurement IDs from branding config (white-label support).
 * Called by BrandingProvider after /health response arrives. Only non-empty
 * values override the hardcoded defaults — empty string means "use default",
 * not "disable". To disable analytics entirely, the interaction gate and
 * automated-environment checks handle that.
 */
export function updateAnalyticsIds(ids: {
  ga4MeasurementId?: string
  umamiWebsiteId?: string
}) {
  if (ids.ga4MeasurementId) {
    gtagMeasurementId = ids.ga4MeasurementId
  }
  if (ids.umamiWebsiteId) {
    umamiWebsiteId = ids.umamiWebsiteId
  }
}

export function initAnalytics() {
  measurementId = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || GA_MEASUREMENT_ID
  if (!measurementId || initialized) return

  // Skip analytics entirely in automated/headless environments.
  // This filters CI pipelines, cloud VMs, Puppeteer, etc.
  if (isAutomatedEnvironment()) return

  initialized = true
  pageId = rand()

  // Set persistent user properties including timezone for geo identification
  const deploymentType = getDeploymentType()
  let tz = ''
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { /* ignore */ }
  userProperties = {
    deployment_type: deploymentType,
    demo_mode: String(isDemoMode()),
    ...(tz && { timezone: tz }),
  }

  // Flush engagement on page close (Safari doesn't always fire visibilitychange)
  window.addEventListener('beforeunload', emitUserEngagement)

  // Track unhandled errors globally for error categorization
  startGlobalErrorTracking()

  // Capture UTM parameters from landing URL
  captureUtmParams()

  // Gate analytics script loading on real user interaction.
  // Automated installs load the page but never click/scroll/type — this
  // single check eliminates ~25,000 bot "users" per day from data centers.
  for (const evt of INTERACTION_GATE_EVENTS) {
    document.addEventListener(evt, onFirstInteraction, { once: true, passive: true })
  }
}

// ── Anonymous User ID ──────────────────────────────────────────────

async function hashUserId(uid: string): Promise<string> {
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
function getOrCreateAnonymousId(): string {
  let anonId = localStorage.getItem(STORAGE_KEY_ANONYMOUS_USER_ID)
  if (!anonId) {
    anonId = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY_ANONYMOUS_USER_ID, anonId)
  }
  return anonId
}

export async function setAnalyticsUserId(uid: string) {
  // For demo/anonymous users, assign a persistent random ID so GA4 sees
  // consistent user_id on every session. Without this, GA4's mixed
  // identified/anonymous user model triggers data deletion.
  const effectiveUid = (!uid || uid === 'demo-user')
    ? getOrCreateAnonymousId()
    : uid
  userId = await hashUserId(effectiveUid)
  // Propagate to gtag if available
  if (gtagAvailable && window.gtag && realMeasurementId) {
    window.gtag('config', realMeasurementId, { user_id: userId })
  }
}

export function setAnalyticsUserProperties(props: Record<string, string>) {
  userProperties = { ...userProperties, ...props }
  // Propagate to gtag — use 'set' for reliable user property delivery
  if (gtagAvailable && window.gtag) {
    window.gtag('set', 'user_properties', props)
  }
}

// ── Opt-out management ─────────────────────────────────────────────

export function setAnalyticsOptOut(optOut: boolean) {
  // Fire the event BEFORE setting the flag — send() checks isOptedOut()
  // and would drop the event if the flag were already set.
  if (optOut) {
    send('ksc_analytics_opted_out', {})
  } else {
    send('ksc_analytics_opted_in', {})
  }
  localStorage.setItem(STORAGE_KEY_ANALYTICS_OPT_OUT, String(optOut))
  window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
  if (optOut) {
    stopEngagementTracking()
    document.cookie.split(';').forEach(c => {
      const name = c.split('=')[0].trim()
      if (name.startsWith('_ga') || name.startsWith('_ksc')) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
      }
    })
    localStorage.removeItem(CID_KEY)
    localStorage.removeItem(SID_KEY)
    localStorage.removeItem(SC_KEY)
    localStorage.removeItem(LAST_KEY)
  }
}

export function isAnalyticsOptedOut(): boolean {
  return isOptedOut()
}

// ── Page views ─────────────────────────────────────────────────────

export function emitPageView(path: string) {
  emitUserEngagement() // Flush previous page's engagement time before new page_view
  pageId = rand()      // New page ID for the new page
  send('page_view', { page_path: path, ksc_demo_mode: isDemoMode() ? 'true' : 'false' })
}

// ── Dashboard & Cards ──────────────────────────────────────────────

export function emitCardAdded(cardType: string, source: string) {
  send('ksc_card_added', { card_type: cardType, source })
}

export function emitCardRemoved(cardType: string) {
  send('ksc_card_removed', { card_type: cardType })
}

export function emitCardExpanded(cardType: string) {
  send('ksc_card_expanded', { card_type: cardType })
}

export function emitCardDragged(cardType: string) {
  send('ksc_card_dragged', { card_type: cardType })
}

export function emitCardConfigured(cardType: string) {
  send('ksc_card_configured', { card_type: cardType })
}

export function emitCardReplaced(oldType: string, newType: string) {
  send('ksc_card_replaced', { old_type: oldType, new_type: newType })
}

// ── Global Search (Cmd+K) ─────────────────────────────────────────────

/** Fired when user opens the global search dialog (Cmd+K, Ctrl+K, or click) */
export function emitGlobalSearchOpened(method: 'keyboard' | 'click') {
  send('ksc_global_search_opened', { method })
}

/** Fired when user executes a search query (debounced — fires once per search session on blur) */
export function emitGlobalSearchQueried(queryLength: number, resultCount: number) {
  send('ksc_global_search_queried', { query_length: queryLength, result_count: resultCount })
}

/** Fired when user selects a result from global search */
export function emitGlobalSearchSelected(category: string, resultIndex: number) {
  send('ksc_global_search_selected', { category, result_index: resultIndex })
}

/** Fired when user chooses "Ask AI" from global search */
export function emitGlobalSearchAskAI(queryLength: number) {
  send('ksc_global_search_ask_ai', { query_length: queryLength })
}

// ── Card Interactions (framework-level) ──────────────────────────────
// These fire automatically from shared UI components (CardControls,
// CardSearchInput, CardClusterFilter) so all cards get consistent
// tracking without per-card instrumentation.

/** Fired when user changes sort field in a card's controls */
export function emitCardSortChanged(sortField: string, cardType: string) {
  send('ksc_card_sort_changed', { sort_field: sortField, card_type: cardType, page_path: window.location.pathname })
}

/** Fired when user toggles sort direction in a card's controls */
export function emitCardSortDirectionChanged(direction: string, cardType: string) {
  send('ksc_card_sort_direction_changed', { direction, card_type: cardType, page_path: window.location.pathname })
}

/** Fired when user changes the item limit in a card's controls */
export function emitCardLimitChanged(limit: string, cardType: string) {
  send('ksc_card_limit_changed', { limit, card_type: cardType, page_path: window.location.pathname })
}

/** Fired when user types in a card's search input (debounced — fires once per search session) */
export function emitCardSearchUsed(queryLength: number, cardType: string) {
  send('ksc_card_search_used', { query_length: queryLength, card_type: cardType, page_path: window.location.pathname })
}

/** Fired when user changes cluster filter selection in a card */
export function emitCardClusterFilterChanged(selectedCount: number, totalCount: number, cardType: string) {
  send('ksc_card_cluster_filter_changed', {
    selected_count: selectedCount,
    total_count: totalCount,
    card_type: cardType,
    page_path: window.location.pathname,
  })
}

/** Fired when user navigates pages via pagination controls */
export function emitCardPaginationUsed(page: number, totalPages: number, cardType: string) {
  send('ksc_card_pagination_used', { page, total_pages: totalPages, card_type: cardType, page_path: window.location.pathname })
}

/** Fired when user clicks a list item row in a card */
export function emitCardListItemClicked(cardType: string) {
  send('ksc_card_list_item_clicked', { card_type: cardType, page_path: window.location.pathname })
}

// ── AI Missions ────────────────────────────────────────────────────

export function emitMissionStarted(missionType: string, agentProvider: string) {
  send('ksc_mission_started', { mission_type: missionType, agent_provider: agentProvider })
}

export function emitMissionCompleted(missionType: string, durationSec: number) {
  send('ksc_mission_completed', { mission_type: missionType, duration_sec: durationSec })
}

export function emitMissionError(missionType: string, errorCode: string) {
  send('ksc_mission_error', { mission_type: missionType, error_code: errorCode })
}

export function emitMissionRated(missionType: string, rating: string) {
  send('ksc_mission_rated', { mission_type: missionType, rating })
}

// ── Mission Browser / Knowledge Base ──────────────────────────────

export function emitFixerSearchStarted(clusterConnected: boolean) {
  send('ksc_fixer_search', { cluster_connected: clusterConnected })
}

export function emitFixerSearchCompleted(found: number, scanned: number) {
  send('ksc_fixer_search_done', { found, scanned })
}

export function emitFixerBrowsed(path: string) {
  send('ksc_fixer_browsed', { path })
}

export function emitFixerViewed(title: string, cncfProject?: string) {
  send('ksc_fixer_viewed', { title, cncf_project: cncfProject ?? '' })
}

export function emitFixerImported(title: string, cncfProject?: string) {
  send('ksc_fixer_imported', { title, cncf_project: cncfProject ?? '' })
}

export function emitFixerImportError(title: string, errorCount: number, firstError: string) {
  send('ksc_fixer_import_error', {
    title,
    error_count: String(errorCount),
    first_error: firstError.slice(0, 100),
  })
}

export function emitFixerLinkCopied(title: string, cncfProject?: string) {
  send('ksc_fixer_link_copied', { title, cncf_project: cncfProject ?? '' })
}

export function emitFixerGitHubLink() {
  send('ksc_fixer_github_link')
}

// ── Auth ───────────────────────────────────────────────────────────

export function emitLogin(method: string) {
  send('login', { method })
}

export function emitLogout() {
  send('ksc_logout')
}

// ── Feedback ───────────────────────────────────────────────────────

export function emitFeedbackSubmitted(type: string) {
  send('ksc_feedback_submitted', { feedback_type: type })
}

export function emitScreenshotAttached(method: 'paste' | 'drop' | 'file_picker', count: number) {
  send('ksc_screenshot_attached', { method, count })
}

export function emitScreenshotUploadFailed(error: string, screenshotCount: number) {
  send('ksc_screenshot_upload_failed', { error: error.substring(0, ERROR_DETAIL_MAX_LEN), screenshot_count: screenshotCount })
}

export function emitScreenshotUploadSuccess(screenshotCount: number) {
  send('ksc_screenshot_upload_success', { screenshot_count: screenshotCount })
}

// ── NPS Survey ────────────────────────────────────────────────────

/** Fired when the NPS survey widget becomes visible */
export function emitNPSSurveyShown() {
  send('ksc_nps_survey_shown')
}

/** Fired when user submits an NPS response */
export function emitNPSResponse(score: number, category: string, feedbackLength?: number) {
  send('ksc_nps_response', {
    nps_score: score,
    nps_category: category,
    ...(feedbackLength !== undefined && { nps_feedback_length: feedbackLength }),
  })
}

/** Fired when user dismisses the NPS widget without responding */
export function emitNPSDismissed(dismissCount: number) {
  send('ksc_nps_dismissed', { dismiss_count: dismissCount })
}

// ── Orbit (Recurring Maintenance) ─────────────────────────────────

export function emitOrbitMissionCreated(orbitType: string, cadence: string) {
  send('ksc_orbit_mission_created', { orbit_type: orbitType, cadence })
}

export function emitOrbitMissionRun(orbitType: string, result: string) {
  send('ksc_orbit_mission_run', { orbit_type: orbitType, result })
}

export function emitGroundControlDashboardCreated(cardCount: number) {
  send('ksc_ground_control_dashboard_created', { card_count: cardCount })
}

export function emitGroundControlCardRequestOpened(project: string) {
  send('ksc_ground_control_card_request', { project })
}

// ── Errors ─────────────────────────────────────────────────────────

// Maximum length for error detail strings to avoid oversized payloads
const ERROR_DETAIL_MAX_LEN = 100

/**
 * Dedup set for errors already reported by React error boundaries.
 * When an error is caught by DynamicCardErrorBoundary or AppErrorBoundary,
 * the error message is added here. The global window 'error' and
 * 'unhandledrejection' listeners check this set and skip errors that
 * were already reported — preventing the same error from being counted
 * as both 'card_render' AND 'runtime', or 'uncaught_render' AND 'runtime'.
 * Entries expire after 5 seconds to avoid unbounded growth.
 */
const DEDUP_EXPIRY_MS = 5_000
const recentlyReportedErrors = new Map<string, number>()

/** Mark an error message as already reported by an error boundary */
export function markErrorReported(msg: string) {
  recentlyReportedErrors.set(msg.slice(0, ERROR_DETAIL_MAX_LEN), Date.now())
}

/** Check if an error was already reported by an error boundary */
function wasAlreadyReported(msg: string): boolean {
  const key = msg.slice(0, ERROR_DETAIL_MAX_LEN)
  const ts = recentlyReportedErrors.get(key)
  if (!ts) return false
  if (Date.now() - ts > DEDUP_EXPIRY_MS) {
    recentlyReportedErrors.delete(key)
    return false
  }
  return true
}

export function emitError(category: string, detail: string, cardId?: string) {
  send('ksc_error', {
    error_code: category,
    error_category: category,
    error_detail: detail.slice(0, ERROR_DETAIL_MAX_LEN),
    error_page: window.location.pathname,
    ...(cardId && { card_id: cardId }),
  })
}

/**
 * Check if this page load is a recovery from a chunk-load auto-reload.
 * If CHUNK_RELOAD_TS_KEY exists in sessionStorage, the previous page load
 * hit a stale chunk error and triggered window.location.reload().
 *
 * Called at startup (before user interaction), so we cannot call send()
 * directly — it gates on userHasInteracted and would drop the event.
 * Instead, store the data in pendingRecoveryEvent and flush it in
 * onFirstInteraction() once send() is unblocked.
 */
function checkChunkReloadRecovery() {
  try {
    const reloadTs = sessionStorage.getItem(CHUNK_RELOAD_TS_KEY)
    if (!reloadTs) return

    const reloadTime = parseInt(reloadTs)
    const recoveryMs = Date.now() - reloadTime

    // Clear the marker so we don't re-emit on subsequent navigations
    sessionStorage.removeItem(CHUNK_RELOAD_TS_KEY)

    // Defer until first user interaction so send() isn't blocked by
    // the userHasInteracted gate (onFirstInteraction flushes this).
    pendingRecoveryEvent = {
      latencyMs: recoveryMs,
      page: window.location.pathname,
    }
  } catch {
    // sessionStorage may be unavailable in some contexts
  }
}

// Reload throttle interval — must match ChunkErrorBoundary to prevent loops
/** Global throttle for chunk-error auto-reload — 5s is fast enough for back-to-back deploys */
const GLOBAL_RELOAD_THROTTLE_MS = 5_000

/**
 * If the error message indicates a stale-chunk failure, auto-reload once
 * (same throttle logic as ChunkErrorBoundary). Returns true when the error
 * IS a chunk error so the caller skips emitting a duplicate 'runtime' event.
 */
function tryChunkReloadRecovery(msg: string): boolean {
  if (!isChunkLoadMessage(msg)) return false
  // Only emit chunk_load from the global handler if ChunkErrorBoundary
  // hasn't already reported this same error message (prevents double-counting)
  if (!wasAlreadyReported(msg)) {
    emitError('chunk_load', msg)
  }
  try {
    const lastReload = sessionStorage.getItem(CHUNK_RELOAD_TS_KEY)
    const now = Date.now()
    if (!lastReload || now - parseInt(lastReload) > GLOBAL_RELOAD_THROTTLE_MS) {
      sessionStorage.setItem(CHUNK_RELOAD_TS_KEY, String(now))
      window.location.reload()
      return true
    }
    // Already reloaded recently — recovery failed
    sessionStorage.removeItem(CHUNK_RELOAD_TS_KEY)
    emitChunkReloadRecoveryFailed(msg)
  } catch {
    // sessionStorage unavailable — chunk_load was already emitted above
  }
  // Always return true when the error IS a chunk error — prevents the caller
  // from also emitting a 'runtime' error for the same event (double reporting).
  return true
}

/** Track unhandled promise rejections and runtime errors globally */
export function startGlobalErrorTracking() {
  // Check if we just recovered from a chunk-load auto-reload
  checkChunkReloadRecovery()

  // Re-entrancy guard: if emitError() → send() triggers another error,
  // the global handler must NOT call emitError() again (infinite recursion → max call stack)
  let isEmitting = false

  window.addEventListener('unhandledrejection', (event) => {
    if (isEmitting) return
    isEmitting = true
    try {
      const msg = event.reason?.message || String(event.reason || 'unknown')
      // Skip errors already reported by React error boundaries (prevents double-counting)
      if (wasAlreadyReported(msg)) return
      // Skip clipboard API errors — expected on non-HTTPS and in restricted contexts
      if (msg.includes('writeText') || msg.includes('clipboard') || msg.includes('copy')) return
      // Stale chunks can surface as unhandled rejections from dynamic import()
      if (tryChunkReloadRecovery(msg)) return
      // Skip AbortError / TimeoutError — expected when fetches are cancelled on unmount
      // or when AbortSignal.timeout() fires. Different browsers surface different messages:
      //   Safari:  "Fetch is aborted."  |  Chrome: "The user aborted a request."
      //   Safari timeout: "The operation timed out."  |  Chrome timeout: "signal timed out"
      const errorName: string = (event.reason as { name?: string })?.name ?? ''
      if (errorName === 'AbortError' || errorName === 'TimeoutError') return
      if (
        msg.includes('Fetch is aborted') ||
        msg.includes('The user aborted a request') ||
        msg.includes('signal is aborted') ||
        msg.includes('The operation timed out') ||
        msg.includes('signal timed out') ||
        msg.includes('Load failed')
      ) return
      // Skip WebKit URL-parse errors — "The string did not match the expected pattern."
      // is thrown by new URL() in Safari when the input is invalid. These surface as
      // unhandled rejections when they occur inside async functions; the errors are
      // typically transient (stale cache data, invalid cluster server URLs).
      if (msg.includes('did not match the expected pattern')) return
      // Skip JSON parse / SyntaxError errors from response.json() calls.
      // These occur when the backend temporarily returns HTML (e.g. 502/503 gateway
      // errors, nginx error pages) instead of JSON. The calling code catches them
      // internally; they surface here only because browsers report the rejected
      // Promise before the catch handler runs in some edge cases.
      //   Firefox:  "JSON.parse: unexpected character at line 1 column 1 …"
      //   Chrome:   "… is not valid JSON"
      //   Safari:   "JSON Parse error: Unexpected token <"
      if (
        msg.includes('JSON.parse') ||
        msg.includes('is not valid JSON') ||
        msg.includes('JSON Parse error') ||
        msg.includes('Unexpected token')
      ) return
      // Skip ServiceWorker notification errors — expected when the SW registration
      // becomes inactive (browser idle, SW update). The calling code catches these
      // and falls back to the standard Notification API.
      if (msg.includes('showNotification') || msg.includes('No active registration')) return
      // Skip WebSocket send-before-connect errors — transient race condition in
      // Safari where the WS transitions out of OPEN between readyState check and
      // send(). The kubectlProxy try/catch handles these; they surface here only
      // due to browser microtask ordering.
      if (msg.includes('send was called before connect') || msg.includes('InvalidStateError')) return
      // Skip BackendUnavailableError on Netlify / console.kubestellar.io — expected
      // because the Go backend is not deployed there (demo mode uses MSW).
      if (isNetlifyDeployment && msg.includes('Backend API is currently unavailable')) return
      emitError('unhandled_rejection', msg)
    } finally {
      isEmitting = false
    }
  })

  window.addEventListener('error', (event) => {
    // Skip errors from cross-origin scripts (no useful info)
    if (!event.message || event.message === 'Script error.') return
    if (isEmitting) return
    isEmitting = true
    try {
      // Skip errors already reported by React error boundaries (prevents double-counting)
      if (wasAlreadyReported(event.message)) return
      // Skip clipboard API errors — expected on non-HTTPS and in restricted contexts
      if (event.message.includes('writeText') || event.message.includes('clipboard') || event.message.includes('copy')) return
      // Stale chunks can surface as runtime errors (Safari: "Importing a module script failed")
      if (tryChunkReloadRecovery(event.message)) return
      emitError('runtime', event.message)
    } finally {
      isEmitting = false
    }
  })
}

export function emitSessionExpired() {
  send('ksc_session_expired')
}

/** Emit when auto-reload failed to fix stale chunks (user sees manual reload UI) */
export function emitChunkReloadRecoveryFailed(errorDetail: string) {
  send('ksc_chunk_reload_recovery', {
    recovery_result: 'failed',
    recovery_page: window.location.pathname,
    error_detail: errorDetail.slice(0, ERROR_DETAIL_MAX_LEN),
  })
}

// ── Tour ───────────────────────────────────────────────────────────

export function emitTourStarted() {
  send('ksc_tour_started')
}

export function emitTourCompleted(stepCount: number) {
  send('ksc_tour_completed', { step_count: stepCount })
}

export function emitTourSkipped(atStep: number) {
  send('ksc_tour_skipped', { at_step: atStep })
}

// ── Marketplace ────────────────────────────────────────────────────

export function emitMarketplaceInstall(itemType: string, itemName: string) {
  send('ksc_marketplace_install', { item_type: itemType, item_name: itemName })
}

export function emitMarketplaceRemove(itemType: string) {
  send('ksc_marketplace_remove', { item_type: itemType })
}

/** Fired when a marketplace install attempt fails */
export function emitMarketplaceInstallFailed(itemType: string, itemName: string, error: string) {
  send('ksc_marketplace_install_failed', { item_type: itemType, item_name: itemName, error_detail: error.slice(0, 100) })
}

// ── Theme ─────────────────────────────────────────────────────────

/** Fired when user changes theme via settings dropdown or navbar toggle */
export function emitThemeChanged(themeId: string, source: string) {
  send('ksc_theme_changed', { theme_id: themeId, source })
}

// ── Language ──────────────────────────────────────────────────────

/** Fired when user changes UI language */
export function emitLanguageChanged(langCode: string) {
  send('ksc_language_changed', { language: langCode })
}

// ── AI Settings ───────────────────────────────────────────────────

/** Fired when user changes AI mode (low/medium/high) */
export function emitAIModeChanged(mode: string) {
  send('ksc_ai_mode_changed', { mode })
}

/** Fired when user toggles AI predictions on/off */
export function emitAIPredictionsToggled(enabled: boolean) {
  send('ksc_ai_predictions_toggled', { enabled: String(enabled) })
}

/** Fired when user changes prediction confidence threshold */
export function emitConfidenceThresholdChanged(value: number) {
  send('ksc_confidence_threshold_changed', { threshold: value })
}

/** Fired when user toggles consensus (multi-provider) mode */
export function emitConsensusModeToggled(enabled: boolean) {
  send('ksc_consensus_mode_toggled', { enabled: String(enabled) })
}

// ── GitHub Token ───────────────────────────────────────────────────

export function emitGitHubTokenConfigured() {
  send('ksc_github_token_configured')
}

export function emitGitHubTokenRemoved() {
  send('ksc_github_token_removed')
}

// ── API Provider ───────────────────────────────────────────────────

export function emitApiProviderConnected(provider: string) {
  send('ksc_api_provider_connected', { provider })
}

// ── Demo Mode ──────────────────────────────────────────────────────

export function emitDemoModeToggled(enabled: boolean) {
  send('ksc_demo_mode_toggled', { enabled: String(enabled) })
  userProperties.demo_mode = String(enabled)
}

// ── kc-agent Connection ─────────────────────────────────────────

export function emitAgentConnected(version: string, clusterCount: number) {
  send('ksc_agent_connected', { agent_version: version, cluster_count: clusterCount })
}

export function emitAgentDisconnected() {
  send('ksc_agent_disconnected')
}

/**
 * Emitted when cluster inventory changes. Sends only aggregate counts —
 * NEVER cluster names, IPs, servers, or any identifiable information.
 */
export function emitClusterInventory(counts: {
  total: number
  healthy: number
  unhealthy: number
  unreachable: number
  distributions: Record<string, number>
}) {
  // Flatten distribution counts into safe GA4 params (e.g., dist_eks: 2)
  const distParams: Record<string, string | number> = {}
  for (const [dist, count] of Object.entries(counts.distributions)) {
    distParams[`dist_${dist}`] = count
  }
  send('ksc_cluster_inventory', {
    cluster_count: counts.total,
    healthy_count: counts.healthy,
    unhealthy_count: counts.unhealthy,
    unreachable_count: counts.unreachable,
    ...distParams,
  })
  // Set as user property so GA4 can compute averages across users
  userProperties.cluster_count = String(counts.total)
}

// ── Agent Provider Detection ────────────────────────────────────
// Emitted once per agent connection to track which coding agent CLIs
// and API keys are configured on the user's machine.

/** Capability bitmask values matching Go ProviderCapability constants */
const CAPABILITY_CHAT = 1
const CAPABILITY_TOOL_EXEC = 2

interface ProviderSummary {
  name: string
  displayName: string
  capabilities: number
}

/**
 * Fired when kc-agent connects with the list of available AI providers.
 * Categorizes providers into CLI (tool-exec capable) and API (chat-only)
 * so GA4 reports show which coding agents users have installed.
 */
export function emitAgentProvidersDetected(providers: ProviderSummary[]) {
  if (!providers || providers.length === 0) return

  const cliProviders = (providers || [])
    .filter(p => (p.capabilities & CAPABILITY_TOOL_EXEC) !== 0)
    .map(p => p.name)
  const apiProviders = (providers || [])
    .filter(p => (p.capabilities & CAPABILITY_TOOL_EXEC) === 0 && (p.capabilities & CAPABILITY_CHAT) !== 0)
    .map(p => p.name)

  send('ksc_agent_providers_detected', {
    provider_count: providers.length,
    cli_providers: cliProviders.join(',') || 'none',
    api_providers: apiProviders.join(',') || 'none',
    cli_count: cliProviders.length,
    api_count: apiProviders.length,
  })
}

// ── API Key Configuration ───────────────────────────────────────

export function emitApiKeyConfigured(provider: string) {
  send('ksc_api_key_configured', { provider })
}

export function emitApiKeyRemoved(provider: string) {
  send('ksc_api_key_removed', { provider })
}

// ── Install Command Copied ──────────────────────────────────────
// Unified event for any "copy install command" action across the site.
// Feeds into the adoption funnel: Page View → Login → Command Copied → Agent Connected → …

/** Source labels for install command copy events */
type InstallCopySource =
  | 'setup_quickstart'
  | 'setup_dev_mode'
  | 'setup_k8s_deploy'
  | 'setup_oauth_env'
  | 'setup_oauth_restart'
  | 'agent_install_banner'
  | 'demo_to_local'
  | 'from_lens'
  | 'from_headlamp'
  | 'from_holmesgpt'
  | 'feature_inspektorgadget'
  | 'white_label'

export function emitInstallCommandCopied(source: InstallCopySource, command: string) {
  send('ksc_install_command_copied', { source, command })
}

// ── Conversion Funnel ───────────────────────────────────────────
// Unified step-based funnel event for user journey:
//   1 = discovery     (visited site)
//   2 = login         (authenticated via OAuth or demo)
//   3 = agent         (kc-agent connected)
//   4 = clusters      (real clusters detected)
//   5 = api_key       (AI API key configured)
//   6 = github_token  (GitHub token configured)
//   7 = adopter_cta   (clicked "Join Adopters" to edit ADOPTERS.MD)

export function emitConversionStep(
  step: number,
  stepName: string,
  details?: Record<string, string>,
) {
  send('ksc_conversion_step', {
    step_number: step,
    step_name: stepName,
    ...details,
  })
}

// ── Deploy ─────────────────────────────────────────────────────────

export function emitDeployWorkload(workloadName: string, clusterGroup: string) {
  send('ksc_deploy_workload', { workload_name: workloadName, cluster_group: clusterGroup })
}

export function emitDeployTemplateApplied(templateName: string) {
  send('ksc_deploy_template_applied', { template_name: templateName })
}

// ── Compliance ─────────────────────────────────────────────────────

export function emitComplianceDrillDown(statType: string) {
  send('ksc_compliance_drill_down', { stat_type: statType })
}

export function emitComplianceFilterChanged(filterType: string) {
  send('ksc_compliance_filter_changed', { filter_type: filterType })
}

// ── Benchmarks ─────────────────────────────────────────────────────

export function emitBenchmarkViewed(benchmarkType: string) {
  send('ksc_benchmark_viewed', { benchmark_type: benchmarkType })
}

// ── Cluster Lifecycle ───────────────────────────────────────────────

/** Fired when a user successfully adds a cluster via the Add Cluster dialog */
export function emitClusterCreated(clusterName: string, authType: string) {
  send('ksc_cluster_created', { cluster_name: clusterName, auth_type: authType })
}

// ── GitHub OAuth ────────────────────────────────────────────────────

/** Fired when a user completes GitHub OAuth login (token received) */
export function emitGitHubConnected() {
  send('ksc_github_connected')
}

// ── Cluster Admin ──────────────────────────────────────────────────

export function emitClusterAction(action: string, clusterName: string) {
  send('ksc_cluster_action', { action, cluster_name: clusterName })
}

export function emitClusterStatsDrillDown(statType: string) {
  send('ksc_cluster_stats_drill_down', { stat_type: statType })
}

// ── Widget Tracking ─────────────────────────────────────────────────

/** Fired once when the PWA mini-dashboard mounts (tracks active widget users) */
export function emitWidgetLoaded(mode: 'standalone' | 'browser') {
  send('ksc_widget_loaded', { mode })
}

/** Fired when a user clicks a stat card in the widget to open the full console */
export function emitWidgetNavigation(targetPath: string) {
  send('ksc_widget_navigation', { target_path: targetPath })
}

/** Fired when the PWA install prompt is accepted */
export function emitWidgetInstalled(method: 'pwa-prompt' | 'safari-dock') {
  send('ksc_widget_installed', { method })
}

/** Fired when the Übersicht widget JSX file is downloaded from settings */
export function emitWidgetDownloaded(widgetType: 'uebersicht' | 'browser') {
  send('ksc_widget_downloaded', { widget_type: widgetType })
}

// ── Engagement Nudges ────────────────────────────────────────────────

/** Fired when contextual nudge is shown to user */
export function emitNudgeShown(nudgeType: string) {
  send('ksc_nudge_shown', { nudge_type: nudgeType })
}

/** Fired when user dismisses a contextual nudge */
export function emitNudgeDismissed(nudgeType: string) {
  send('ksc_nudge_dismissed', { nudge_type: nudgeType })
}

/** Fired when user acts on a contextual nudge (e.g. clicks "Add card") */
export function emitNudgeActioned(nudgeType: string) {
  send('ksc_nudge_actioned', { nudge_type: nudgeType })
}

/** Fired when smart card suggestions are shown after agent connects */
export function emitSmartSuggestionsShown(cardCount: number) {
  send('ksc_smart_suggestions_shown', { card_count: cardCount })
}

/** Fired when user adds a card from smart suggestions */
export function emitSmartSuggestionAccepted(cardType: string) {
  send('ksc_smart_suggestion_accepted', { card_type: cardType })
}

/** Fired when user adds all suggested cards at once */
export function emitSmartSuggestionsAddAll(cardCount: number) {
  send('ksc_smart_suggestions_add_all', { card_count: cardCount })
}

// ── Card Recommendations (dashboard panel) ──────────────────────────

/** Fired when the "Recommended Cards for your clusters" panel renders */
export function emitCardRecommendationsShown(cardCount: number, highPriorityCount: number) {
  send('ksc_card_recommendations_shown', { card_count: cardCount, high_priority_count: highPriorityCount })
}

/** Fired when user adds a card from the recommendations panel */
export function emitCardRecommendationActioned(cardType: string, priority: string) {
  send('ksc_card_recommendation_actioned', { card_type: cardType, priority })
}

// ── Mission Suggestions (dashboard panel) ───────────────────────────

/** Fired when the "Recommended Actions for your clusters" panel renders */
export function emitMissionSuggestionsShown(count: number, criticalCount: number) {
  send('ksc_mission_suggestions_shown', { suggestion_count: count, critical_count: criticalCount })
}

/** Fired when user starts an action from the mission suggestions panel */
export function emitMissionSuggestionActioned(missionType: string, priority: string, action: string) {
  send('ksc_mission_suggestion_actioned', { mission_type: missionType, priority, action })
}

// ── "Almost" Action Tracking ────────────────────────────────────────
// These track user intent signals — users who almost engaged but didn't.
// Helps distinguish discovery problems from conversion problems.

/** Fired when add-card modal is opened (tracks intent to add) */
export function emitAddCardModalOpened() {
  send('ksc_add_card_modal_opened')
}

/** Fired when add-card modal is closed without adding any cards */
export function emitAddCardModalAbandoned() {
  send('ksc_add_card_modal_abandoned')
}

/** Fired when user scrolls the dashboard card grid (debounced) */
export function emitDashboardScrolled(depth: 'shallow' | 'deep') {
  send('ksc_dashboard_scrolled', { depth })
}

/** Fired when PWA install prompt is shown */
export function emitPwaPromptShown() {
  send('ksc_pwa_prompt_shown')
}

/** Fired when PWA install prompt is dismissed */
export function emitPwaPromptDismissed() {
  send('ksc_pwa_prompt_dismissed')
}

// ── LinkedIn Share ─────────────────────────────────────────────────

/** Fired when user clicks a LinkedIn share button */
export function emitLinkedInShare(source: string) {
  send('ksc_linkedin_share', { source })
}

// ── Session Context ──────────────────────────────────────────────

/**
 * Set install method and update channel as GA4 user properties.
 * Call this once the version-check hook has detected the install method.
 * Also fires a ksc_session_start event so we can segment sessions by
 * install method and channel in GA4 reports.
 *
 * Deduplicated per browser session — only fires once per tab lifecycle.
 */
const SESSION_START_KEY = '_ksc_session_start_sent'

export function emitSessionContext(installMethod: string, updateChannel: string) {
  // Set as persistent user properties — available on ALL future events
  setAnalyticsUserProperties({
    install_method: installMethod,
    update_channel: updateChannel,
  })

  // Fire session start event once per page load
  if (sessionStorage.getItem(SESSION_START_KEY)) return
  sessionStorage.setItem(SESSION_START_KEY, '1')

  send('ksc_session_start', {
    install_method: installMethod,
    update_channel: updateChannel,
  })
}

// ── Settings: Update ──────────────────────────────────────────────

/** Fired when user clicks "Check for Updates" in settings */
export function emitUpdateChecked() {
  send('ksc_update_checked')
}

/** Fired when user clicks "Update Now" to trigger an update */
export function emitUpdateTriggered() {
  send('ksc_update_triggered')
}

/** Fired when kc-agent reports the update completed successfully */
export function emitUpdateCompleted(durationMs: number) {
  send('ksc_update_completed', { duration_ms: durationMs })
}

/** Fired when kc-agent reports the update failed */
export function emitUpdateFailed(error: string) {
  send('ksc_update_failed', { error_detail: error.slice(0, 100) })
}

/** Fired when user clicks "Refresh to load new version" after a successful update */
export function emitUpdateRefreshed() {
  send('ksc_update_refreshed')
}

/** Fired when the stale-update timeout fires (no WebSocket progress within threshold) */
export function emitUpdateStalled() {
  send('ksc_update_stalled')
}

// ── Drill-Down ───────────────────────────────────────────────────

/** Fired when user opens a drill-down view (pod, cluster, namespace, etc.) */
export function emitDrillDownOpened(viewType: string) {
  send('ksc_drill_down_opened', { view_type: viewType })
}

/** Fired when user closes the drill-down modal */
export function emitDrillDownClosed(viewType: string, depth: number) {
  send('ksc_drill_down_closed', { view_type: viewType, depth })
}

// ── Card Refresh ─────────────────────────────────────────────────

/** Fired when user clicks the manual refresh button on a card */
export function emitCardRefreshed(cardType: string) {
  send('ksc_card_refreshed', { card_type: cardType })
}

// ── Global Filters ───────────────────────────────────────────────

/** Fired when user changes global cluster filter */
export function emitGlobalClusterFilterChanged(selectedCount: number, totalCount: number) {
  send('ksc_global_cluster_filter_changed', { selected_count: selectedCount, total_count: totalCount })
}

/** Fired when user changes global severity filter */
export function emitGlobalSeverityFilterChanged(selectedCount: number) {
  send('ksc_global_severity_filter_changed', { selected_count: selectedCount })
}

/** Fired when user changes global status filter */
export function emitGlobalStatusFilterChanged(selectedCount: number) {
  send('ksc_global_status_filter_changed', { selected_count: selectedCount })
}

// ── Prediction Feedback ──────────────────────────────────────────

/** Fired when user gives thumbs up/down on a prediction */
export function emitPredictionFeedbackSubmitted(feedback: string, predictionType: string, provider?: string) {
  send('ksc_prediction_feedback', { feedback, prediction_type: predictionType, provider: provider ?? 'unknown' })
}

// ── Snooze ───────────────────────────────────────────────────────

/** Fired when user snoozes a card, alert, mission, or recommendation */
export function emitSnoozed(targetType: string, duration?: string) {
  send('ksc_snoozed', { target_type: targetType, duration: duration ?? 'default' })
}

/** Fired when user unsnoozes an item */
export function emitUnsnoozed(targetType: string) {
  send('ksc_unsnoozed', { target_type: targetType })
}

// ── Dashboard CRUD ───────────────────────────────────────────────

/** Fired when user creates a new dashboard */
export function emitDashboardCreated(name: string) {
  send('ksc_dashboard_created', { dashboard_name: name })
}

/** Fired when user deletes a dashboard */
export function emitDashboardDeleted() {
  send('ksc_dashboard_deleted')
}

/** Fired when user renames a dashboard */
export function emitDashboardRenamed() {
  send('ksc_dashboard_renamed')
}

/** Fired when user imports a dashboard */
export function emitDashboardImported() {
  send('ksc_dashboard_imported')
}

/** Fired when user exports a dashboard */
export function emitDashboardExported() {
  send('ksc_dashboard_exported')
}

// ── Data Export ──────────────────────────────────────────────────

/** Fired when user downloads or copies data from a drill-down view */
export function emitDataExported(exportType: string, resourceType?: string) {
  send('ksc_data_exported', { export_type: exportType, resource_type: resourceType ?? '' })
}

// ── User Management ──────────────────────────────────────────────

/** Fired when admin changes a user's role */
export function emitUserRoleChanged(newRole: string) {
  send('ksc_user_role_changed', { new_role: newRole })
}

/** Fired when admin removes a user */
export function emitUserRemoved() {
  send('ksc_user_removed')
}

// ── Marketplace Browsing ─────────────────────────────────────────

/** Fired when user views a marketplace item detail */
export function emitMarketplaceItemViewed(itemType: string, itemName: string) {
  send('ksc_marketplace_item_viewed', { item_type: itemType, item_name: itemName })
}

// ── Insights ─────────────────────────────────────────────────────

/** Fired when user views an insight card detail */
export function emitInsightViewed(insightCategory: string) {
  send('ksc_insight_viewed', { insight_category: insightCategory })
}

// ── Arcade Games ────────────────────────────────────────────────

/** Fired when user starts or restarts an arcade game */
export function emitGameStarted(gameName: string) {
  send('ksc_game_started', { game_name: gameName })
}

/** Fired when a game ends (win, loss, or completion) */
export function emitGameEnded(gameName: string, outcome: string, score: number) {
  send('ksc_game_ended', { game_name: gameName, outcome, score })
}

// ── Sidebar Navigation ──────────────────────────────────────────

/** Fired when user clicks a sidebar navigation item */
export function emitSidebarNavigated(destination: string) {
  send('ksc_sidebar_navigated', { destination })
}

// ── Local Cluster ─────────────────────────────────────────────────

/** Fired when user creates a local cluster (kind, k3d, minikube) */
export function emitLocalClusterCreated(tool: string) {
  send('ksc_local_cluster_created', { tool })
}

// ── Developer Session ──────────────────────────────────────────────

/** Storage key to ensure we only fire developer session once per client */
const DEV_SESSION_KEY = 'ksc-dev-session-sent'

/**
 * Fired once per client when the user is running on localhost with the
 * Go backend (cloned the repo + startup-oauth.sh). This distinguishes
 * developers / contributors from regular console.kubestellar.io visitors.
 */
export function emitDeveloperSession() {
  if (localStorage.getItem(DEV_SESSION_KEY)) return
  const dep = getDeploymentType()
  if (dep !== 'localhost') return
  // Don't fire in forced demo mode (e.g. VITE_DEMO_MODE=true on localhost)
  if (isDemoMode() && !localStorage.getItem('ksc-token')) return
  localStorage.setItem(DEV_SESSION_KEY, '1')
  send('ksc_developer_session', { deployment_type: dep })
}

// ── Card Modal Browsing ─────────────────────────────────────────────

/** Fired when user expands a category in the add-card modal */
export function emitCardCategoryBrowsed(category: string) {
  send('ksc_card_category_browsed', { category })
}

/** Fired when the "Recommended for you" section renders in add-card modal */
export function emitRecommendedCardShown(cardTypes: string[]) {
  send('ksc_recommended_cards_shown', {
    card_count: cardTypes.length,
    card_types: cardTypes.join(','),
  })
}

// ── Dashboard Duration ──────────────────────────────────────────────

/** Fired when user navigates away from a dashboard, recording time spent */
export function emitDashboardViewed(dashboardId: string, durationMs: number) {
  send('ksc_dashboard_viewed', { dashboard_id: dashboardId, duration_ms: durationMs })
}

// ── Feature Hints ───────────────────────────────────────────────────

/** Fired when a contextual feature hint tooltip appears */
export function emitFeatureHintShown(hintType: string) {
  send('ksc_feature_hint_shown', { hint_type: hintType })
}

/** Fired when user dismisses a feature hint tooltip */
export function emitFeatureHintDismissed(hintType: string) {
  send('ksc_feature_hint_dismissed', { hint_type: hintType })
}

/** Fired when user clicks the CTA on a feature hint tooltip */
export function emitFeatureHintActioned(hintType: string) {
  send('ksc_feature_hint_actioned', { hint_type: hintType })
}

// ── Getting Started Banner ──────────────────────────────────────────

/** Fired when the Getting Started banner renders on main dashboard */
export function emitGettingStartedShown() {
  send('ksc_getting_started_shown')
}

/** Fired when user clicks one of the Getting Started quick-action buttons */
export function emitGettingStartedActioned(action: string) {
  send('ksc_getting_started_actioned', { action })
}

// ── Post-Connect Activation ──────────────────────────────────────────

/** Fired when the post-agent-connect activation banner renders */
export function emitPostConnectShown() {
  send('ksc_post_connect_shown')
}

/** Fired when user clicks a CTA on the post-connect activation banner */
export function emitPostConnectActioned(action: string) {
  send('ksc_post_connect_actioned', { action })
}

// ── Demo-to-Local CTA ──────────────────────────────────────────────

/** Fired when the "Try it locally" CTA renders for demo-site visitors */
export function emitDemoToLocalShown() {
  send('ksc_demo_to_local_shown')
}

/** Fired when a demo-site visitor clicks the install CTA */
export function emitDemoToLocalActioned(action: string) {
  send('ksc_demo_to_local_actioned', { action })
}

// ── Adopter Nudge ─────────────────────────────────────────────────

/** Fired when the adopter nudge banner renders */
export function emitAdopterNudgeShown() {
  send('ksc_adopter_nudge_shown')
}

/** Fired when user clicks the adopter nudge CTA */
export function emitAdopterNudgeActioned(action: string) {
  send('ksc_adopter_nudge_actioned', { action })
}

// ── UTM Tracking ───────────────────────────────────────────────────

/** Maximum length for UTM parameter values to avoid oversized beacon URLs */
const UTM_PARAM_MAX_LEN = 100

interface UtmParams {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
}

let utmParams: UtmParams = {}

export function captureUtmParams() {
  const params = new URLSearchParams(window.location.search)
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
  for (const key of utmKeys) {
    const val = params.get(key)
    if (val) utmParams[key as keyof UtmParams] = val.slice(0, UTM_PARAM_MAX_LEN)
  }
  if (Object.keys(utmParams).length > 0) {
    sessionStorage.setItem('_ksc_utm', JSON.stringify(utmParams))
    send('ksc_utm_landing', utmParams as Record<string, string>)
  } else {
    const stored = sessionStorage.getItem('_ksc_utm')
    if (stored) {
      try { utmParams = JSON.parse(stored) as UtmParams } catch { /* ignore */ }
    }
  }
}

export function getUtmParams(): UtmParams {
  return { ...utmParams }
}

// ── Dashboard Excellence: Modal & Action Events ─────────────────────

/** Fired when any detail modal is opened */
export function emitModalOpened(modalType: string, sourceCard: string) {
  send('ksc_modal_opened', { modal_type: modalType, source_card: sourceCard })
}

/** Fired when a tab is viewed within a modal */
export function emitModalTabViewed(modalType: string, tabName: string) {
  send('ksc_modal_tab_viewed', { modal_type: modalType, tab_name: tabName })
}

/** Fired when a modal is closed, with duration */
export function emitModalClosed(modalType: string, durationMs: number) {
  send('ksc_modal_closed', { modal_type: modalType, duration_ms: durationMs })
}

/** Fired when an insight is acknowledged */
export function emitInsightAcknowledged(insightCategory: string, insightSeverity: string) {
  send('ksc_insight_acknowledged', { insight_category: insightCategory, insight_severity: insightSeverity })
}

/** Fired when an insight is dismissed */
export function emitInsightDismissed(insightCategory: string, insightSeverity: string) {
  send('ksc_insight_dismissed', { insight_category: insightCategory, insight_severity: insightSeverity })
}

/** Fired when an inline action button is clicked */
export function emitActionClicked(actionType: string, sourceCard: string, dashboard: string) {
  send('ksc_action_clicked', { action_type: actionType, source_card: sourceCard, dashboard })
}

/** Fired when the AI suggestion/remediation tab is viewed */
export function emitAISuggestionViewed(insightCategory: string, hasAIEnrichment: boolean) {
  send('ksc_ai_suggestion_viewed', { insight_category: insightCategory, has_ai_enrichment: hasAIEnrichment })
}

// ── Welcome / Conference Landing Page ────────────────────────────────

/** Fired once when /welcome is rendered */
export function emitWelcomeViewed(ref: string) {
  send('ksc_welcome_viewed', { ref })
}

/** Fired on CTA button clicks (hero_explore_demo, hero_github, scenario_*, footer_*) */
export function emitWelcomeActioned(action: string, ref: string) {
  send('ksc_welcome_actioned', { action, ref })
}

// ── From Lens Landing Page ──────────────────────────────────────────

/** Fired when a user views the /from-lens landing page */
export function emitFromLensViewed() {
  send('ksc_from_lens_viewed')
}

/** Fired when a user interacts with a CTA on the /from-lens page */
export function emitFromLensActioned(action: string) {
  send('ksc_from_lens_actioned', { action })
}

/** Fired when a user switches deployment tabs (localhost / cluster-portforward / cluster-ingress) */
export function emitFromLensTabSwitch(tab: string) {
  send('ksc_from_lens_tab_switch', { tab })
}

/** Fired when a user copies an install command from the /from-lens page */
export function emitFromLensCommandCopy(tab: string, step: number, command: string) {
  send('ksc_from_lens_command_copy', { tab, step, command })
}

/* ------------------------------------------------------------------ */
/*  /from-headlamp competitive landing page                           */
/* ------------------------------------------------------------------ */

/** Fired once when /from-headlamp is rendered */
export function emitFromHeadlampViewed() {
  send('ksc_from_headlamp_viewed')
}

/** Fired on CTA button clicks (hero_try_demo, hero_view_github, footer_try_demo, footer_view_github) */
export function emitFromHeadlampActioned(action: string) {
  send('ksc_from_headlamp_actioned', { action })
}

/** Fired when switching deployment tabs (localhost, cluster-portforward, cluster-ingress) */
export function emitFromHeadlampTabSwitch(tab: string) {
  send('ksc_from_headlamp_tab_switch', { tab })
}

/** Fired when a user copies an install command from the /from-headlamp page */
export function emitFromHeadlampCommandCopy(tab: string, step: number, command: string) {
  send('ksc_from_headlamp_command_copy', { tab, step, command })
}

/* ------------------------------------------------------------------ */
/*  /white-label landing page                                          */
/* ------------------------------------------------------------------ */

/** Fired once when /white-label is rendered */
export function emitWhiteLabelViewed() {
  send('ksc_white_label_viewed')
}

/** Fired on CTA button clicks (hero_try_demo, hero_view_github, footer_try_demo, footer_view_github) */
export function emitWhiteLabelActioned(action: string) {
  send('ksc_white_label_actioned', { action })
}

/** Fired when switching deployment tabs (binary, helm, docker) */
export function emitWhiteLabelTabSwitch(tab: string) {
  send('ksc_white_label_tab_switch', { tab })
}

/** Fired when a user copies a command from the /white-label page */
export function emitWhiteLabelCommandCopy(tab: string, step: number, command: string) {
  send('ksc_white_label_command_copy', { tab, step, command })
}

/* ------------------------------------------------------------------ */
/*  Rotating tips (variable-reward engagement)                         */
/* ------------------------------------------------------------------ */

/** Fired when a rotating "Did you know?" tip is displayed on a page */
export function emitTipShown(page: string, tip: string) {
  send('ksc_tip_shown', { page, tip })
}

/** Fired when user's visit streak increments (consecutive days visiting) */
export function emitStreakDay(streakCount: number) {
  send('ksc_streak_day', { streak_count: streakCount })
}

/** Fired when a user clicks a blog post link; `title` is the clicked post title */
export function emitBlogPostClicked(title: string) {
  send('ksc_blog_post_clicked', { blog_title: title })
}
