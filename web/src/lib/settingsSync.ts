/**
 * Bidirectional mapping between localStorage keys and the persistent settings structure.
 * Used by usePersistedSettings to collect and restore settings.
 */

import {
  safeGetItem,
  safeGetStorageLength,
  safeKey,
  safeRemoveItem,
  safeSetItem,
} from './utils/localStorage'
import type { AllSettings } from './settingsTypes'
import {
  STORAGE_KEY_AI_MODE,
  STORAGE_KEY_PREDICTION_SETTINGS,
  STORAGE_KEY_TOKEN_SETTINGS,
  STORAGE_KEY_THEME,
  STORAGE_KEY_CUSTOM_THEMES,
  STORAGE_KEY_ACCESSIBILITY,
  STORAGE_KEY_GITHUB_TOKEN,
  STORAGE_KEY_GITHUB_TOKEN_SOURCE,
  STORAGE_KEY_GITHUB_TOKEN_DISMISSED,
  STORAGE_KEY_FEEDBACK_GITHUB_TOKEN,
  STORAGE_KEY_HAS_FEEDBACK_GITHUB_TOKEN,
  STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_SOURCE,
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
  [STORAGE_KEY_CUSTOM_THEMES]: 'customThemes',
  [STORAGE_KEY_ACCESSIBILITY]: 'accessibility',
  [STORAGE_KEY_HAS_FEEDBACK_GITHUB_TOKEN]: 'hasFeedbackToken',
  [STORAGE_KEY_NOTIFICATION_CONFIG]: 'notifications',
  [STORAGE_KEY_TOUR_COMPLETED]: 'tourCompleted',
} as const

/**
 * Collect current settings from localStorage into an AllSettings partial.
 * JSON fields are parsed; GitHub token sync only stores a presence flag.
 */
export function collectFromLocalStorage(): Partial<AllSettings> {
  const result: Partial<AllSettings> = {}

  // AI mode (plain string)
  const aiMode = safeGetItem(STORAGE_KEY_AI_MODE)
  if (aiMode) result.aiMode = aiMode

  // Prediction settings (JSON)
  const predictions = safeGetItem(STORAGE_KEY_PREDICTION_SETTINGS)
  if (predictions) {
    try { result.predictions = JSON.parse(predictions) } catch { /* skip */ }
  }

  // Token usage settings (JSON)
  const tokenUsage = safeGetItem(STORAGE_KEY_TOKEN_SETTINGS)
  if (tokenUsage) {
    try { result.tokenUsage = JSON.parse(tokenUsage) } catch { /* skip */ }
  }

  // Theme (plain string)
  const theme = safeGetItem(STORAGE_KEY_THEME)
  if (theme) result.theme = theme

  // Custom marketplace themes (JSON array of full theme objects).
  // Corrupted data is ignored; the array will be repopulated on the next successful install.
  const customThemes = safeGetItem(STORAGE_KEY_CUSTOM_THEMES)
  if (customThemes) {
    try {
      const parsed = JSON.parse(customThemes)
      if (Array.isArray(parsed) && parsed.length > 0) result.customThemes = parsed
    } catch { /* corrupted data — skip and let the next save overwrite */ }
  }

  // Accessibility (JSON)
  const accessibility = safeGetItem(STORAGE_KEY_ACCESSIBILITY)
  if (accessibility) {
    try { result.accessibility = JSON.parse(accessibility) } catch { /* skip */ }
  }

  // Remove any legacy client-stored PAT immediately; only the presence flag remains.
  safeRemoveItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN)

  // GitHub token presence flag (actual token stays server-side)
  const hasFeedbackToken = safeGetItem(STORAGE_KEY_HAS_FEEDBACK_GITHUB_TOKEN)
  if (hasFeedbackToken === 'true' || hasFeedbackToken === 'false') {
    result.hasFeedbackToken = hasFeedbackToken === 'true'
  }

  // GitHub token source ("settings" or "env")
  const feedbackGithubTokenSource = safeGetItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_SOURCE)
  if (feedbackGithubTokenSource === 'settings' || feedbackGithubTokenSource === 'env') {
    result.feedbackGithubTokenSource = feedbackGithubTokenSource
  }

  // Notification config (JSON)
  const notifications = safeGetItem(STORAGE_KEY_NOTIFICATION_CONFIG)
  if (notifications) {
    try { result.notifications = JSON.parse(notifications) } catch { /* skip */ }
  }

  // Tour completed (plain string 'true'/'false')
  const tourCompleted = safeGetItem(STORAGE_KEY_TOUR_COMPLETED)
  if (tourCompleted !== null) result.tourCompleted = tourCompleted === 'true'

  // Stat block configs — collect all *-stats-config keys from localStorage
  const statBlockConfigs: Record<string, unknown[]> = {}
  const storageLength = safeGetStorageLength()
  for (let i = 0; i < storageLength; i++) {
    const key = safeKey(i)
    if (key && key.endsWith('-stats-config')) {
      try {
        const parsed = JSON.parse(safeGetItem(key) || '')
        if (Array.isArray(parsed)) statBlockConfigs[key] = parsed
      } catch { /* skip corrupted */ }
    }
  }
  if (Object.keys(statBlockConfigs).length > 0) {
    result.statBlockConfigs = statBlockConfigs
  }

  return result
}

