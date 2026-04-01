/**
 * Settings Sections Index Export Tests
 *
 * Validates that all settings section components are properly exported.
 */
import { describe, it, expect } from 'vitest'
import * as sections from '../index'

const EXPECTED_EXPORTS = [
  'AISettingsSection',
  'ProfileSection',
  'AgentSection',
  'GitHubTokenSection',
  'TokenUsageSection',
  'ThemeSection',
  'AccessibilitySection',
  'PermissionsSection',
  'PredictionSettingsSection',
  'WidgetSettingsSection',
  'NotificationSettingsSection',
  'PersistenceSection',
  'LocalClustersSection',
  'SettingsBackupSection',
  'AnalyticsSection',
]

describe('Settings sections exports', () => {
  it.each(EXPECTED_EXPORTS)('exports %s', (name) => {
    expect((sections as Record<string, unknown>)[name]).toBeDefined()
    expect(typeof (sections as Record<string, unknown>)[name]).toBe('function')
  })
})
