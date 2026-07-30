import { isOptedOut, peekEngagementMs } from './analytics-session'
import type { AnalyticsEventParams, SendOptions } from './analytics-types'
import { initialized, userHasInteracted } from './analytics-core-state'
import { dispatchAnalyticsEvent } from './analytics-providers'

export function send(
  eventName: string,
  params?: AnalyticsEventParams,
  options?: SendOptions,
) {
  if (!initialized) return
  if (isOptedOut() && !options?.bypassOptOut) return
  if (!userHasInteracted) return

  dispatchAnalyticsEvent(eventName, params)
}

export function emitUserEngagement() {
  if (peekEngagementMs() > 0) {
    send('user_engagement', {})
  }
}
