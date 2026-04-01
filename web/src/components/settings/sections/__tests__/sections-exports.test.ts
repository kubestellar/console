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

const EXPECTED_EXPORTS = [
  { name: 'AISettingsSection', component: AISettingsSection },
  { name: 'ProfileSection', component: ProfileSection },
  { name: 'AgentSection', component: AgentSection },
  { name: 'GitHubTokenSection', component: GitHubTokenSection },
  { name: 'TokenUsageSection', component: TokenUsageSection },
  { name: 'ThemeSection', component: ThemeSection },
  { name: 'AccessibilitySection', component: AccessibilitySection },
  { name: 'PermissionsSection', component: PermissionsSection },
  { name: 'PredictionSettingsSection', component: PredictionSettingsSection },
  { name: 'WidgetSettingsSection', component: WidgetSettingsSection },
  { name: 'NotificationSettingsSection', component: NotificationSettingsSection },
  { name: 'PersistenceSection', component: PersistenceSection },
  { name: 'LocalClustersSection', component: LocalClustersSection },
  { name: 'SettingsBackupSection', component: SettingsBackupSection },
  { name: 'AnalyticsSection', component: AnalyticsSection },
]

describe('Settings sections exports', () => {
  it.each(EXPECTED_EXPORTS)('exports $name', ({ component }) => {
    expect(component).toBeDefined()
    expect(typeof component).toBe('function')
  })
})
