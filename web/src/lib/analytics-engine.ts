import { isDemoMode } from './demoMode'
import {
  _loadUtmParams,
  getDeploymentType,
  getOrCreateAnonymousId,
  hashUserId,
  isAutomatedEnvironment,
  rand,
  startEngagementTracking,
} from './analytics-session'
import type { AnalyticsEventParams, AnalyticsIdOverrides } from './analytics-types'
import { emitUserEngagement, send } from './analytics-dispatch'
import { resetAnalyticsErrorState, startGlobalErrorTracking } from './analytics-errors'
import {
  analyticsScriptsLoaded,
  consumePendingRecoveryEvent,
  DEFAULT_PROXY_MEASUREMENT_ID,
  gtagMeasurementId,
  INTERACTION_GATE_EVENTS,
  initialized,
  setAnalyticsScriptsLoaded,
  setGtagMeasurementId,
  setInitialized,
  setMeasurementId,
  setPageId,
  setUmamiWebsiteId,
  setUserHasInteracted,
  setUserId,
  umamiWebsiteId,
  userHasInteracted,
  mergeUserProperties,
  replaceUserProperties,
  resetAnalyticsCoreState,
} from './analytics-core-state'
import { loadAnalyticsProviders, resetAnalyticsProviderState, syncAnalyticsUserId, syncAnalyticsUserProperties } from './analytics-providers'

export function updateAnalyticsIds(ids: AnalyticsIdOverrides) {
  if (ids.ga4MeasurementId) {
    setGtagMeasurementId(ids.ga4MeasurementId)
  }
  if (ids.umamiWebsiteId) {
    setUmamiWebsiteId(ids.umamiWebsiteId)
  }
}

export function captureUtmParams() {
  const captured = _loadUtmParams()
  if (captured) {
    send('ksc_utm_landing', captured as AnalyticsEventParams)
  }
}

function onFirstInteraction() {
  if (userHasInteracted) return
  setUserHasInteracted(true)

  for (const eventName of INTERACTION_GATE_EVENTS) {
    document.removeEventListener(eventName, onFirstInteraction)
  }

  const recoveryEvent = consumePendingRecoveryEvent()
  if (recoveryEvent) {
    send('ksc_chunk_reload_recovery', {
      recovery_result: 'success',
      recovery_latency_ms: recoveryEvent.latencyMs,
      recovery_page: recoveryEvent.page,
    })
  }

  if (!analyticsScriptsLoaded) {
    setAnalyticsScriptsLoaded(true)
    if (gtagMeasurementId || umamiWebsiteId) {
      loadAnalyticsProviders()
    }
    startEngagementTracking(emitUserEngagement)

    const deploymentType = getDeploymentType()
    send('ksc_conversion_step', { step_number: 1, step_name: 'discovery', deployment_type: deploymentType })
    send('page_view', { page_path: window.location.pathname, ksc_demo_mode: isDemoMode() ? 'true' : 'false' })
  }
}

export function initAnalytics() {
  const configuredMeasurementId = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || DEFAULT_PROXY_MEASUREMENT_ID
  setMeasurementId(configuredMeasurementId)
  if (!configuredMeasurementId || initialized) return

  if (isAutomatedEnvironment()) return

  setInitialized(true)
  setPageId(rand())

  const deploymentType = getDeploymentType()
  let timezone = ''
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    // ignore
  }
  replaceUserProperties({
    deployment_type: deploymentType,
    demo_mode: String(isDemoMode()),
    ...(timezone && { timezone }),
  })

  window.addEventListener('beforeunload', emitUserEngagement)
  startGlobalErrorTracking()
  captureUtmParams()

  for (const eventName of INTERACTION_GATE_EVENTS) {
    document.addEventListener(eventName, onFirstInteraction, { once: true, passive: true })
  }
}

export async function setAnalyticsUserId(uid: string) {
  const effectiveUid = (!uid || uid === 'demo-user')
    ? getOrCreateAnonymousId()
    : uid
  setUserId(await hashUserId(effectiveUid))
  syncAnalyticsUserId()
}

export function setAnalyticsUserProperties(props: Record<string, string>) {
  mergeUserProperties(props)
  syncAnalyticsUserProperties(props)
}

export function emitPageView(path: string) {
  emitUserEngagement()
  setPageId(rand())
  send('page_view', { page_path: path, ksc_demo_mode: isDemoMode() ? 'true' : 'false' })
}

export function _resetAnalyticsState() {
  resetAnalyticsCoreState()
  resetAnalyticsProviderState()
  resetAnalyticsErrorState()
}
