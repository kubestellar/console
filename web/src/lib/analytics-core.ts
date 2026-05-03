/**
 * analytics-core.ts
 *
 * Core analytics send pipeline:
 *   - Dual-path event delivery (gtag.js primary, custom proxy fallback)
 *   - Umami parallel tracking
 *   - Event queuing while waiting for gtag.js load verdict
 *   - Initialization and lifecycle management
 *
 * All emit* functions defined in analytics-events.ts call send() from here.
 */

import { isDemoMode, isNetlifyDeployment } from './demoMode'
import { CHUNK_RELOAD_TS_KEY, isChunkLoadMessage } from './chunkErrors'
import { STORAGE_KEY_ANALYTICS_OPT_OUT } from './constants'
import type { SendOptions } from './analytics-types'
import {
  isAutomatedEnvironment,
  isOptedOut,
  getDeploymentType,
  getClientId,
  getSession,
  peekEngagementMs,
  peekSessionEngagementMs,
  getAndResetEngagementMs,
  resetSessionEngagement,
  incrementSessionPageViewCount,
  getSessionPageViewCount,
  startEngagementTracking,
  stopEngagementTracking,
  hashUserId,
  getOrCreateAnonymousId,
  _loadUtmParams,
  getUtmParams,
  rand,
  CID_KEY,
  SID_KEY,
  SC_KEY,
  LAST_KEY,
} from './analytics-session'

// ── Constants ──────────────────────────────────────────────────────

// DECOY Measurement ID — the proxy rewrites this to the real ID server-side.
const GA_MEASUREMENT_ID = 'G-0000000000'

const PROXY_PATH = '/api/m'
const GTAG_SCRIPT_PATH = '/api/gtag'

// Google Tag Manager CDN — used when first-party proxy is unavailable (Netlify)
const GTAG_CDN_URL = 'https://www.googletagmanager.com/gtag/js'

// Maximum time to wait for gtag.js before falling back to proxy
const GTAG_LOAD_TIMEOUT_MS = 5_000
// Delay after script.onload to verify gtag.js actually initialized
const GTAG_INIT_CHECK_MS = 100

// GA4 considers a session "engaged" after 10 seconds of active use.
// Once set, it stays true for the rest of the session.
const ENGAGED_SESSION_THRESHOLD_MS = 10_000

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

// ── Module-level state ─────────────────────────────────────────────

let measurementId = ''
let pageId = ''
export let userProperties: Record<string, string> = {}
let userId = ''
export let initialized = false

/** Whether a real user interaction has been detected */
let userHasInteracted = false
/** Whether analytics scripts have been loaded (only after interaction) */
let analyticsScriptsLoaded = false

/**
 * Pending chunk-reload recovery event captured at startup (before user
 * interaction). send() gates on userHasInteracted, so we defer the emit
 * until onFirstInteraction() to ensure the event reaches GA4.
 */
let pendingRecoveryEvent: { latencyMs: number; page: string } | null = null

let sessionEngaged = false

// Public GA4 measurement ID — configurable via branding config.
// Defaults to KubeStellar's ID; overridden by initAnalytics().
let gtagMeasurementId = 'G-PXWNVQ8D1T'

const INTERACTION_GATE_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const

// ── gtag.js Loading ────────────────────────────────────────────────

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

// ── Core Send ──────────────────────────────────────────────────────

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
  const utmParams = getUtmParams()

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
    // Reset all session-scoped engagement state on new session.
    sessionEngaged = false
    resetSessionEngagement()
  }
  if (sc === 1 && isNew) {
    p.set('_fv', '1')
  }

  // Bump pageview counter *before* the engaged-session check so the
  // very event that satisfies the 2-pageview rule gets seg=1 on it.
  if (eventName === 'page_view') {
    incrementSessionPageViewCount()
  }

  // GA4 considers a session engaged when ANY of:
  //   - cumulative session engagement ≥ 10s
  //   - ≥ 2 page_views in the session
  if (!sessionEngaged && (
    peekSessionEngagementMs() >= ENGAGED_SESSION_THRESHOLD_MS ||
    getSessionPageViewCount() >= 2
  )) {
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
    fetch(url, { method: 'POST', keepalive: true, signal: AbortSignal.timeout(5_000) }).catch(() => {})
  }
}

