/**
 * Anonymous Product Feedback — Lightweight Event Emitter
 *
 * Stealth event delivery that bypasses ALL blocking:
 *   - No external scripts (immune to content-based ad blockers)
 *   - First-party proxy path /api/m (immune to domain-based blockers)
 *   - Base64-encoded payload (immune to parameter-pattern network filters)
 *
 * The proxy decodes the payload, rewrites the measurement ID, and forwards
 * to GA4's collection endpoint.
 */

import { STORAGE_KEY_ANALYTICS_OPT_OUT } from './constants'
import { isDemoMode } from './demoMode'

// DECOY Measurement ID — the proxy rewrites this to the real ID server-side.
const GA_MEASUREMENT_ID = 'G-0000000000'

const PROXY_PATH = '/api/m'
const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 min
const CID_KEY = '_ksc_cid'
const SID_KEY = '_ksc_sid'
const SC_KEY = '_ksc_sc'
const LAST_KEY = '_ksc_last'

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

/** Get total engagement time in ms and reset the accumulator */
function getAndResetEngagementMs(): number {
  let total = accumulatedEngagementMs
  if (isUserActive) {
    // Add current active period
    total += Date.now() - engagementStartMs
  }
  // Reset for next event
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
 * Note: We do NOT call getAndResetEngagementMs() here because send() already
 * calls it internally to set the _et parameter. Calling it here would reset
 * the accumulator before send() reads it, resulting in _et=0.
 */
function emitUserEngagement() {
  // Check if there's accumulated engagement without resetting.
  // send() will handle getting and resetting the actual value via _et.
  const hasEngagement = accumulatedEngagementMs > 0 || (isUserActive && Date.now() - engagementStartMs > 0)
  if (hasEngagement) {
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
let eventCount = 0

function send(
  eventName: string,
  params?: Record<string, string | number | boolean>,
) {
  if (!initialized || isOptedOut()) return

  const { sid, sc, isNew } = getSession()
  eventCount++

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
  }
  if (sc === 1 && isNew) {
    p.set('_fv', '1')
  }
  if (eventCount > 1) {
    p.set('seg', '1')
  }

  // Engagement time — GA4 uses this to calculate Average Engagement Time
  const engagementMs = getAndResetEngagementMs()
  if (engagementMs > 0) {
    p.set('_et', String(engagementMs))
  }

  // Event parameters (ep.key=val)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'number') {
        p.set(`epn.${k}`, String(v))
      } else {
        p.set(`ep.${k}`, String(v))
      }
    }
  }

  // User properties (up.key=val)
  for (const [k, v] of Object.entries(userProperties)) {
    p.set(`up.${k}`, v)
  }

  if (userId) {
    p.set('uid', userId)
  }

  // Campaign attribution — GA4 MP v2 requires explicit campaign params.
  // gtag.js extracts these from the URL automatically, but when using the
  // Measurement Protocol directly we must set cs/cm/cn/ck/cc ourselves.
  if (utmParams.utm_source) p.set('cs', utmParams.utm_source)
  if (utmParams.utm_medium) p.set('cm', utmParams.utm_medium)
  if (utmParams.utm_campaign) p.set('cn', utmParams.utm_campaign)
  if (utmParams.utm_term) p.set('ck', utmParams.utm_term)
  if (utmParams.utm_content) p.set('cc', utmParams.utm_content)

  // Encode the entire payload as base64 so network-level filters
  // can't match on GA4 parameter patterns (tid=G-*, en=, cid=, etc.)
  const encoded = btoa(p.toString())
  const url = `${PROXY_PATH}?d=${encodeURIComponent(encoded)}`

  if (navigator.sendBeacon) {
    navigator.sendBeacon(url)
  } else {
    fetch(url, { method: 'POST', keepalive: true }).catch(() => {})
  }
}

// ── Initialization ─────────────────────────────────────────────────

export function initAnalytics() {
  measurementId = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || GA_MEASUREMENT_ID
  if (!measurementId || initialized) return
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

  // Start tracking user engagement for GA4 engagement time metrics
  startEngagementTracking()

  // Flush engagement on page close (Safari doesn't always fire visibilitychange)
  window.addEventListener('beforeunload', emitUserEngagement)

  // Track unhandled errors globally for error categorization
  startGlobalErrorTracking()

  // Capture UTM parameters from landing URL
  captureUtmParams()

  // Fire discovery conversion step
  emitConversionStep(1, 'discovery', { deployment_type: deploymentType })
}

