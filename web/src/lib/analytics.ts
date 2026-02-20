/**
 * Google Analytics 4 — Product Telemetry (Custom Lightweight Tracker)
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

  // Fire discovery conversion step
  trackConversionStep(1, 'discovery', { deployment_type: deploymentType })
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

export function trackPageView(path: string) {
  send('page_view', { page_path: path, ksc_demo_mode: isDemoMode() ? 'true' : 'false' })
}

// ── Dashboard & Cards ──────────────────────────────────────────────

export function trackCardAdded(cardType: string, source: string) {
  send('ksc_card_added', { card_type: cardType, source })
}

export function trackCardRemoved(cardType: string) {
  send('ksc_card_removed', { card_type: cardType })
}

export function trackCardExpanded(cardType: string) {
  send('ksc_card_expanded', { card_type: cardType })
}

export function trackCardDragged(cardType: string) {
  send('ksc_card_dragged', { card_type: cardType })
}

export function trackCardConfigured(cardType: string) {
  send('ksc_card_configured', { card_type: cardType })
}

export function trackCardReplaced(oldType: string, newType: string) {
  send('ksc_card_replaced', { old_type: oldType, new_type: newType })
}

// ── AI Missions ────────────────────────────────────────────────────

export function trackMissionStarted(missionType: string, agentProvider: string) {
  send('ksc_mission_started', { mission_type: missionType, agent_provider: agentProvider })
}

export function trackMissionCompleted(missionType: string, durationSec: number) {
  send('ksc_mission_completed', { mission_type: missionType, duration_sec: durationSec })
}

export function trackMissionError(missionType: string, errorCode: string) {
  send('ksc_mission_error', { mission_type: missionType, error_code: errorCode })
}

export function trackMissionRated(missionType: string, rating: string) {
  send('ksc_mission_rated', { mission_type: missionType, rating })
}

// ── Auth ───────────────────────────────────────────────────────────

export function trackLogin(method: string) {
  send('login', { method })
}

export function trackLogout() {
  send('ksc_logout')
}

// ── Feedback ───────────────────────────────────────────────────────

export function trackFeedbackSubmitted(type: string) {
  send('ksc_feedback_submitted', { feedback_type: type })
}

// ── Errors ─────────────────────────────────────────────────────────

export function trackError(category: string, detail: string) {
  send('ksc_error', { error_category: category, error_detail: detail.slice(0, 100) })
}

export function trackSessionExpired() {
  send('ksc_session_expired')
}

// ── Tour ───────────────────────────────────────────────────────────

export function trackTourStarted() {
  send('ksc_tour_started')
}

export function trackTourCompleted(stepCount: number) {
  send('ksc_tour_completed', { step_count: stepCount })
}

export function trackTourSkipped(atStep: number) {
  send('ksc_tour_skipped', { at_step: atStep })
}

// ── Marketplace ────────────────────────────────────────────────────

export function trackMarketplaceInstall(itemType: string, itemName: string) {
  send('ksc_marketplace_install', { item_type: itemType, item_name: itemName })
}

export function trackMarketplaceRemove(itemType: string) {
  send('ksc_marketplace_remove', { item_type: itemType })
}

// ── GitHub Token ───────────────────────────────────────────────────

export function trackGitHubTokenConfigured() {
  send('ksc_github_token_configured')
}

export function trackGitHubTokenRemoved() {
  send('ksc_github_token_removed')
}

// ── API Provider ───────────────────────────────────────────────────

export function trackApiProviderConnected(provider: string) {
  send('ksc_api_provider_connected', { provider })
}

// ── Demo Mode ──────────────────────────────────────────────────────

export function trackDemoModeToggled(enabled: boolean) {
  send('ksc_demo_mode_toggled', { enabled: String(enabled) })
  userProperties.demo_mode = String(enabled)
}

// ── kc-agent Connection ─────────────────────────────────────────

export function trackAgentConnected(version: string, clusterCount: number) {
  send('ksc_agent_connected', { agent_version: version, cluster_count: clusterCount })
}

export function trackAgentDisconnected() {
  send('ksc_agent_disconnected')
}

// ── API Key Configuration ───────────────────────────────────────

export function trackApiKeyConfigured(provider: string) {
  send('ksc_api_key_configured', { provider })
}

export function trackApiKeyRemoved(provider: string) {
  send('ksc_api_key_removed', { provider })
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
  send('ksc_conversion_step', {
    step_number: step,
    step_name: stepName,
    ...details,
  })
}
