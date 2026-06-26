/**
 * Settings Sections Index Export Tests
 *
 * Validates that all settings section components are properly exported.
 */
import { describe, it, expect } from 'vitest'
import {
  AISettingsSection,
  ProfileSection,
  AgentSection,
  GitHubTokenSection,
  TokenUsageSection,
  ThemeSection,
  AccessibilitySection,
  PermissionsSection,
  PredictionSettingsSection,
  WidgetSettingsSection,
  NotificationSettingsSection,
  PersistenceSection,
  LocalClustersSection,
  SettingsBackupSection,
  AnalyticsSection,
} from '../index'

const sections: Record<string, unknown> = {
  AISettingsSection,
  ProfileSection,
  AgentSection,
  GitHubTokenSection,
  TokenUsageSection,
  ThemeSection,
  AccessibilitySection,
  PermissionsSection,
  PredictionSettingsSection,
  WidgetSettingsSection,
  NotificationSettingsSection,
  PersistenceSection,
  LocalClustersSection,
  SettingsBackupSection,
  AnalyticsSection,
}

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
    expect(sections[name]).toBeDefined()
    expect(typeof sections[name]).toBe('function')
  })
})