// ── Anonymous User ID ──────────────────────────────────────────────

async function hashUserId(uid: string): Promise<string> {
  const data = new TextEncoder().encode(`ksc-analytics:${uid}`)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function setAnalyticsUserId(uid: string) {
  if (!uid || uid === 'demo-user') return
  userId = await hashUserId(uid)
}

export function setAnalyticsUserProperties(props: Record<string, string>) {
  userProperties = { ...userProperties, ...props }
}

// ── Opt-out management ─────────────────────────────────────────────

export function setAnalyticsOptOut(optOut: boolean) {
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

// ── Card Interactions (framework-level) ──────────────────────────────
// These fire automatically from shared UI components (CardControls,
// CardSearchInput, CardClusterFilter) so all cards get consistent
// tracking without per-card instrumentation.

/** Fired when user changes sort field in a card's controls */
export function emitCardSortChanged(sortField: string) {
  send('ksc_card_sort_changed', { sort_field: sortField, page_path: window.location.pathname })
}

/** Fired when user toggles sort direction in a card's controls */
export function emitCardSortDirectionChanged(direction: string) {
  send('ksc_card_sort_direction_changed', { direction, page_path: window.location.pathname })
}

/** Fired when user changes the item limit in a card's controls */
export function emitCardLimitChanged(limit: string) {
  send('ksc_card_limit_changed', { limit, page_path: window.location.pathname })
}

/** Fired when user types in a card's search input (debounced — fires once per search session) */
export function emitCardSearchUsed(queryLength: number) {
  send('ksc_card_search_used', { query_length: queryLength, page_path: window.location.pathname })
}

/** Fired when user changes cluster filter selection in a card */
export function emitCardClusterFilterChanged(selectedCount: number, totalCount: number) {
  send('ksc_card_cluster_filter_changed', {
    selected_count: selectedCount,
    total_count: totalCount,
    page_path: window.location.pathname,
  })
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

export function emitSolutionSearchStarted(clusterConnected: boolean) {
  send('ksc_solution_search', { cluster_connected: clusterConnected })
}

export function emitSolutionSearchCompleted(found: number, scanned: number) {
  send('ksc_solution_search_done', { found, scanned })
}

export function emitSolutionBrowsed(path: string) {
  send('ksc_solution_browsed', { path })
}

export function emitSolutionViewed(title: string, cncfProject?: string) {
  send('ksc_solution_viewed', { title, cncf_project: cncfProject ?? '' })
}

export function emitSolutionImported(title: string, cncfProject?: string) {
  send('ksc_solution_imported', { title, cncf_project: cncfProject ?? '' })
}

export function emitSolutionLinkCopied(title: string, cncfProject?: string) {
  send('ksc_solution_link_copied', { title, cncf_project: cncfProject ?? '' })
}

export function emitSolutionGitHubLink() {
  send('ksc_solution_github_link')
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

// ── Errors ─────────────────────────────────────────────────────────

// Maximum length for error detail strings to avoid oversized payloads
const ERROR_DETAIL_MAX_LEN = 100

export function emitError(category: string, detail: string) {
  send('ksc_error', {
    error_category: category,
    error_detail: detail.slice(0, ERROR_DETAIL_MAX_LEN),
    error_page: window.location.pathname,
  })
}

/** Track unhandled promise rejections and runtime errors globally */
export function startGlobalErrorTracking() {
  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message || String(event.reason || 'unknown')
    emitError('unhandled_rejection', msg)
  })

  window.addEventListener('error', (event) => {
    // Skip errors from cross-origin scripts (no useful info)
    if (!event.message || event.message === 'Script error.') return
    emitError('runtime', event.message)
  })
}

export function emitSessionExpired() {
  send('ksc_session_expired')
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

// ── API Key Configuration ───────────────────────────────────────

export function emitApiKeyConfigured(provider: string) {
  send('ksc_api_key_configured', { provider })
}

export function emitApiKeyRemoved(provider: string) {
  send('ksc_api_key_removed', { provider })
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

// ── Settings: Update ──────────────────────────────────────────────

/** Fired when user clicks "Check for Updates" in settings */
export function emitUpdateChecked() {
  send('ksc_update_checked')
}

/** Fired when user clicks "Update Now" to trigger an update */
export function emitUpdateTriggered() {
  send('ksc_update_triggered')
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
