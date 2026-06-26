import { send } from '../analytics-core'

// ── Tour ───────────────────────────────────────────────────────────

export function emitTourStarted() {
  send('ksc_tour_started')
}

export function emitTourCompleted(stepCount: number) {
  send('ksc_tour_completed', { step_count: stepCount })
}

export function emitTourSkipped(atStep: number) {
  send('ksc_tour_skipped', { at_step: atStep })
}

// ── Settings ────────────────────────────────────────────────────

export function emitThemeChanged(themeId: string, source: string) {
  send('ksc_theme_changed', { theme_id: themeId, source })
}

export function emitLanguageChanged(langCode: string) {
  send('ksc_language_changed', { language: langCode })
}

export function emitAIModeChanged(mode: string) {
  send('ksc_ai_mode_changed', { mode })
}

export function emitAIPredictionsToggled(enabled: boolean) {
  send('ksc_ai_predictions_toggled', { enabled: String(enabled) })
}

export function emitConfidenceThresholdChanged(value: number) {
  send('ksc_confidence_threshold_changed', { threshold: value })
}

export function emitConsensusModeToggled(enabled: boolean) {
  send('ksc_consensus_mode_toggled', { enabled: String(enabled) })
}

// ── Updates ─────────────────────────────────────────────────────

export function emitUpdateChecked() {
  send('ksc_update_checked')
}

export function emitUpdateTriggered() {
  send('ksc_update_triggered')
}

export function emitUpdateCompleted(durationMs: number) {
  send('ksc_update_completed', { duration_ms: durationMs })
}

export function emitUpdateFailed(error: string) {
  send('ksc_update_failed', { error_detail: error.slice(0, 100) })
}

export function emitUpdateRefreshed() {
  send('ksc_update_refreshed')
}

export function emitUpdateStalled() {
  send('ksc_update_stalled')
}

// ── What's New ──────────────────────────────────────────────────

export function emitWhatsNewModalOpened(tag: string) {
  send('ksc_whats_new_modal_opened', { release_tag: tag })
}

export function emitWhatsNewUpdateClicked(tag: string, installMethod: string) {
  send('ksc_whats_new_update_clicked', { release_tag: tag, install_method: installMethod })
}

export function emitWhatsNewRemindLater(tag: string, duration: string) {
  send('ksc_whats_new_remind_later', { release_tag: tag, snooze_duration: duration })
}
