import { describe, expect, it, mockSend, emitAIModeChanged, emitAIPredictionsToggled, emitConfidenceThresholdChanged, emitConsensusModeToggled, emitLanguageChanged, emitThemeChanged, emitTourCompleted, emitTourSkipped, emitTourStarted, emitUpdateChecked, emitUpdateCompleted, emitUpdateFailed, emitUpdateRefreshed, emitUpdateStalled, emitUpdateTriggered, emitWhatsNewModalOpened, emitWhatsNewRemindLater, emitWhatsNewUpdateClicked } from './analytics-events.shared'

describe('analytics-events/settings', () => {
  it('emitTourStarted sends ksc_tour_started', () => {
    emitTourStarted()
    expect(mockSend).toHaveBeenCalledWith('ksc_tour_started')
  })

  it('emitTourCompleted sends step_count', () => {
    emitTourCompleted(5)
    expect(mockSend).toHaveBeenCalledWith('ksc_tour_completed', { step_count: 5 })
  })

  it('emitTourSkipped sends at_step', () => {
    emitTourSkipped(3)
    expect(mockSend).toHaveBeenCalledWith('ksc_tour_skipped', { at_step: 3 })
  })

  it('emitThemeChanged sends theme_id and source', () => {
    emitThemeChanged('dracula', 'settings')
    expect(mockSend).toHaveBeenCalledWith('ksc_theme_changed', { theme_id: 'dracula', source: 'settings' })
  })

  it('emitLanguageChanged sends language', () => {
    emitLanguageChanged('en')
    expect(mockSend).toHaveBeenCalledWith('ksc_language_changed', { language: 'en' })
  })

  it('emitAIModeChanged sends mode', () => {
    emitAIModeChanged('auto')
    expect(mockSend).toHaveBeenCalledWith('ksc_ai_mode_changed', { mode: 'auto' })
  })

  it('emitAIPredictionsToggled sends enabled as string', () => {
    emitAIPredictionsToggled(true)
    expect(mockSend).toHaveBeenCalledWith('ksc_ai_predictions_toggled', { enabled: 'true' })
  })

  it('emitAIPredictionsToggled sends false as string', () => {
    emitAIPredictionsToggled(false)
    expect(mockSend).toHaveBeenCalledWith('ksc_ai_predictions_toggled', { enabled: 'false' })
  })

  it('emitConfidenceThresholdChanged sends threshold', () => {
    emitConfidenceThresholdChanged(0.75)
    expect(mockSend).toHaveBeenCalledWith('ksc_confidence_threshold_changed', { threshold: 0.75 })
  })

  it('emitConsensusModeToggled sends enabled as string', () => {
    emitConsensusModeToggled(true)
    expect(mockSend).toHaveBeenCalledWith('ksc_consensus_mode_toggled', { enabled: 'true' })
  })

  it('emitUpdateChecked sends ksc_update_checked', () => {
    emitUpdateChecked()
    expect(mockSend).toHaveBeenCalledWith('ksc_update_checked')
  })

  it('emitUpdateTriggered sends ksc_update_triggered', () => {
    emitUpdateTriggered()
    expect(mockSend).toHaveBeenCalledWith('ksc_update_triggered')
  })

  it('emitUpdateCompleted sends duration_ms', () => {
    emitUpdateCompleted(2500)
    expect(mockSend).toHaveBeenCalledWith('ksc_update_completed', { duration_ms: 2500 })
  })

  it('emitUpdateFailed truncates error to 100 chars', () => {
    const longError = 'e'.repeat(150)
    emitUpdateFailed(longError)
    expect(mockSend).toHaveBeenCalledWith('ksc_update_failed', { error_detail: 'e'.repeat(100) })
  })

  it('emitUpdateFailed preserves short errors', () => {
    emitUpdateFailed('network timeout')
    expect(mockSend).toHaveBeenCalledWith('ksc_update_failed', { error_detail: 'network timeout' })
  })

  it('emitUpdateRefreshed sends ksc_update_refreshed', () => {
    emitUpdateRefreshed()
    expect(mockSend).toHaveBeenCalledWith('ksc_update_refreshed')
  })

  it('emitUpdateStalled sends ksc_update_stalled', () => {
    emitUpdateStalled()
    expect(mockSend).toHaveBeenCalledWith('ksc_update_stalled')
  })

  it('emitWhatsNewModalOpened sends release_tag', () => {
    emitWhatsNewModalOpened('v0.25.0')
    expect(mockSend).toHaveBeenCalledWith('ksc_whats_new_modal_opened', { release_tag: 'v0.25.0' })
  })

  it('emitWhatsNewUpdateClicked sends release_tag and install_method', () => {
    emitWhatsNewUpdateClicked('v0.25.0', 'homebrew')
    expect(mockSend).toHaveBeenCalledWith('ksc_whats_new_update_clicked', {
      release_tag: 'v0.25.0',
      install_method: 'homebrew',
    })
  })

  it('emitWhatsNewRemindLater sends release_tag and snooze_duration', () => {
    emitWhatsNewRemindLater('v0.25.0', '1d')
    expect(mockSend).toHaveBeenCalledWith('ksc_whats_new_remind_later', {
      release_tag: 'v0.25.0',
      snooze_duration: '1d',
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// feedback.ts
// ─────────────────────────────────────────────────────────────────────────────
