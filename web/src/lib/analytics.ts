/**
 * Google Analytics 4 — Product Telemetry
 *
 * Centralized GA4 module. All events are prefixed with `ksc_`.
 * Opt-out is checked before every gtag() call.
 * No PII is collected — only anonymous usage data.
 *
 * Anti-spam: The frontend uses a DECOY Measurement ID (visible in source).
 * The first-party proxy at /t/g/collect rewrites it to the real ID server-side.
 * Spammers who scrape the source send hits to a non-existent property.
 *
 * Ad-blocker bypass: All requests go through /t/g/* on the console's own domain
 * instead of googletagmanager.com / google-analytics.com.
 */

import { STORAGE_KEY_ANALYTICS_OPT_OUT } from './constants'

// DECOY Measurement ID — publicly visible in source code.
// The first-party proxy rewrites this to the real GA4 Measurement ID server-side
// (via GA4_REAL_MEASUREMENT_ID env var). Spammers who scrape this ID from the
// source code will send traffic to a non-existent GA4 property.
const GA_MEASUREMENT_ID = 'G-0000000000'
import { isDemoMode } from './demoMode'

// ── Types ──────────────────────────────────────────────────────────

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
  }
}

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gtag(...args: any[]) {
  if (isOptedOut()) return
  window.gtag?.(...args)
}

// ── Initialization ─────────────────────────────────────────────────

let initialized = false

export function initAnalytics() {
  const measurementId = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || GA_MEASUREMENT_ID
  if (!measurementId || initialized) return
  initialized = true

  // First-party proxy base — bypasses ad blockers and enables tid rewriting.
  // The proxy at /t/g/js serves gtag.js from our own domain.
  // The proxy at /t/g/collect rewrites the decoy tid to the real one.
  const proxyBase = `${window.location.origin}/t`

  // Inject gtag.js script via first-party proxy
  const script = document.createElement('script')
  script.src = `${proxyBase}/g/js?id=${measurementId}`
  script.async = true
  document.head.appendChild(script)

  window.dataLayer = window.dataLayer || []
  // The gtag function signature requires the `arguments` object
  // eslint-disable-next-line prefer-rest-params
  window.gtag = function () { window.dataLayer.push(arguments) }

  gtag('js', new Date())
  gtag('config', measurementId, {
    send_page_view: false,
    cookie_flags: 'SameSite=None;Secure',
    transport_url: proxyBase,
  })

  // Set persistent user properties
  const deploymentType = getDeploymentType()
  gtag('set', 'user_properties', {
    deployment_type: deploymentType,
    demo_mode: String(isDemoMode()),
  })

  // Fire discovery conversion step
  trackConversionStep(1, 'discovery', { deployment_type: deploymentType })
}

// ── Anonymous User ID ──────────────────────────────────────────────
// Creates a SHA-256 hash of the user's numeric ID with a fixed salt.
// The result is deterministic (same user → same hash across deployments)
// but irreversible — no PII is stored or sent to GA4.

