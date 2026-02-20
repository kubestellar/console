/**
 * Google Analytics 4 — Product Telemetry
 *
 * Centralized GA4 module. All events are prefixed with `ksc_`.
 * Opt-out is checked before every gtag() call.
 * No PII is collected — only anonymous usage data.
 *
 * Env var VITE_GA_MEASUREMENT_ID can override the default ID.
 */

import { STORAGE_KEY_ANALYTICS_OPT_OUT } from './constants'

// GA4 Measurement ID — this is a public tracking identifier (not a secret).
// It only allows sending data to the GA4 property, not reading it.
const GA_MEASUREMENT_ID = 'G-QPGNKGNNY2'
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

  // Inject gtag.js script
  const script = document.createElement('script')
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
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
  })

  // Set persistent user properties
  gtag('set', 'user_properties', {
    deployment_type: getDeploymentType(),
    demo_mode: String(isDemoMode()),
  })
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
