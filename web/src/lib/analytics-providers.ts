import {
  getAndResetEngagementMs,
  getClientId,
  getSession,
  getSessionPageViewCount,
  getUtmParams,
  incrementSessionPageViewCount,
  peekEngagementMs,
  peekSessionEngagementMs,
  resetSessionEngagement,
} from './analytics-session'
import type { AnalyticsEventParams } from './analytics-types'
import {
  gtagMeasurementId,
  measurementId,
  pageId,
  realMeasurementId,
  sessionEngaged,
  setRealMeasurementId,
  setSessionEngaged,
  umamiWebsiteId,
  userId,
  userProperties,
} from './analytics-core-state'
import { logger } from '@/lib/logger'

const PROXY_PATH = '/api/m'
const GTAG_SCRIPT_PATH = '/api/gtag'
const GTAG_CDN_URL = 'https://www.googletagmanager.com/gtag/js'
const GTAG_LOAD_TIMEOUT_MS = 5_000
const GTAG_INIT_CHECK_MS = 100
const ENGAGED_SESSION_THRESHOLD_MS = 10_000
const UMAMI_SCRIPT_PATH = '/api/ksc'

type PendingAnalyticsEvent = {
  name: string
  params?: AnalyticsEventParams
}

let gtagAvailable = false
let gtagDecided = false
let pendingEvents: PendingAnalyticsEvent[] = []

function loadUmamiScript() {
  const script = document.createElement('script')
  script.src = UMAMI_SCRIPT_PATH
  script.defer = true
  script.dataset.websiteId = umamiWebsiteId
  script.dataset.hostUrl = window.location.origin
  document.head.appendChild(script)
}

function sendToUmami(eventName: string, params?: AnalyticsEventParams) {
  try {
    if (window.umami?.track) {
      window.umami.track(eventName, params)
    }
  } catch {
    // Umami failures must never affect GA4 tracking
  }
}

function flushPendingEvents() {
  const queue = pendingEvents
  pendingEvents = []
  for (const event of queue) {
    if (gtagAvailable) {
      sendViaGtag(event.name, event.params)
    } else {
      sendViaProxy(event.name, event.params)
    }
  }
}

function markGtagDecided(available: boolean) {
  if (gtagDecided) return
  gtagAvailable = available
  gtagDecided = true
  flushPendingEvents()
}

function loadGtagScript() {
  const mid = gtagMeasurementId
  setRealMeasurementId(mid)

  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', mid, {
    send_page_view: false,
    cookie_domain: 'auto',
    client_id: getClientId(),
  })
  window.gtag('set', 'user_properties', { ...userProperties })

  setTimeout(() => markGtagDecided(false), GTAG_LOAD_TIMEOUT_MS)

  const isGtagInitialized = () => typeof window.google_tag_manager !== 'undefined'

  const loadCdnFallback = () => {
    const cdnScript = document.createElement('script')
    cdnScript.async = true
    cdnScript.src = `${GTAG_CDN_URL}?id=${mid}`
    cdnScript.onload = () => {
      setTimeout(() => markGtagDecided(isGtagInitialized()), GTAG_INIT_CHECK_MS)
    }
    cdnScript.onerror = () => { markGtagDecided(false) }
    document.head.appendChild(cdnScript)
  }

  const script = document.createElement('script')
  script.async = true
  script.src = `${GTAG_SCRIPT_PATH}?id=${mid}`
  script.onload = () => {
    setTimeout(() => {
      if (isGtagInitialized()) {
        markGtagDecided(true)
      } else {
        loadCdnFallback()
      }
    }, GTAG_INIT_CHECK_MS)
  }
  script.onerror = () => {
    loadCdnFallback()
  }
  document.head.appendChild(script)
}

function sendViaGtag(eventName: string, params?: AnalyticsEventParams) {
  if (!window.gtag) return

  const gtagParams: AnalyticsEventParams = {
    ...(params || {}),
  }

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

  if (userId) {
    gtagParams.user_id = userId
  }

  window.gtag('event', eventName, gtagParams)
}

