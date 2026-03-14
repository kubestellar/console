/**
 * TypeScript types for the persistent settings system.
 * Mirrors the Go types in pkg/settings/types.go.
 */

export interface PredictionSettingsData {
  aiEnabled: boolean
  interval: number
  minConfidence: number
  maxPredictions: number
  consensusMode: boolean
  thresholds: {
    highRestartCount: number
    cpuPressure: number
    memoryPressure: number
    gpuMemoryPressure: number
  }
}

export interface TokenUsageSettingsData {
  limit: number
  warningThreshold: number
  criticalThreshold: number
  stopThreshold: number
}

export interface AccessibilitySettingsData {
  colorBlindMode: boolean
  reduceMotion: boolean
  highContrast: boolean
}

export interface ProfileSettingsData {
  email: string
  slackId: string
}

export interface WidgetSettingsData {
  selectedWidget: string
}

export interface APIKeyEntry {
  apiKey: string
  model?: string
}

export interface NotificationSecrets {
  slackWebhookUrl?: string
  slackChannel?: string
  emailSMTPHost?: string
  emailSMTPPort?: number
  emailFrom?: string
  emailTo?: string
  emailUsername?: string
  emailPassword?: string
}

/**
 * Combined decrypted settings sent to/from the backend.
 * Sensitive fields are encrypted at rest in ~/.kc/settings.json.
 */
export interface AllSettings {
  // Non-sensitive
  aiMode: string
  predictions: PredictionSettingsData
  tokenUsage: TokenUsageSettingsData
  theme: string
  /** Custom marketplace themes (full JSON objects, persisted alongside the theme ID) */
  customThemes?: Record<string, unknown>[]
  accessibility: AccessibilitySettingsData
  profile: ProfileSettingsData
  widget: WidgetSettingsData
  tourCompleted: boolean

  // Sensitive (decrypted in transit over localhost)
  apiKeys: Record<string, APIKeyEntry>
  githubToken: string
  feedbackGithubToken?: string
  notifications: NotificationSecrets

  /** Where the main GitHub token came from: "settings" (user UI), "env" (.env file), or undefined */
  githubTokenSource?: 'settings' | 'env'
  /** Where the feedback GitHub token came from: "settings" (user UI), "env" (.env file), or undefined */
  feedbackGithubTokenSource?: 'settings' | 'env'

  /** Per-dashboard stat block configurations (order, visibility, display mode) */
  statBlockConfigs?: Record<string, unknown[]>
}
