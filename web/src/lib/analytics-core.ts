/**
 * analytics-core.ts
 *
 * Thin barrel preserving the existing analytics-core public API while the
 * implementation lives in focused sub-modules.
 */

export { initialized, userProperties } from './analytics-core-state'
export { send, emitUserEngagement } from './analytics-dispatch'
export {
  captureUtmParams,
  initAnalytics,
  emitPageView,
  setAnalyticsUserId,
  setAnalyticsUserProperties,
  updateAnalyticsIds,
  _resetAnalyticsState,
} from './analytics-engine'
export { isAnalyticsOptedOut, setAnalyticsOptOut } from './analytics-consent'
export {
  __testables,
  _resetCapturedApiCalls,
  _resetCapturedErrors,
  _resetErrorThrottles,
  emitChunkReloadRecoveryFailed,
  emitError,
  emitHttpError,
  getRecentBrowserErrors,
  getRecentFailedApiCalls,
  markErrorReported,
  startGlobalErrorTracking,
  stopGlobalErrorTracking,
} from './analytics-errors'
export type { EmitErrorExtra } from './analytics-types'