function sendViaProxy(eventName: string, params?: AnalyticsEventParams) {
  const { sid, sc, isNew } = getSession()
  const utmParams = getUtmParams()

  const searchParams = new URLSearchParams()
  searchParams.set('v', '2')
  searchParams.set('tid', measurementId)
  searchParams.set('cid', getClientId())
  searchParams.set('sid', sid)
  searchParams.set('_p', pageId)
  searchParams.set('en', eventName)
  searchParams.set('_s', String(sc))
  searchParams.set('dl', window.location.href)
  searchParams.set('dt', document.title)
  searchParams.set('ul', navigator.language)
  searchParams.set('sr', `${screen.width}x${screen.height}`)

  if (isNew) {
    searchParams.set('_ss', '1')
    searchParams.set('_nsi', '1')
    setSessionEngaged(false)
    resetSessionEngagement()
  }
  if (sc === 1 && isNew) {
    searchParams.set('_fv', '1')
  }

  if (eventName === 'page_view') {
    incrementSessionPageViewCount()
  }

  if (!sessionEngaged && (
    peekSessionEngagementMs() >= ENGAGED_SESSION_THRESHOLD_MS ||
    getSessionPageViewCount() >= 2
  )) {
    setSessionEngaged(true)
  }
  if (sessionEngaged) {
    searchParams.set('seg', '1')
  }

  if (eventName === 'user_engagement') {
    const engagementMs = getAndResetEngagementMs()
    if (engagementMs > 0) {
      searchParams.set('_et', String(engagementMs))
    }
  } else {
    const engagementMs = peekEngagementMs()
    if (engagementMs > 0) {
      searchParams.set('_et', String(engagementMs))
    }
  }

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'number') {
        searchParams.set(`epn.${key}`, String(value))
      } else {
        searchParams.set(`ep.${key}`, String(value))
      }
    }
  }

  for (const [key, value] of Object.entries(userProperties)) {
    searchParams.set(`up.${key}`, value)
  }

  if (userId) {
    searchParams.set('uid', userId)
  }

  if (utmParams.utm_source) searchParams.set('cs', utmParams.utm_source)
  if (utmParams.utm_medium) searchParams.set('cm', utmParams.utm_medium)
  if (utmParams.utm_campaign) searchParams.set('cn', utmParams.utm_campaign)
  if (utmParams.utm_term) searchParams.set('ck', utmParams.utm_term)
  if (utmParams.utm_content) searchParams.set('cc', utmParams.utm_content)

  const encoded = btoa(searchParams.toString())
  const url = `${PROXY_PATH}?d=${encodeURIComponent(encoded)}`

  if (navigator.sendBeacon) {
    navigator.sendBeacon(url)
  } else {
    fetch(url, { method: 'POST', keepalive: true, signal: AbortSignal.timeout(5_000) }).catch((err) => {
      logger.error('[analytics] beacon delivery failed:', err)
    })
  }
}

export function dispatchAnalyticsEvent(eventName: string, params?: AnalyticsEventParams) {
  sendToUmami(eventName, params)

  if (!gtagDecided) {
    pendingEvents.push({ name: eventName, params })
    return
  }

  if (gtagAvailable) {
    sendViaGtag(eventName, params)
    return
  }

  sendViaProxy(eventName, params)
}

export function loadAnalyticsProviders() {
  if (gtagMeasurementId) loadGtagScript()
  if (umamiWebsiteId) loadUmamiScript()
}

export function syncAnalyticsUserId() {
  if (gtagAvailable && window.gtag && realMeasurementId && userId) {
    window.gtag('config', realMeasurementId, { user_id: userId })
  }
}

export function syncAnalyticsUserProperties(props: Record<string, string>) {
  if (gtagAvailable && window.gtag) {
    window.gtag('set', 'user_properties', props)
  }
}

export function resetAnalyticsProviderState() {
  gtagAvailable = false
  gtagDecided = false
  pendingEvents = []
  setRealMeasurementId('')
}
