import { describe, it, expect } from 'vitest'
import type {
  PredictionSettingsData,
  TokenUsageSettingsData,
  AccessibilitySettingsData,
  APIKeyEntry,
  NotificationSecrets,
  AllSettings,
} from '../settingsTypes'

describe('settingsTypes', () => {
  describe('PredictionSettingsData', () => {
    it('can create a valid prediction settings object', () => {
      const settings: PredictionSettingsData = {
        aiEnabled: true,
        interval: 30,
        minConfidence: 0.7,
        maxPredictions: 10,
        consensusMode: false,
        thresholds: {
          highRestartCount: 5,
          cpuPressure: 90,
          memoryPressure: 85,
          gpuMemoryPressure: 95,
        },
      }
      expect(settings.aiEnabled).toBe(true)
      expect(settings.thresholds.cpuPressure).toBe(90)
    })

    it('thresholds are numeric values', () => {
      const settings: PredictionSettingsData = {
        aiEnabled: false,
        interval: 60,
        minConfidence: 0.5,
        maxPredictions: 5,
        consensusMode: true,
        thresholds: {
          highRestartCount: 3,
          cpuPressure: 80,
          memoryPressure: 75,
          gpuMemoryPressure: 90,
        },
      }
      expect(typeof settings.thresholds.highRestartCount).toBe('number')
      expect(typeof settings.thresholds.gpuMemoryPressure).toBe('number')
    })
  })

  describe('TokenUsageSettingsData', () => {
    it('has all threshold levels', () => {
      const settings: TokenUsageSettingsData = {
        limit: 100000,
        warningThreshold: 80000,
        criticalThreshold: 90000,
        stopThreshold: 100000,
      }
      expect(settings.warningThreshold).toBeLessThan(settings.criticalThreshold)
      expect(settings.criticalThreshold).toBeLessThanOrEqual(settings.stopThreshold)
    })
  })

  describe('AccessibilitySettingsData', () => {
    it('supports all accessibility modes', () => {
      const settings: AccessibilitySettingsData = {
        colorBlindMode: true,
        reduceMotion: true,
        highContrast: false,
      }
      expect(settings.colorBlindMode).toBe(true)
      expect(settings.reduceMotion).toBe(true)
      expect(settings.highContrast).toBe(false)
    })
  })

  describe('AllSettings', () => {
    it('can create a full AllSettings object', () => {
      const settings: AllSettings = {
        aiMode: 'auto',
        predictions: {
          aiEnabled: true,
          interval: 30,
          minConfidence: 0.5,
          maxPredictions: 10,
          consensusMode: false,
          thresholds: { highRestartCount: 5, cpuPressure: 90, memoryPressure: 85, gpuMemoryPressure: 95 },
        },
        tokenUsage: { limit: 100000, warningThreshold: 80000, criticalThreshold: 90000, stopThreshold: 100000 },
        theme: 'kubestellar',
        accessibility: { colorBlindMode: false, reduceMotion: false, highContrast: false },
        profile: { email: 'test@example.com', slack_id: 'U123' },
        widget: { selectedWidget: 'default' },
        tourCompleted: false,
        apiKeys: {},
        notifications: {},
      }
      expect(settings.theme).toBe('kubestellar')
      expect(settings.apiKeys).toEqual({})
    })

    it('supports optional feedbackGithubToken field', () => {
      const settings: AllSettings = {
        aiMode: 'auto',
        predictions: {
          aiEnabled: false, interval: 60, minConfidence: 0.5, maxPredictions: 5, consensusMode: false,
          thresholds: { highRestartCount: 5, cpuPressure: 90, memoryPressure: 85, gpuMemoryPressure: 95 },
        },
        tokenUsage: { limit: 50000, warningThreshold: 40000, criticalThreshold: 45000, stopThreshold: 50000 },
        theme: 'dracula',
        accessibility: { colorBlindMode: false, reduceMotion: false, highContrast: false },
        profile: { email: '', slack_id: '' },
        widget: { selectedWidget: 'default' },
        tourCompleted: true,
        apiKeys: { openai: { apiKey: 'sk-test', model: 'gpt-4' } },
        notifications: { slackWebhookUrl: 'https://hooks.slack.com/test' },
        feedbackGithubToken: 'ghp_123',
        feedbackGithubTokenSource: 'settings',
      }
      expect(settings.feedbackGithubToken).toBe('ghp_123')
      expect(settings.feedbackGithubTokenSource).toBe('settings')
    })

    it('supports customThemes optional field', () => {
      const settings: Partial<AllSettings> = {
        customThemes: [{ id: 'custom-1', name: 'Custom' }],
      }
      expect(settings.customThemes).toHaveLength(1)
    })

    it('supports statBlockConfigs optional field', () => {
      const settings: Partial<AllSettings> = {
        statBlockConfigs: {
          dashboard: [{ id: 'clusters', visible: true }],
        },
      }
      expect(settings.statBlockConfigs?.dashboard).toHaveLength(1)
    })
  })

  describe('APIKeyEntry', () => {
    it('supports minimal entry with just apiKey', () => {
      const entry: APIKeyEntry = { apiKey: 'test-key' }
      expect(entry.apiKey).toBe('test-key')
      expect(entry.model).toBeUndefined()
    })

    it('supports entry with model', () => {
      const entry: APIKeyEntry = { apiKey: 'test-key', model: 'claude-3-opus' }
      expect(entry.model).toBe('claude-3-opus')
    })
  })

  describe('NotificationSecrets', () => {
    it('supports Slack configuration', () => {
      const secrets: NotificationSecrets = {
        slackWebhookUrl: 'https://hooks.slack.com/xxx',
        slackChannel: '#alerts',
      }
      expect(secrets.slackWebhookUrl).toContain('slack.com')
    })

    it('supports email configuration', () => {
      const secrets: NotificationSecrets = {
        emailSMTPHost: 'smtp.example.com',
        emailSMTPPort: 587,
        emailFrom: 'noreply@example.com',
        emailTo: 'admin@example.com',
        emailUsername: 'user',
        emailPassword: 'pass',
      }
      expect(secrets.emailSMTPPort).toBe(587)
    })
  })
})
