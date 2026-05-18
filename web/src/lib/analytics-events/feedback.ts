import { send } from '../analytics-core'

// Maximum length for error detail strings to avoid oversized payloads
const ERROR_DETAIL_MAX_LEN = 100

// ── Feedback ────────────────────────────────────────────────────────

export function emitFeedbackSubmitted(type: string) {
  send('ksc_feedback_submitted', { feedback_type: type })
}

export function emitScreenshotAttached(method: 'paste' | 'drop' | 'file_picker', count: number) {
  send('ksc_screenshot_attached', { method, count })
}

export function emitScreenshotUploadFailed(error: string, screenshotCount: number) {
  send('ksc_screenshot_upload_failed', { error: error.substring(0, ERROR_DETAIL_MAX_LEN), screenshot_count: screenshotCount })
}

export function emitScreenshotUploadSuccess(screenshotCount: number) {
  send('ksc_screenshot_upload_success', { screenshot_count: screenshotCount })
}

// ── NPS Survey ──────────

export function emitNPSSurveyShown() {
  send('ksc_nps_survey_shown', undefined, { bypassOptOut: true })
}

export function emitNPSResponse(score: number, category: string, feedbackLength?: number) {
  send('ksc_nps_response', {
    nps_score: score,
    nps_category: category,
    ...(feedbackLength !== undefined && { nps_feedback_length: feedbackLength }),
  }, { bypassOptOut: true })
}

export function emitNPSDismissed(dismissCount: number) {
  send('ksc_nps_dismissed', { dismiss_count: dismissCount }, { bypassOptOut: true })
}

// ── Loops Feedback ───────────────────────────────────

export function emitLinkedInShare(source: string) {
  send('ksc_linkedin_share', { source })
}

export function emitPredictionFeedbackSubmitted(feedback: string, predictionType: string, provider?: string) {
  send('ksc_prediction_feedback', { feedback, prediction_type: predictionType, provider: provider ?? 'unknown' })
}