/**
 * Restore settings from an AllSettings object back into localStorage.
 * After writing, dispatches the SETTINGS_RESTORED_EVENT so hooks re-read.
 */
export function restoreToLocalStorage(settings: AllSettings): void {
  if (settings.aiMode) {
    safeSetItem(STORAGE_KEY_AI_MODE, settings.aiMode)
  }

  if (settings.predictions) {
    safeSetItem(STORAGE_KEY_PREDICTION_SETTINGS, JSON.stringify(settings.predictions))
  }

  if (settings.tokenUsage) {
    safeSetItem(STORAGE_KEY_TOKEN_SETTINGS, JSON.stringify(settings.tokenUsage))
  }

  if (settings.theme) {
    safeSetItem(STORAGE_KEY_THEME, settings.theme)
  }

  // Restore custom marketplace themes and notify theme-aware components.
  // If the write fails (e.g. localStorage full), themes remain unavailable until the
  // next successful sync — the same state as before the restore attempt.
  if (Array.isArray(settings.customThemes) && settings.customThemes.length > 0) {
    const storedCustomThemes = safeSetItem(STORAGE_KEY_CUSTOM_THEMES, JSON.stringify(settings.customThemes))
    if (storedCustomThemes) {
      window.dispatchEvent(new Event('kc-custom-themes-changed'))
    }
  }

  if (settings.accessibility) {
    safeSetItem(STORAGE_KEY_ACCESSIBILITY, JSON.stringify(settings.accessibility))
  }

  // Clean up legacy token localStorage keys. Only presence metadata remains.
  safeRemoveItem(STORAGE_KEY_GITHUB_TOKEN)
  safeRemoveItem(STORAGE_KEY_GITHUB_TOKEN_SOURCE)
  safeRemoveItem(STORAGE_KEY_GITHUB_TOKEN_DISMISSED)
  safeRemoveItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN)

  if (settings.hasFeedbackToken !== undefined) {
    safeSetItem(STORAGE_KEY_HAS_FEEDBACK_GITHUB_TOKEN, String(settings.hasFeedbackToken))
  } else {
    safeRemoveItem(STORAGE_KEY_HAS_FEEDBACK_GITHUB_TOKEN)
  }
  if (settings.feedbackGithubTokenSource) {
    safeSetItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_SOURCE, settings.feedbackGithubTokenSource)
  } else {
    safeRemoveItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_SOURCE)
  }

  if (!settings.hasFeedbackToken) {
    safeRemoveItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_SOURCE)
  }

  if (settings.notifications) {
    safeSetItem(STORAGE_KEY_NOTIFICATION_CONFIG, JSON.stringify(settings.notifications))
  }

  if (settings.tourCompleted !== undefined) {
    safeSetItem(STORAGE_KEY_TOUR_COMPLETED, String(settings.tourCompleted))
  }

  // Restore stat block configs
  if (settings.statBlockConfigs) {
    for (const [key, value] of Object.entries(settings.statBlockConfigs)) {
      if (Array.isArray(value)) {
        safeSetItem(key, JSON.stringify(value))
      }
    }
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
  const present = criticalKeys.filter(k => safeGetItem(k) !== null)
  // If fewer than 2 settings are present, consider it empty
  return present.length < 2
}
