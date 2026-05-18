import type { PendingRecoveryEvent } from './analytics-types'

export const DEFAULT_PROXY_MEASUREMENT_ID = 'G-0000000000'
export const DEFAULT_GTAG_MEASUREMENT_ID = 'G-PXWNVQ8D1T'
export const DEFAULT_UMAMI_WEBSITE_ID = '07111027-162f-4e37-a0bb-067b9d08b88a'

export const INTERACTION_GATE_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const

export let measurementId = ''
export let pageId = ''
export let userProperties: Record<string, string> = {}
export let userId = ''
export let initialized = false
export let userHasInteracted = false
export let analyticsScriptsLoaded = false
export let pendingRecoveryEvent: PendingRecoveryEvent | null = null
export let sessionEngaged = false
export let gtagMeasurementId = DEFAULT_GTAG_MEASUREMENT_ID
export let umamiWebsiteId = DEFAULT_UMAMI_WEBSITE_ID
export let realMeasurementId = ''

export function setMeasurementId(nextMeasurementId: string) {
  measurementId = nextMeasurementId
}

export function setPageId(nextPageId: string) {
  pageId = nextPageId
}

export function replaceUserProperties(nextUserProperties: Record<string, string>) {
  userProperties = nextUserProperties
}

export function mergeUserProperties(props: Record<string, string>) {
  userProperties = { ...userProperties, ...props }
}

export function setUserId(nextUserId: string) {
  userId = nextUserId
}

export function setInitialized(nextInitialized: boolean) {
  initialized = nextInitialized
}

export function setUserHasInteracted(nextUserHasInteracted: boolean) {
  userHasInteracted = nextUserHasInteracted
}

export function setAnalyticsScriptsLoaded(nextAnalyticsScriptsLoaded: boolean) {
  analyticsScriptsLoaded = nextAnalyticsScriptsLoaded
}

export function setPendingRecoveryEvent(event: PendingRecoveryEvent | null) {
  pendingRecoveryEvent = event
}

export function consumePendingRecoveryEvent(): PendingRecoveryEvent | null {
  const event = pendingRecoveryEvent
  pendingRecoveryEvent = null
  return event
}

export function setSessionEngaged(nextSessionEngaged: boolean) {
  sessionEngaged = nextSessionEngaged
}

export function setGtagMeasurementId(nextGtagMeasurementId: string) {
  gtagMeasurementId = nextGtagMeasurementId
}

export function setUmamiWebsiteId(nextUmamiWebsiteId: string) {
  umamiWebsiteId = nextUmamiWebsiteId
}

export function setRealMeasurementId(nextRealMeasurementId: string) {
  realMeasurementId = nextRealMeasurementId
}

export function resetAnalyticsCoreState() {
  measurementId = ''
  pageId = ''
  userProperties = {}
  userId = ''
  initialized = false
  userHasInteracted = false
  analyticsScriptsLoaded = false
  pendingRecoveryEvent = null
  sessionEngaged = false
  gtagMeasurementId = DEFAULT_GTAG_MEASUREMENT_ID
  umamiWebsiteId = DEFAULT_UMAMI_WEBSITE_ID
  realMeasurementId = ''
}
