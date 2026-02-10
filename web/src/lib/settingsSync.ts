/**
 * Bidirectional mapping between localStorage keys and the persistent settings structure.
 * Used by usePersistedSettings to collect and restore settings.
 */

import type { AllSettings } from './settingsTypes'

// Event dispatched by individual hooks when they write to localStorage
export const SETTINGS_CHANGED_EVENT = 'kubestellar-settings-changed'

// Event dispatched when settings are restored from the backend file
export const SETTINGS_RESTORED_EVENT = 'kubestellar-settings-restored'

// localStorage key → AllSettings field mapping
const LS_KEYS = {
  'kubestellar-ai-mode': 'aiMode',
  'kubestellar-prediction-settings': 'predictions',
  'kubestellar-token-settings': 'tokenUsage',
  'kubestellar-theme-id': 'theme',
  'accessibility-settings': 'accessibility',
  'github_token': 'githubToken',
  'kc_notification_config': 'notifications',
} as const

/**
 * Collect current settings from localStorage into an AllSettings partial.
 * JSON fields are parsed; the GitHub token is decoded from base64.
 */
export function collectFromLocalStorage(): Partial<AllSettings> {
  const result: Partial<AllSettings> = {}

  // AI mode (plain string)
  const aiMode = localStorage.getItem('kubestellar-ai-mode')
  if (aiMode) result.aiMode = aiMode

  // Prediction settings (JSON)
  const predictions = localStorage.getItem('kubestellar-prediction-settings')
  if (predictions) {
    try { result.predictions = JSON.parse(predictions) } catch { /* skip */ }
  }

  // Token usage settings (JSON)
  const tokenUsage = localStorage.getItem('kubestellar-token-settings')
  if (tokenUsage) {
    try { result.tokenUsage = JSON.parse(tokenUsage) } catch { /* skip */ }
  }

  // Theme (plain string)
  const theme = localStorage.getItem('kubestellar-theme-id')
  if (theme) result.theme = theme

  // Accessibility (JSON)
  const accessibility = localStorage.getItem('accessibility-settings')
  if (accessibility) {
    try { result.accessibility = JSON.parse(accessibility) } catch { /* skip */ }
  }

  // GitHub token (base64 encoded in localStorage)
  const githubToken = localStorage.getItem('github_token')
  if (githubToken) {
    try { result.githubToken = atob(githubToken) } catch { result.githubToken = githubToken }
  }

  // Notification config (JSON)
  const notifications = localStorage.getItem('kc_notification_config')
  if (notifications) {
    try { result.notifications = JSON.parse(notifications) } catch { /* skip */ }
  }

  return result
}

/**
 * Restore settings from an AllSettings object back into localStorage.
 * After writing, dispatches the SETTINGS_RESTORED_EVENT so hooks re-read.
 */
export function restoreToLocalStorage(settings: AllSettings): void {
  if (settings.aiMode) {
    localStorage.setItem('kubestellar-ai-mode', settings.aiMode)
  }

  if (settings.predictions) {
    localStorage.setItem('kubestellar-prediction-settings', JSON.stringify(settings.predictions))
  }

  if (settings.tokenUsage) {
    localStorage.setItem('kubestellar-token-settings', JSON.stringify(settings.tokenUsage))
  }

  if (settings.theme) {
    localStorage.setItem('kubestellar-theme-id', settings.theme)
  }

  if (settings.accessibility) {
    localStorage.setItem('accessibility-settings', JSON.stringify(settings.accessibility))
  }

  if (settings.githubToken) {
    localStorage.setItem('github_token', btoa(settings.githubToken))
  }

  if (settings.notifications) {
    localStorage.setItem('kc_notification_config', JSON.stringify(settings.notifications))
  }

  // Notify hooks to re-read from localStorage
  window.dispatchEvent(new Event(SETTINGS_RESTORED_EVENT))
}

/**
 * Check if key settings are missing from localStorage (likely a cache clear).
 * Returns true if the most common settings keys are absent.
 */
export function isLocalStorageEmpty(): boolean {
  const criticalKeys = Object.keys(LS_KEYS)
  const present = criticalKeys.filter(k => localStorage.getItem(k) !== null)
  // If fewer than 2 settings are present, consider it empty
  return present.length < 2
}
