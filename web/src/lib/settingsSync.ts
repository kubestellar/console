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
  STORAGE_KEY_CUSTOM_THEMES,
  STORAGE_KEY_ACCESSIBILITY,
  STORAGE_KEY_GITHUB_TOKEN,
  STORAGE_KEY_GITHUB_TOKEN_SOURCE,
  STORAGE_KEY_FEEDBACK_GITHUB_TOKEN,
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
  [STORAGE_KEY_GITHUB_TOKEN]: 'githubToken',
  [STORAGE_KEY_FEEDBACK_GITHUB_TOKEN]: 'feedbackGithubToken',
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

  // Custom marketplace themes (JSON array of full theme objects).
  // Corrupted data is ignored; the array will be repopulated on the next successful install.
  const customThemes = localStorage.getItem(STORAGE_KEY_CUSTOM_THEMES)
  if (customThemes) {
    try {
      const parsed = JSON.parse(customThemes)
      if (Array.isArray(parsed) && parsed.length > 0) result.customThemes = parsed
    } catch { /* corrupted data — skip and let the next save overwrite */ }
  }

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

  // GitHub token source ("settings" or "env")
  const githubTokenSource = localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN_SOURCE)
  if (githubTokenSource === 'settings' || githubTokenSource === 'env') {
    result.githubTokenSource = githubTokenSource
  }

  // Feedback GitHub token (base64 encoded in localStorage)
  const feedbackGithubToken = localStorage.getItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN)
  if (feedbackGithubToken) {
    try { result.feedbackGithubToken = atob(feedbackGithubToken) } catch { result.feedbackGithubToken = feedbackGithubToken }
  }

  // Feedback GitHub token source ("settings" or "env")
  const feedbackGithubTokenSource = localStorage.getItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_SOURCE)
  if (feedbackGithubTokenSource === 'settings' || feedbackGithubTokenSource === 'env') {
    result.feedbackGithubTokenSource = feedbackGithubTokenSource
  }

  // Notification config (JSON)
  const notifications = localStorage.getItem(STORAGE_KEY_NOTIFICATION_CONFIG)
  if (notifications) {
    try { result.notifications = JSON.parse(notifications) } catch { /* skip */ }
  }

  // Tour completed (plain string 'true'/'false')
  const tourCompleted = localStorage.getItem(STORAGE_KEY_TOUR_COMPLETED)
  if (tourCompleted !== null) result.tourCompleted = tourCompleted === 'true'

  // Stat block configs — collect all *-stats-config keys from localStorage
  const statBlockConfigs: Record<string, unknown[]> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.endsWith('-stats-config')) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || '')
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

  // Restore custom marketplace themes and notify theme-aware components.
  // If the write fails (e.g. localStorage full), themes remain unavailable until the
  // next successful sync — the same state as before the restore attempt.
  if (Array.isArray(settings.customThemes) && settings.customThemes.length > 0) {
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM_THEMES, JSON.stringify(settings.customThemes))
      window.dispatchEvent(new Event('kc-custom-themes-changed'))
    } catch { /* localStorage unavailable — themes will reappear on next successful sync */ }
  }

  if (settings.accessibility) {
    localStorage.setItem(STORAGE_KEY_ACCESSIBILITY, JSON.stringify(settings.accessibility))
  }

  if (settings.githubToken) {
    localStorage.setItem(STORAGE_KEY_GITHUB_TOKEN, btoa(settings.githubToken))
  }

  // Persist token source so the UI can show a badge for env-sourced tokens
  if (settings.githubTokenSource) {
    localStorage.setItem(STORAGE_KEY_GITHUB_TOKEN_SOURCE, settings.githubTokenSource)
  }

  if (settings.feedbackGithubToken) {
    localStorage.setItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN, btoa(settings.feedbackGithubToken))
  } else {
    // Remove stale entries when the token is cleared/absent from backend settings
    localStorage.removeItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN)
  }
  if (settings.feedbackGithubTokenSource) {
    localStorage.setItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_SOURCE, settings.feedbackGithubTokenSource)
  } else {
    localStorage.removeItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_SOURCE)
  }

  if (settings.notifications) {
    localStorage.setItem(STORAGE_KEY_NOTIFICATION_CONFIG, JSON.stringify(settings.notifications))
  }

  if (settings.tourCompleted !== undefined) {
    localStorage.setItem(STORAGE_KEY_TOUR_COMPLETED, String(settings.tourCompleted))
  }

  // Restore stat block configs
  if (settings.statBlockConfigs) {
    for (const [key, value] of Object.entries(settings.statBlockConfigs)) {
      if (Array.isArray(value)) {
        try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* skip */ }
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
  const present = criticalKeys.filter(k => localStorage.getItem(k) !== null)
  // If fewer than 2 settings are present, consider it empty
  return present.length < 2
}
