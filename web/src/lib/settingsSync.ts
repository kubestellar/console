/**
 * Bidirectional mapping between localStorage keys and the persistent settings structure.
 * Used by usePersistedSettings to collect and restore settings.
 */

import type { AllSettings } from './settingsTypes'
import {
  STORAGE_KEY_AI_MODE,
  STORAGE_KEY_PREDICTION_SETTINGS,
  STORAGE_KEY_TOKEN_SETTINGS,
  STORAGE_KEY_THEME,
  STORAGE_KEY_ACCESSIBILITY,
  STORAGE_KEY_GITHUB_TOKEN,
  STORAGE_KEY_NOTIFICATION_CONFIG,
  STORAGE_KEY_TOUR_COMPLETED,
} from './constants'

// Event dispatched by individual hooks when they write to localStorage
export const SETTINGS_CHANGED_EVENT = 'kubestellar-settings-changed'

// Event dispatched when settings are restored from the backend file
export const SETTINGS_RESTORED_EVENT = 'kubestellar-settings-restored'

// localStorage key → AllSettings field mapping
const LS_KEYS = {
  [STORAGE_KEY_AI_MODE]: 'aiMode',
  [STORAGE_KEY_PREDICTION_SETTINGS]: 'predictions',
  [STORAGE_KEY_TOKEN_SETTINGS]: 'tokenUsage',
  [STORAGE_KEY_THEME]: 'theme',
  [STORAGE_KEY_ACCESSIBILITY]: 'accessibility',
  [STORAGE_KEY_GITHUB_TOKEN]: 'githubToken',
  [STORAGE_KEY_NOTIFICATION_CONFIG]: 'notifications',
  [STORAGE_KEY_TOUR_COMPLETED]: 'tourCompleted',
} as const

/**
 * Collect current settings from localStorage into an AllSettings partial.
 * JSON fields are parsed; the GitHub token is decoded from base64.
 */
export function collectFromLocalStorage(): Partial<AllSettings> {
  const result: Partial<AllSettings> = {}

  // AI mode (plain string)
  const aiMode = localStorage.getItem(STORAGE_KEY_AI_MODE)
  if (aiMode) result.aiMode = aiMode

  // Prediction settings (JSON)
  const predictions = localStorage.getItem(STORAGE_KEY_PREDICTION_SETTINGS)
  if (predictions) {
    try { result.predictions = JSON.parse(predictions) } catch { /* skip */ }
  }

  // Token usage settings (JSON)
  const tokenUsage = localStorage.getItem(STORAGE_KEY_TOKEN_SETTINGS)
  if (tokenUsage) {
    try { result.tokenUsage = JSON.parse(tokenUsage) } catch { /* skip */ }
  }

  // Theme (plain string)
  const theme = localStorage.getItem(STORAGE_KEY_THEME)
  if (theme) result.theme = theme

  // Accessibility (JSON)
  const accessibility = localStorage.getItem(STORAGE_KEY_ACCESSIBILITY)
  if (accessibility) {
    try { result.accessibility = JSON.parse(accessibility) } catch { /* skip */ }
  }

  // GitHub token (base64 encoded in localStorage)
  const githubToken = localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN)
  if (githubToken) {
    try { result.githubToken = atob(githubToken) } catch { result.githubToken = githubToken }
  }

  // Notification config (JSON)
  const notifications = localStorage.getItem(STORAGE_KEY_NOTIFICATION_CONFIG)
  if (notifications) {
    try { result.notifications = JSON.parse(notifications) } catch { /* skip */ }
  }

  // Tour completed (plain string 'true'/'false')
  const tourCompleted = localStorage.getItem(STORAGE_KEY_TOUR_COMPLETED)
  if (tourCompleted !== null) result.tourCompleted = tourCompleted === 'true'

  return result
}

/**
 * Restore settings from an AllSettings object back into localStorage.
 * After writing, dispatches the SETTINGS_RESTORED_EVENT so hooks re-read.
 */
export function restoreToLocalStorage(settings: AllSettings): void {
  if (settings.aiMode) {
    localStorage.setItem(STORAGE_KEY_AI_MODE, settings.aiMode)
  }

  if (settings.predictions) {
    localStorage.setItem(STORAGE_KEY_PREDICTION_SETTINGS, JSON.stringify(settings.predictions))
  }

  if (settings.tokenUsage) {
    localStorage.setItem(STORAGE_KEY_TOKEN_SETTINGS, JSON.stringify(settings.tokenUsage))
  }

  if (settings.theme) {
    localStorage.setItem(STORAGE_KEY_THEME, settings.theme)
  }

  if (settings.accessibility) {
    localStorage.setItem(STORAGE_KEY_ACCESSIBILITY, JSON.stringify(settings.accessibility))
  }

  if (settings.githubToken) {
    localStorage.setItem(STORAGE_KEY_GITHUB_TOKEN, btoa(settings.githubToken))
  }

  if (settings.notifications) {
    localStorage.setItem(STORAGE_KEY_NOTIFICATION_CONFIG, JSON.stringify(settings.notifications))
  }

  if (settings.tourCompleted !== undefined) {
    localStorage.setItem(STORAGE_KEY_TOUR_COMPLETED, String(settings.tourCompleted))
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