/**
 * Core send function — routes events to gtag.js or the custom proxy.
 * All emit* helper functions call this.
 */
export function send(
  eventName: string,
  params?: Record<string, string | number | boolean>,
  options?: SendOptions,
) {
  if (!initialized) return
  if (isOptedOut() && !options?.bypassOptOut) return

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

// ── User Engagement Flush ──────────────────────────────────────────

/**
 * Emit a user_engagement event to GA4 with accumulated engagement time.
 * GA4 calculates Average Engagement Time exclusively from this event type —
 * the _et parameter on other events (page_view, custom events) is ignored
 * for engagement metrics.
 */
export function emitUserEngagement() {
  if (peekEngagementMs() > 0) {
    send('user_engagement', {})
  }
}

// ── First Interaction Gate ─────────────────────────────────────────

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
    startEngagementTracking(emitUserEngagement)

    // Fire the events that would have fired at page load
    const deploymentType = getDeploymentType()
    // Import emitConversionStep and emitPageView inline to avoid circular dependency
    send('ksc_conversion_step', { step_number: 1, step_name: 'discovery', deployment_type: deploymentType })
    send('page_view', { page_path: window.location.pathname, ksc_demo_mode: isDemoMode() ? 'true' : 'false' })
  }
}

// ── Initialization ─────────────────────────────────────────────────

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

// ── UTM capture (public) ───────────────────────────────────────────

/**
 * Capture UTM parameters from the current URL and fire a ksc_utm_landing event
 * if any are present. Falls back to sessionStorage for subsequent navigations.
 * Also called internally by initAnalytics() at startup.
 */
