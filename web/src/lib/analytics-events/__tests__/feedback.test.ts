import { describe, expect, it, mockSend, emitFeedbackSubmitted, emitLinkedInShare, emitNPSDismissed, emitNPSResponse, emitNPSSurveyShown, emitPredictionFeedbackSubmitted, emitScreenshotAttached, emitScreenshotUploadFailed, emitScreenshotUploadSuccess } from './analytics-events.shared'

describe('analytics-events/feedback', () => {
  it('emitFeedbackSubmitted sends feedback_type', () => {
    emitFeedbackSubmitted('bug')
    expect(mockSend).toHaveBeenCalledWith('ksc_feedback_submitted', { feedback_type: 'bug' })
  })

  it('emitScreenshotAttached sends method and count', () => {
    emitScreenshotAttached('paste', 2)
    expect(mockSend).toHaveBeenCalledWith('ksc_screenshot_attached', { method: 'paste', count: 2 })
  })

  it('emitScreenshotUploadFailed truncates error and sends screenshot_count', () => {
    const longErr = 'x'.repeat(150)
    emitScreenshotUploadFailed(longErr, 1)
    const payload = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect((payload.error as string).length).toBeLessThanOrEqual(100)
    expect(payload.screenshot_count).toBe(1)
  })

  it('emitScreenshotUploadSuccess sends screenshot_count', () => {
    emitScreenshotUploadSuccess(3)
    expect(mockSend).toHaveBeenCalledWith('ksc_screenshot_upload_success', { screenshot_count: 3 })
  })

  it('emitNPSSurveyShown passes bypassOptOut: true', () => {
    emitNPSSurveyShown()
    expect(mockSend).toHaveBeenCalledWith('ksc_nps_survey_shown', undefined, { bypassOptOut: true })
  })

  it('emitNPSResponse sends score, category, and feedback_length', () => {
    emitNPSResponse(9, 'promoter', 50)
    expect(mockSend).toHaveBeenCalledWith(
      'ksc_nps_response',
      expect.objectContaining({ nps_score: 9, nps_category: 'promoter', nps_feedback_length: 50 }),
      { bypassOptOut: true }
    )
  })

  it('emitNPSResponse omits feedback_length when undefined', () => {
    emitNPSResponse(5, 'passive')
    const payload = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('nps_feedback_length')
  })

  it('emitNPSDismissed sends dismiss_count', () => {
    emitNPSDismissed(2)
    expect(mockSend).toHaveBeenCalledWith('ksc_nps_dismissed', { dismiss_count: 2 }, { bypassOptOut: true })
  })

  it('emitLinkedInShare sends source', () => {
    emitLinkedInShare('dashboard')
    expect(mockSend).toHaveBeenCalledWith('ksc_linkedin_share', { source: 'dashboard' })
  })

  it('emitPredictionFeedbackSubmitted sends feedback, prediction_type, provider', () => {
    emitPredictionFeedbackSubmitted('thumbs-up', 'anomaly', 'openai')
    expect(mockSend).toHaveBeenCalledWith('ksc_prediction_feedback', {
      feedback: 'thumbs-up',
      prediction_type: 'anomaly',
      provider: 'openai',
    })
  })

  it('emitPredictionFeedbackSubmitted defaults provider to "unknown"', () => {
    emitPredictionFeedbackSubmitted('thumbs-down', 'anomaly')
    expect(mockSend).toHaveBeenCalledWith('ksc_prediction_feedback', {
      feedback: 'thumbs-down',
      prediction_type: 'anomaly',
      provider: 'unknown',
    })
  })
})