async function hashUserId(userId: string): Promise<string> {
  const data = new TextEncoder().encode(`ksc-analytics:${userId}`)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function setAnalyticsUserId(userId: string) {
  if (!userId || userId === 'demo-user') return
  const anonId = await hashUserId(userId)
  gtag('config', (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || GA_MEASUREMENT_ID, {
    user_id: anonId,
  })
}

export function setAnalyticsUserProperties(props: Record<string, string>) {
  gtag('set', 'user_properties', props)
}

// ── Opt-out management ─────────────────────────────────────────────

export function setAnalyticsOptOut(optOut: boolean) {
  localStorage.setItem(STORAGE_KEY_ANALYTICS_OPT_OUT, String(optOut))
  window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
  if (optOut) {
    // Clear GA cookies
    document.cookie.split(';').forEach(c => {
      const name = c.split('=')[0].trim()
      if (name.startsWith('_ga')) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
      }
    })
  }
}

export function isAnalyticsOptedOut(): boolean {
  return isOptedOut()
}

// ── Page views ─────────────────────────────────────────────────────

export function trackPageView(path: string) {
  gtag('event', 'page_view', {
    page_path: path,
    ksc_demo_mode: isDemoMode(),
  })
}

// ── Dashboard & Cards ──────────────────────────────────────────────

export function trackCardAdded(cardType: string, source: string) {
  gtag('event', 'ksc_card_added', { card_type: cardType, source })
}

export function trackCardRemoved(cardType: string) {
  gtag('event', 'ksc_card_removed', { card_type: cardType })
}

export function trackCardExpanded(cardType: string) {
  gtag('event', 'ksc_card_expanded', { card_type: cardType })
}

export function trackCardDragged(cardType: string) {
  gtag('event', 'ksc_card_dragged', { card_type: cardType })
}

export function trackCardConfigured(cardType: string) {
  gtag('event', 'ksc_card_configured', { card_type: cardType })
}

export function trackCardReplaced(oldType: string, newType: string) {
  gtag('event', 'ksc_card_replaced', { old_type: oldType, new_type: newType })
}

// ── AI Missions ────────────────────────────────────────────────────

export function trackMissionStarted(
  missionType: string,
  agentProvider: string,
) {
  gtag('event', 'ksc_mission_started', {
    mission_type: missionType,
    agent_provider: agentProvider,
  })
}

export function trackMissionCompleted(
  missionType: string,
  durationSec: number,
) {
  gtag('event', 'ksc_mission_completed', {
    mission_type: missionType,
    duration_sec: durationSec,
  })
}

export function trackMissionError(missionType: string, errorCode: string) {
  gtag('event', 'ksc_mission_error', {
    mission_type: missionType,
    error_code: errorCode,
  })
}

export function trackMissionRated(missionType: string, rating: string) {
  gtag('event', 'ksc_mission_rated', {
    mission_type: missionType,
    rating,
  })
}

// ── Auth ───────────────────────────────────────────────────────────

export function trackLogin(method: string) {
  gtag('event', 'login', { method })
}

export function trackLogout() {
  gtag('event', 'ksc_logout')
}

// ── Feedback ───────────────────────────────────────────────────────

export function trackFeedbackSubmitted(type: string) {
  gtag('event', 'ksc_feedback_submitted', { feedback_type: type })
}

// ── Errors ─────────────────────────────────────────────────────────

export function trackError(category: string, detail: string) {
  gtag('event', 'ksc_error', {
    error_category: category,
    error_detail: detail.slice(0, 100),
  })
}

export function trackSessionExpired() {
  gtag('event', 'ksc_session_expired')
}

// ── Tour ───────────────────────────────────────────────────────────

export function trackTourStarted() {
  gtag('event', 'ksc_tour_started')
}

export function trackTourCompleted(stepCount: number) {
  gtag('event', 'ksc_tour_completed', { step_count: stepCount })
}

export function trackTourSkipped(atStep: number) {
  gtag('event', 'ksc_tour_skipped', { at_step: atStep })
}

// ── Marketplace ────────────────────────────────────────────────────

export function trackMarketplaceInstall(itemType: string, itemName: string) {
  gtag('event', 'ksc_marketplace_install', {
    item_type: itemType,
    item_name: itemName,
  })
}

export function trackMarketplaceRemove(itemType: string) {
  gtag('event', 'ksc_marketplace_remove', { item_type: itemType })
}

// ── GitHub Token ───────────────────────────────────────────────────

export function trackGitHubTokenConfigured() {
  gtag('event', 'ksc_github_token_configured')
}

export function trackGitHubTokenRemoved() {
  gtag('event', 'ksc_github_token_removed')
}

// ── API Provider ───────────────────────────────────────────────────

export function trackApiProviderConnected(provider: string) {
  gtag('event', 'ksc_api_provider_connected', { provider })
}

// ── Demo Mode ──────────────────────────────────────────────────────

export function trackDemoModeToggled(enabled: boolean) {
  gtag('event', 'ksc_demo_mode_toggled', { enabled: String(enabled) })
  gtag('set', 'user_properties', { demo_mode: String(enabled) })
}

// ── kc-agent Connection ─────────────────────────────────────────

export function trackAgentConnected(version: string, clusterCount: number) {
  gtag('event', 'ksc_agent_connected', {
    agent_version: version,
    cluster_count: clusterCount,
  })
}

export function trackAgentDisconnected() {
  gtag('event', 'ksc_agent_disconnected')
}

// ── API Key Configuration ───────────────────────────────────────

export function trackApiKeyConfigured(provider: string) {
  gtag('event', 'ksc_api_key_configured', { provider })
}

export function trackApiKeyRemoved(provider: string) {
  gtag('event', 'ksc_api_key_removed', { provider })
}

// ── Conversion Funnel ───────────────────────────────────────────
// Unified step-based funnel event for tracking user journey:
//   1 = discovery     (visited site)
//   2 = login         (authenticated via OAuth or demo)
//   3 = agent         (kc-agent connected)
//   4 = clusters      (real clusters detected)
//   5 = api_key       (AI API key configured)
//   6 = github_token  (GitHub token configured)

export function trackConversionStep(
  step: number,
  stepName: string,
  details?: Record<string, string>,
) {
  gtag('event', 'ksc_conversion_step', {
    step_number: step,
    step_name: stepName,
    ...details,
  })
}