export function captureUtmParams() {
  const captured = _loadUtmParams()
  if (captured) {
    send('ksc_utm_landing', captured as Record<string, string>)
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

// ── User identity ──────────────────────────────────────────────────

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

// ── Error Tracking ─────────────────────────────────────────────────

// Maximum length for error detail strings to avoid oversized payloads
const ERROR_DETAIL_MAX_LEN = 100

// Maximum length for the inferred component name dimension. Keeps GA4 custom
// dimension cardinality bounded (GA4 truncates parameter values at 100 chars
// regardless, but a tighter cap also keeps reports readable).
const COMPONENT_NAME_MAX_LEN = 60

// Maximum length for the inferred error type dimension. JS error names are
// short (TypeError, RangeError, etc.), so 40 chars is plenty.
const ERROR_TYPE_MAX_LEN = 40

/** Fallback when no error type can be inferred from the message or Error.name */
const ERROR_TYPE_UNKNOWN = 'Unknown'

/** Fallback when no component name can be inferred from cardId/stack */
const COMPONENT_NAME_UNKNOWN = 'unknown'

/**
 * Regex matching the leading "<ErrorName>:" prefix produced by `Error.toString()`
 * (e.g. "TypeError: Cannot read properties of undefined").
 */
const ERROR_NAME_PREFIX_RE = /^([A-Z][A-Za-z0-9]*Error):/

/**
 * Network-related error message fragments. Used as a heuristic when no
 * `Error.name` is available (e.g. errors caught from raw fetch failures).
 */
const NETWORK_ERROR_FRAGMENTS = [
  'Failed to fetch',
  'NetworkError',
  'net::ERR_',
  'Load failed',
] as const

/**
 * Extract a stable `error_type` dimension from either an Error instance or a
 * raw message string. Order of preference:
 *   1. `error.name` when an Error object was passed (most reliable)
 *   2. Leading `<ErrorName>:` prefix on the message
 *   3. Heuristic for network failures that surface without a typed Error
 *   4. ERROR_TYPE_UNKNOWN
 */
function inferErrorType(detail: string, error?: unknown): string {
  if (error && typeof error === 'object') {
    const name = (error as { name?: unknown }).name
    if (typeof name === 'string' && name.length > 0 && name !== 'Error') {
      return name.slice(0, ERROR_TYPE_MAX_LEN)
    }
  }
  const match = detail.match(ERROR_NAME_PREFIX_RE)
  if (match) return match[1].slice(0, ERROR_TYPE_MAX_LEN)
  for (const fragment of NETWORK_ERROR_FRAGMENTS) {
    if (detail.includes(fragment)) return 'NetworkError'
  }
  return ERROR_TYPE_UNKNOWN
}

/**
 * Regex matching the first React component name in a `componentStack` string
 * produced by `ErrorInfo.componentStack`. Each frame starts with `\n    in
 * <ComponentName>` (followed by " (created by …)" or file info).
 */
const REACT_COMPONENT_FRAME_RE = /\n\s*in\s+([A-Za-z0-9_$.]+)/

/**
 * Regex matching a JS stack frame's source file basename. Works for both
 * Chromium (`at fn (https://host/path/Foo.tsx:12:3)`) and WebKit/Firefox
 * (`fn@https://host/path/Foo.tsx:12:3`) stack formats.
 */
const STACK_FILE_BASENAME_RE = /\/([A-Za-z0-9_-]+)\.(?:tsx?|jsx?|mjs)[:?]/

/**
 * Extract a stable `component_name` dimension. Order of preference:
 *   1. Explicit `cardId` (set by DynamicCardErrorBoundary — most precise)
 *   2. First React frame from `componentStack` (set by error boundaries)
 *   3. First source-file basename from `error.stack`
 *   4. COMPONENT_NAME_UNKNOWN
 */
function inferComponentName(
  cardId?: string,
  componentStack?: string,
  error?: unknown,
): string {
  if (cardId && cardId.length > 0) {
    return cardId.slice(0, COMPONENT_NAME_MAX_LEN)
  }
  if (typeof componentStack === 'string') {
    const match = componentStack.match(REACT_COMPONENT_FRAME_RE)
    if (match) return match[1].slice(0, COMPONENT_NAME_MAX_LEN)
  }
  const stack = (error && typeof error === 'object')
    ? (error as { stack?: unknown }).stack
    : undefined
  if (typeof stack === 'string') {
    const match = stack.match(STACK_FILE_BASENAME_RE)
    if (match) return match[1].slice(0, COMPONENT_NAME_MAX_LEN)
  }
  return COMPONENT_NAME_UNKNOWN
}

/**
 * Optional context for `emitError`. Callers that have access to the original
 * Error object and/or a React `componentStack` should pass them so the
 * `error_type` and `component_name` dimensions can be inferred reliably.
 */
export interface EmitErrorExtra {
  /** Original Error instance — supplies `error.name` and `error.stack`. */
  error?: unknown
  /** React `ErrorInfo.componentStack` — supplies the failing component name. */
  componentStack?: string
}

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

/**
 * Detect promise rejections injected by browser extensions (wallet
 * providers, adblockers, password managers) that throw against our
 * window but have nothing to do with our code.
 */
function isBrowserExtensionNoise(msg: string, reason: unknown): boolean {
  if (
    msg.includes('MetaMask') ||
    msg.includes('ethereum') ||
    msg.includes('web3') ||
    msg.includes('evmAsk') ||
    msg.includes('solana') ||
    msg.includes('Could not establish connection. Receiving end does not exist')
  ) return true
  const stack = (reason as { stack?: string } | null)?.stack
  if (typeof stack === 'string' && (
    stack.includes('chrome-extension://') ||
    stack.includes('moz-extension://') ||
    stack.includes('safari-extension://')
  )) return true
  return false
}

// ── Browser error ring buffer (for feedback modal) ────────────────────
// Stores recent console errors so the feedback modal can attach them to
// GitHub issues automatically. Keeps the last N entries; oldest evicted.
const ERROR_RING_BUFFER_SIZE = 50

interface CapturedError {
  timestamp: string
  level: 'error' | 'warn'
  message: string
  source?: string
}

const capturedErrors: CapturedError[] = []

function pushCapturedError(level: 'error' | 'warn', message: string, source?: string) {
  const entry: CapturedError = {
    timestamp: new Date().toISOString(),
    level,
    message: message.slice(0, 500),
    ...(source && { source }),
  }
  capturedErrors.push(entry)
  if (capturedErrors.length > ERROR_RING_BUFFER_SIZE) {
    capturedErrors.shift()
  }
}

/** Returns recent browser errors for inclusion in feedback reports. */
export function getRecentBrowserErrors(): CapturedError[] {
  return [...capturedErrors]
}

/** @internal — exported for test isolation only */
export function _resetCapturedErrors() {
  capturedErrors.length = 0
}

// ── Failed API call ring buffer (for feedback modal) ──────────────────
// Stores recent HTTP API failures so the feedback modal can attach them
// to GitHub issues automatically. Keeps the last N entries; oldest evicted.
const API_ERROR_RING_BUFFER_SIZE = 20

interface CapturedApiCall {
  timestamp: string
  status: number | string
  endpoint: string
  detail?: string
}

const capturedApiCalls: CapturedApiCall[] = []

function pushCapturedApiCall(status: number | string, endpoint: string, detail?: string) {
  const entry: CapturedApiCall = {
    timestamp: new Date().toISOString(),
    status,
    endpoint,
    ...(detail && { detail: detail.slice(0, 500) }),
  }
  capturedApiCalls.push(entry)
  if (capturedApiCalls.length > API_ERROR_RING_BUFFER_SIZE) {
    capturedApiCalls.shift()
  }
}

/** Returns recent failed API calls for inclusion in feedback reports. */
export function getRecentFailedApiCalls(): CapturedApiCall[] {
  return [...capturedApiCalls]
}

/** @internal — exported for test isolation only */
export function _resetCapturedApiCalls() {
  capturedApiCalls.length = 0
}

// ── Global error-event rate limiter (#11638) ──────────────────────────
// A cascading bug (e.g. FedRAMP `in_process` rendering, cluster dedup
// missing `aliases`) can trigger errors from many distinct cards/pages
// simultaneously, bypassing per-card throttles. This global limiter caps
// the total number of ksc_error and ksc_http_error events sent within any
// sliding window, regardless of source.
const ERROR_EVENT_MAX_PER_WINDOW = 10
const ERROR_EVENT_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const globalErrorEventTimestamps: { ksc_error: number[]; ksc_http_error: number[] } = {
  ksc_error: [],
  ksc_http_error: [],
}

function isGlobalRateLimited(eventName: 'ksc_error' | 'ksc_http_error'): boolean {
  const now = Date.now()
  const timestamps = globalErrorEventTimestamps[eventName]
  // Evict expired timestamps
  while (timestamps.length > 0 && now - timestamps[0] > ERROR_EVENT_WINDOW_MS) {
    timestamps.shift()
  }
  if (timestamps.length >= ERROR_EVENT_MAX_PER_WINDOW) return true
  timestamps.push(now)
  return false
}

// ── Per-card / per-page error throttling (#10092, #11638) ─────────────
// CI/CD cards poll every 30-120s. Without throttling, a single broken card
// generates dozens of ksc_error events per session. We cap emissions to at
// most one per card+category per throttle window, and enforce a per-page
// session budget so a single route can't dominate the error stream.
// Increased from 60s to 5min to handle persistent polling failures (#11638).
const ERROR_THROTTLE_MS = 300_000
const MAX_ERRORS_PER_PAGE_SESSION = 50
const recentErrorEmissions = new Map<string, number>()
const pageErrorCounts = new Map<string, number>()

// ── ksc_http_error throttling (#11511, #11638) ────────────────────────
// The ksc_http_error event fires from unhandledrejection/error handlers for
// auth and 5xx fetch failures. Without throttling, polling cards that hit
// repeated failures (e.g. expired token, upstream 502) emit ksc_http_error
// on every poll cycle — causing GA4 event volume to spike at 3.5-10.5× baseline.
// Throttle to at most one emission per status+page combination per window.
// Increased from 60s to 5min to handle persistent polling failures (#11638).
const HTTP_ERROR_THROTTLE_MS = 300_000
const recentHttpErrorEmissions = new Map<string, number>()

function isHttpErrorThrottled(httpStatus: string, page: string): boolean {
  const key = `${page}:${httpStatus}`
  const lastEmit = recentHttpErrorEmissions.get(key)
  if (lastEmit && Date.now() - lastEmit < HTTP_ERROR_THROTTLE_MS) return true
  // Only record the timestamp when send() will actually fire. If analytics is
  // not yet initialized or the user hasn't interacted, send() silently drops
  // the event — recording the timestamp now would suppress the next real
  // emission that should be sent, causing under-reporting.
  if (initialized && userHasInteracted) {
    recentHttpErrorEmissions.set(key, Date.now())
  }
  // Prevent unbounded map growth
  if (recentHttpErrorEmissions.size > 100) {
    const now = Date.now()
    for (const [k, ts] of recentHttpErrorEmissions) {
      if (now - ts > HTTP_ERROR_THROTTLE_MS) recentHttpErrorEmissions.delete(k)
    }
  }
  return false
}

/** @internal — exported for test isolation only */
export function _resetErrorThrottles() {
  recentErrorEmissions.clear()
  pageErrorCounts.clear()
  recentHttpErrorEmissions.clear()
  globalErrorEventTimestamps.ksc_error = []
  globalErrorEventTimestamps.ksc_http_error = []
}

/**
 * @internal — exported for test isolation only.
 * Resets ALL module-level analytics state so tests don't leak state across
 * files when Vitest runs them in the same worker. Without this, a prior test
 * file that calls initAnalytics() leaves `initialized = true`, which causes
 * subsequent initAnalytics() calls to no-op — breaking tests that depend on
 * a fresh analytics pipeline (e.g. analytics-noise-filters).
 */
export function _resetAnalyticsState() {
  initialized = false
  userHasInteracted = false
  analyticsScriptsLoaded = false
  gtagAvailable = false
  gtagDecided = false
  realMeasurementId = ''
  pendingEvents = []
  measurementId = ''
  pageId = ''
  userId = ''
  sessionEngaged = false
  pendingRecoveryEvent = null
  recentErrorEmissions.clear()
  pageErrorCounts.clear()
  recentHttpErrorEmissions.clear()
  globalErrorEventTimestamps.ksc_error = []
  globalErrorEventTimestamps.ksc_http_error = []
  capturedErrors.length = 0
  capturedApiCalls.length = 0
}

/**
 * Emit a `ksc_http_error` GA4 event for a failed API call.
 * Throttled to at most one emission per status+page per HTTP_ERROR_THROTTLE_MS window.
 * Also records the failure in the failed-API-call ring buffer (for feedback modal).
 */
export function emitHttpError(httpStatus: string, errorDetail: string) {
  const page = window.location.pathname
  pushCapturedApiCall(httpStatus, page, errorDetail)
  if (!isHttpErrorThrottled(httpStatus, page) && !isGlobalRateLimited('ksc_http_error')) {
    send('ksc_http_error', {
      http_status: httpStatus,
      error_detail: errorDetail.slice(0, ERROR_DETAIL_MAX_LEN),
      error_page: page,
    })
  }
}

function isErrorThrottled(category: string, page: string, cardId?: string): boolean {
  // Per-page session budget
  const pageCount = pageErrorCounts.get(page) ?? 0
  if (pageCount >= MAX_ERRORS_PER_PAGE_SESSION) return true

  // Per card+category throttle (or per category if no card)
  const throttleKey = `${page}:${category}:${cardId ?? '_global'}`
  const lastEmit = recentErrorEmissions.get(throttleKey)
  if (lastEmit && Date.now() - lastEmit < ERROR_THROTTLE_MS) return true

  // Record emission
  recentErrorEmissions.set(throttleKey, Date.now())
  pageErrorCounts.set(page, pageCount + 1)

  // Prevent unbounded map growth — prune expired entries periodically
  if (recentErrorEmissions.size > 200) {
    const now = Date.now()
    for (const [k, ts] of recentErrorEmissions) {
      if (now - ts > ERROR_THROTTLE_MS) recentErrorEmissions.delete(k)
    }
  }
  return false
}

export function emitError(
  category: string,
  detail: string,
  cardId?: string,
  extra?: EmitErrorExtra,
) {
  const page = window.location.pathname
  if (isErrorThrottled(category, page, cardId)) return
  if (isGlobalRateLimited('ksc_error')) return

  const errorType = inferErrorType(detail, extra?.error)
  const componentName = inferComponentName(cardId, extra?.componentStack, extra?.error)
  send('ksc_error', {
    error_code: category,
    error_category: category,
    error_detail: detail.slice(0, ERROR_DETAIL_MAX_LEN),
    error_page: page,
    // New custom dimensions (issue #9861) — make ksc_error spikes diagnosable
    // by surfacing the JS error class and the failing component without
    // having to dig through error_detail strings in BigQuery.
    error_type: errorType,
    component_name: componentName,
    ...(cardId && { card_id: cardId }),
  })
}

/** Emit when auto-reload failed to fix stale chunks (user sees manual reload UI) */
export function emitChunkReloadRecoveryFailed(errorDetail: string) {
  send('ksc_chunk_reload_recovery', {
    recovery_result: 'failed',
    recovery_page: window.location.pathname,
    error_detail: errorDetail.slice(0, ERROR_DETAIL_MAX_LEN),
  })
}

/**
 * Check if this page load is a recovery from a chunk-load auto-reload.
 * If CHUNK_RELOAD_TS_KEY exists in sessionStorage, the previous page load
 * hit a stale chunk error and triggered window.location.reload().
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
 * Substrings that unambiguously indicate a stale-chunk / dynamic-import failure
 * (i.e. messages where auto-reload is the right recovery action). These are the
 * subset of `isChunkLoadMessage` patterns that cannot be confused with generic
 * `fetch()` failures.
 *
 * The bare network patterns (`Failed to fetch`, `NetworkError`,
 * `Unexpected token '<'`) are intentionally excluded — they match both real
 * stale-chunk failures AND ordinary backend / network hiccups, and the latter
 * far outnumber the former in the unhandledrejection global handler. Treating
 * every backend hiccup as a chunk failure would (a) trigger a full page reload
 * on transient API errors and (b) emit a misleading `chunk_load` ksc_error.
 *
 * Per `chunkErrors.test.ts`, `isChunkLoadMessage` retains its broad behaviour
 * for the React `ChunkErrorBoundary` — that boundary only fires when React
 * itself catches the error (i.e. when it really did come from `lazy(() =>
 * import())`), so the broader match is safe there.
 */
const STRICT_CHUNK_INDICATORS = [
  'dynamically imported module',
  'Loading chunk',
  'Loading CSS chunk',
  'Unable to preload CSS',
  'is not a valid JavaScript MIME type',
  'Importing a module script failed',
  'chunk may be stale',
] as const

/**
 * Bare network-failure substrings that should be filtered as noise from the
 * unhandledrejection handler. These messages arrive without any chunk-specific
 * context (file URL, "dynamically imported module", etc.) and almost always
 * come from regular `fetch()` calls whose error path was missed by the caller.
 * Tracked separately by per-hook error handling — emitting them again from the
 * global handler creates duplicate ksc_error events.
 */
const BARE_NETWORK_NOISE_SUBSTRINGS = [
  'Failed to fetch',
  'NetworkError',
  'net::ERR_',
  'Index fetch failed',
] as const

/** True when the message is a generic network failure with no chunk context. */
function isBareNetworkNoise(msg: string): boolean {
  if (!BARE_NETWORK_NOISE_SUBSTRINGS.some(s => msg.includes(s))) return false
  // If the message also contains a strict chunk indicator, it's a real
  // chunk-load failure (e.g. `Failed to fetch dynamically imported module: …`)
  // and must NOT be filtered — chunk auto-reload should still run.
  return !STRICT_CHUNK_INDICATORS.some(s => msg.includes(s))
}

/**
 * If the error message indicates a stale-chunk failure, auto-reload once.
 * Returns true when the error IS a chunk error so the caller skips emitting
 * a duplicate 'runtime' event.
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
// Store console originals at module scope for cleanup across multiple initializations
let consoleRestoreCleanup: (() => void) | null = null

export function startGlobalErrorTracking() {
  // Check if we just recovered from a chunk-load auto-reload
  checkChunkReloadRecovery()

  // Restore previous interception (if any) to avoid chained wrappers
  if (consoleRestoreCleanup) {
    consoleRestoreCleanup()
  }

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
      // Skip browser-extension promise rejections (wallet providers, etc.)
      if (isBrowserExtensionNoise(msg, event.reason)) return
      // Skip transient network errors — tracked by individual hook error handling.
      // MUST run before tryChunkReloadRecovery: bare `Failed to fetch` /
      // `NetworkError` substrings also match `isChunkLoadMessage`, which would
      // otherwise trigger an unwanted page reload AND emit a misleading
      // `chunk_load` ksc_error for ordinary backend hiccups (issue #9866).
      if (isBareNetworkNoise(msg)) return
      // Stale chunks can surface as unhandled rejections from dynamic import()
      if (tryChunkReloadRecovery(msg)) return
      // Skip AbortError / TimeoutError — expected when fetches are cancelled on unmount
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
      // Skip WebKit URL-parse errors
      if (msg.includes('did not match the expected pattern')) return
      // Skip JSON parse / SyntaxError errors from response.json() calls.
      // Browser implementations vary in error message wording — also catch
      // SyntaxError by name to cover edge cases (#10092).
      if (
        msg.includes('JSON.parse') ||
        msg.includes('is not valid JSON') ||
        msg.includes('JSON Parse error') ||
        msg.includes('Unexpected token') ||
        msg.includes('Unexpected end of JSON') ||
        errorName === 'SyntaxError'
      ) return
      // Skip ServiceWorker notification errors
      if (msg.includes('showNotification') || msg.includes('No active registration')) return
      // Skip WebSocket send-before-connect errors
      if (msg.includes('send was called before connect') || msg.includes('InvalidStateError')) return
      // Skip BackendUnavailableError on Netlify / console.kubestellar.io
      if (isNetlifyDeployment && msg.includes('Backend API is currently unavailable')) return
      // Skip WebGL context errors — benign GPU process resets
      if (msg.includes('WebGL') || msg.includes('context lost')) return
      // Skip auth-flow errors — UnauthenticatedError is thrown by api.get() when
      // no token is available (expected for unauthenticated visitors). Emitting
      // these as ksc_error creates false-positive alert spikes (#9994).
      if (errorName === 'UnauthenticatedError' || errorName === 'UnauthorizedError') {
        pushCapturedError('error', msg, 'auth_error')
        emitHttpError('auth', msg)
        return
      }
      if (msg.includes('No authentication token') || msg.includes('Token is invalid or expired')) {
        pushCapturedError('error', msg, 'auth_error')
        emitHttpError('auth', msg)
        return
      }
      if (/\b50[234]\b/.test(msg) && (msg.includes('fetch') || msg.includes('Fetch') || msg.includes('upstream'))) {
        const statusMatch = msg.match(/\b(50[234])\b/)
        const httpStatus = statusMatch?.[1] ?? '5xx'
        pushCapturedError('error', msg, `http_${httpStatus}`)
        emitHttpError(httpStatus, msg)
        return
      }
      pushCapturedError('error', msg, 'unhandled_rejection')
      emitError('unhandled_rejection', msg, undefined, { error: event.reason })
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
      // Skip clipboard API errors
      if (event.message.includes('writeText') || event.message.includes('clipboard') || event.message.includes('copy')) return
      // Skip browser-extension runtime errors
      if (isBrowserExtensionNoise(event.message, event.error)) return
      // Also skip when the source filename itself points at an extension URL
      if (typeof event.filename === 'string' && (
        event.filename.startsWith('chrome-extension://') ||
        event.filename.startsWith('moz-extension://') ||
        event.filename.startsWith('safari-extension://')
      )) return
      // ResizeObserver loop errors are benign browser noise — the W3C spec
      // fires this when observations can't be delivered in a single animation
      // frame. Multiple cards on the dashboard use ResizeObserver, and layout
      // shifts during initial render or window resize trigger this harmlessly.
      if (event.message.includes('ResizeObserver loop')) return
      // WebGL context lost/restored events fire when the GPU process resets
      // (tab backgrounded, driver update, resource pressure). The globe
      // animation and game cards handle this gracefully via Three.js internals.
      if (
        event.message.includes('WebGL') ||
        event.message.includes('context lost') ||
        event.message.includes('GL_INVALID')
      ) return
      // Canvas errors from 2D/WebGL rendering (toDataURL on tainted canvas,
      // drawing to a canvas whose context was lost, etc.) are not actionable.
      if (event.message.includes('canvas') || event.message.includes('CanvasRenderingContext')) return
      // Network errors surfacing as runtime errors (e.g. image/script load
      // failures due to transient connectivity). These are tracked separately
      // via fetch error handling in individual hooks.
      if (
        event.message.includes('Failed to fetch') ||
        event.message.includes('NetworkError') ||
        event.message.includes('net::ERR_')
      ) return
      // Chrome fires "Non-Error promise rejection captured" for non-Error
      // objects thrown in promise chains — typically from third-party scripts.
      if (event.message.includes('Non-Error')) return
      // Stale chunks can surface as runtime errors (Safari: "Importing a module script failed")
      if (tryChunkReloadRecovery(event.message)) return
      if (event.error?.name === 'UnauthenticatedError' || event.error?.name === 'UnauthorizedError') {
        pushCapturedError('error', event.message, 'auth_error')
        emitHttpError('auth', event.message)
        return
      }
      if (event.message.includes('No authentication token') || event.message.includes('Token is invalid or expired')) {
        pushCapturedError('error', event.message, 'auth_error')
        emitHttpError('auth', event.message)
        return
      }
      pushCapturedError('error', event.message, 'runtime')
      emitError('runtime', event.message, undefined, { error: event.error })
    } finally {
      isEmitting = false
    }
  })

  // Intercept console.error and console.warn to capture them in the ring buffer
  const originalConsoleError = console.error
  const originalConsoleWarn = console.warn
  console.error = (...args: unknown[]) => {
    const msg = args.map(a => (typeof a === 'string' ? a : String(a))).join(' ')
    if (!isBrowserExtensionNoise(msg, null)) {
      pushCapturedError('error', msg, 'console.error')
    }
    originalConsoleError.apply(console, args)
  }
  console.warn = (...args: unknown[]) => {
    const msg = args.map(a => (typeof a === 'string' ? a : String(a))).join(' ')
    pushCapturedError('warn', msg, 'console.warn')
    originalConsoleWarn.apply(console, args)
  }

  // Store cleanup function to restore originals on next initialization
  consoleRestoreCleanup = () => {
    console.error = originalConsoleError
    console.warn = originalConsoleWarn
  }
}

export const __testables = {
  inferErrorType,
  inferComponentName,
  isBrowserExtensionNoise,
  isBareNetworkNoise,
  isErrorThrottled,
  markErrorReported,
  wasAlreadyReported,
  restoreConsole: () => consoleRestoreCleanup?.(),
}
