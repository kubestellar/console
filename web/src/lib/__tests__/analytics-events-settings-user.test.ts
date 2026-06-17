import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../analytics-core', () => ({
  send: vi.fn(),
  setAnalyticsUserProperties: vi.fn(),
  emitError: vi.fn(),
}))

vi.mock('../demoMode', () => ({
  isDemoMode: vi.fn(() => false),
}))

vi.mock('../analytics-session', () => ({
  getDeploymentType: vi.fn(() => 'localhost'),
}))

import { send, setAnalyticsUserProperties, emitError } from '../analytics-core'
import { isDemoMode } from '../demoMode'
import { getDeploymentType } from '../analytics-session'
import { CAPABILITY_TOOL_EXEC, CAPABILITY_CHAT } from '../analytics-types'
import * as analytics from '../analytics-events'

const mockSend = vi.mocked(send)
const mockSetProps = vi.mocked(setAnalyticsUserProperties)
const mockEmitError = vi.mocked(emitError)
const mockIsDemoMode = vi.mocked(isDemoMode)
const mockGetDeploymentType = vi.mocked(getDeploymentType)

describe('analytics-events/settings user', () => {
  beforeEach(() => {
    mockSend.mockClear()
    mockSetProps.mockClear()
    mockEmitError.mockClear()
    mockIsDemoMode.mockClear()
    mockGetDeploymentType.mockClear()
    mockIsDemoMode.mockReturnValue(false)
    mockGetDeploymentType.mockReturnValue('localhost')
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('Auth', () => {
    it('analytics.emitLogin sends method', () => {
      analytics.emitLogin('github')
      expect(mockSend).toHaveBeenCalledWith('login', { method: 'github' })
    })

    it('analytics.emitLogout sends event', () => {
      analytics.emitLogout()
      expect(mockSend).toHaveBeenCalledWith('ksc_logout')
    })
  })

  describe('Errors', () => {
    it('analytics.emitSessionExpired sends event', () => {
      analytics.emitSessionExpired()
      expect(mockSend).toHaveBeenCalledWith('ksc_session_expired')
    })
  })

  describe('Theme & Language', () => {
    it('analytics.emitThemeChanged sends theme id and source', () => {
      analytics.emitThemeChanged('dark-plus', 'settings')
      expect(mockSend).toHaveBeenCalledWith('ksc_theme_changed', { theme_id: 'dark-plus', source: 'settings' })
    })

    it('analytics.emitLanguageChanged sends language code', () => {
      analytics.emitLanguageChanged('ja')
      expect(mockSend).toHaveBeenCalledWith('ksc_language_changed', { language: 'ja' })
    })
  })

  describe('AI Settings', () => {
    it('analytics.emitAIModeChanged sends mode', () => {
      analytics.emitAIModeChanged('high')
      expect(mockSend).toHaveBeenCalledWith('ksc_ai_mode_changed', { mode: 'high' })
    })

    it('analytics.emitAIPredictionsToggled sends enabled as string', () => {
      analytics.emitAIPredictionsToggled(true)
      expect(mockSend).toHaveBeenCalledWith('ksc_ai_predictions_toggled', { enabled: 'true' })
    })

    it('analytics.emitConfidenceThresholdChanged sends threshold value', () => {
      analytics.emitConfidenceThresholdChanged(0.85)
      expect(mockSend).toHaveBeenCalledWith('ksc_confidence_threshold_changed', { threshold: 0.85 })
    })

    it('analytics.emitConsensusModeToggled sends enabled as string', () => {
      analytics.emitConsensusModeToggled(false)
      expect(mockSend).toHaveBeenCalledWith('ksc_consensus_mode_toggled', { enabled: 'false' })
    })
  })

  describe('GitHub Token', () => {
    it('analytics.emitGitHubTokenConfigured sends event', () => {
      analytics.emitGitHubTokenConfigured()
      expect(mockSend).toHaveBeenCalledWith('ksc_github_token_configured')
    })

    it('analytics.emitGitHubTokenRemoved sends event', () => {
      analytics.emitGitHubTokenRemoved()
      expect(mockSend).toHaveBeenCalledWith('ksc_github_token_removed')
    })
  })

  describe('API Provider', () => {
    it('analytics.emitApiProviderConnected sends provider', () => {
      analytics.emitApiProviderConnected('openai')
      expect(mockSend).toHaveBeenCalledWith('ksc_api_provider_connected', { provider: 'openai' })
    })
  })

  describe('Demo Mode', () => {
    it('analytics.emitDemoModeToggled sends enabled and sets user property', () => {
      analytics.emitDemoModeToggled(true)
      expect(mockSend).toHaveBeenCalledWith('ksc_demo_mode_toggled', { enabled: 'true' })
      expect(mockSetProps).toHaveBeenCalledWith({ demo_mode: 'true' })
    })

    it('analytics.emitDemoModeToggled sends false and updates user property', () => {
      analytics.emitDemoModeToggled(false)
      expect(mockSend).toHaveBeenCalledWith('ksc_demo_mode_toggled', { enabled: 'false' })
      expect(mockSetProps).toHaveBeenCalledWith({ demo_mode: 'false' })
    })
  })

  describe('Session Context', () => {
    it('analytics.emitSessionContext sets user properties and fires session start event', () => {
      analytics.emitSessionContext('homebrew', 'stable')
      expect(mockSetProps).toHaveBeenCalledWith({
        install_method: 'homebrew',
        update_channel: 'stable',
      })
      expect(mockSend).toHaveBeenCalledWith('ksc_session_start', {
        install_method: 'homebrew',
        update_channel: 'stable',
      })
    })

    it('analytics.emitSessionContext only fires session start once per session', () => {
      analytics.emitSessionContext('homebrew', 'stable')
      analytics.emitSessionContext('homebrew', 'stable')
      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(mockSetProps).toHaveBeenCalledTimes(2)
    })
  })

  describe('Settings: Update', () => {
    it('analytics.emitUpdateChecked sends event', () => {
      analytics.emitUpdateChecked()
      expect(mockSend).toHaveBeenCalledWith('ksc_update_checked')
    })

    it('analytics.emitUpdateTriggered sends event', () => {
      analytics.emitUpdateTriggered()
      expect(mockSend).toHaveBeenCalledWith('ksc_update_triggered')
    })

    it('analytics.emitUpdateCompleted sends duration', () => {
      analytics.emitUpdateCompleted(5000)
      expect(mockSend).toHaveBeenCalledWith('ksc_update_completed', { duration_ms: 5000 })
    })

    it('analytics.emitUpdateFailed truncates error to 100 chars', () => {
      analytics.emitUpdateFailed('z'.repeat(150))
      expect(mockSend).toHaveBeenCalledWith('ksc_update_failed', { error_detail: 'z'.repeat(100) })
    })

    it('analytics.emitUpdateRefreshed sends event', () => {
      analytics.emitUpdateRefreshed()
      expect(mockSend).toHaveBeenCalledWith('ksc_update_refreshed')
    })

    it('analytics.emitUpdateStalled sends event', () => {
      analytics.emitUpdateStalled()
      expect(mockSend).toHaveBeenCalledWith('ksc_update_stalled')
    })
  })

  describe('Prediction Feedback', () => {
    it('analytics.emitPredictionFeedbackSubmitted sends feedback, type, and provider', () => {
      analytics.emitPredictionFeedbackSubmitted('thumbs_up', 'anomaly', 'claude')
      expect(mockSend).toHaveBeenCalledWith('ksc_prediction_feedback', {
        feedback: 'thumbs_up',
        prediction_type: 'anomaly',
        provider: 'claude',
      })
    })

    it('analytics.emitPredictionFeedbackSubmitted defaults provider to unknown', () => {
      analytics.emitPredictionFeedbackSubmitted('thumbs_down', 'trend')
      expect(mockSend).toHaveBeenCalledWith('ksc_prediction_feedback', {
        feedback: 'thumbs_down',
        prediction_type: 'trend',
        provider: 'unknown',
      })
    })
  })

  describe('Snooze', () => {
    it('analytics.emitSnoozed sends target type and duration', () => {
      analytics.emitSnoozed('alert', '1h')
      expect(mockSend).toHaveBeenCalledWith('ksc_snoozed', { target_type: 'alert', duration: '1h' })
    })

    it('analytics.emitSnoozed defaults duration to default', () => {
      analytics.emitSnoozed('card')
      expect(mockSend).toHaveBeenCalledWith('ksc_snoozed', { target_type: 'card', duration: 'default' })
    })

    it('analytics.emitUnsnoozed sends target type', () => {
      analytics.emitUnsnoozed('alert')
      expect(mockSend).toHaveBeenCalledWith('ksc_unsnoozed', { target_type: 'alert' })
    })
  })

  describe('Dashboard CRUD', () => {
    it('analytics.emitDashboardCreated sends dashboard name', () => {
      analytics.emitDashboardCreated('Production')
      expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_created', { dashboard_name: 'Production' })
    })

    it('analytics.emitDashboardDeleted sends event', () => {
      analytics.emitDashboardDeleted()
      expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_deleted')
    })

    it('analytics.emitDashboardRenamed sends event', () => {
      analytics.emitDashboardRenamed()
      expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_renamed')
    })

    it('analytics.emitDashboardImported sends event', () => {
      analytics.emitDashboardImported()
      expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_imported')
    })

    it('analytics.emitDashboardExported sends event', () => {
      analytics.emitDashboardExported()
      expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_exported')
    })
  })

  describe('Data Export', () => {
    it('analytics.emitDataExported sends export type and resource type', () => {
      analytics.emitDataExported('csv', 'pods')
      expect(mockSend).toHaveBeenCalledWith('ksc_data_exported', { export_type: 'csv', resource_type: 'pods' })
    })

    it('analytics.emitDataExported defaults resource type to empty string', () => {
      analytics.emitDataExported('json')
      expect(mockSend).toHaveBeenCalledWith('ksc_data_exported', { export_type: 'json', resource_type: '' })
    })
  })

  describe('User Management', () => {
    it('analytics.emitUserRoleChanged sends new role', () => {
      analytics.emitUserRoleChanged('admin')
      expect(mockSend).toHaveBeenCalledWith('ksc_user_role_changed', { new_role: 'admin' })
    })

    it('analytics.emitUserRemoved sends event', () => {
      analytics.emitUserRemoved()
      expect(mockSend).toHaveBeenCalledWith('ksc_user_removed')
    })
  })

  describe('Dashboard Duration', () => {
    it('analytics.emitDashboardViewed sends dashboard id and duration', () => {
      analytics.emitDashboardViewed('main', 30000)
      expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_viewed', { dashboard_id: 'main', duration_ms: 30000 })
    })
  })

  describe('Dashboard Excellence: Modal & Action Events', () => {
    it('analytics.emitModalOpened sends modal type and source card', () => {
      analytics.emitModalOpened('pod-detail', 'pods')
      expect(mockSend).toHaveBeenCalledWith('ksc_modal_opened', { modal_type: 'pod-detail', source_card: 'pods' })
    })

    it('analytics.emitModalTabViewed sends modal type and tab name', () => {
      analytics.emitModalTabViewed('pod-detail', 'logs')
      expect(mockSend).toHaveBeenCalledWith('ksc_modal_tab_viewed', { modal_type: 'pod-detail', tab_name: 'logs' })
    })

    it('analytics.emitModalClosed sends modal type and duration', () => {
      analytics.emitModalClosed('pod-detail', 15000)
      expect(mockSend).toHaveBeenCalledWith('ksc_modal_closed', { modal_type: 'pod-detail', duration_ms: 15000 })
    })

    it('analytics.emitInsightAcknowledged sends category and severity', () => {
      analytics.emitInsightAcknowledged('security', 'critical')
      expect(mockSend).toHaveBeenCalledWith('ksc_insight_acknowledged', { insight_category: 'security', insight_severity: 'critical' })
    })

    it('analytics.emitInsightDismissed sends category and severity', () => {
      analytics.emitInsightDismissed('performance', 'warning')
      expect(mockSend).toHaveBeenCalledWith('ksc_insight_dismissed', { insight_category: 'performance', insight_severity: 'warning' })
    })

    it('analytics.emitActionClicked sends action type, source card, and dashboard', () => {
      analytics.emitActionClicked('restart', 'pods', 'main')
      expect(mockSend).toHaveBeenCalledWith('ksc_action_clicked', { action_type: 'restart', source_card: 'pods', dashboard: 'main' })
    })

    it('analytics.emitAISuggestionViewed sends insight category and AI enrichment flag', () => {
      analytics.emitAISuggestionViewed('resource-optimization', true)
      expect(mockSend).toHaveBeenCalledWith('ksc_ai_suggestion_viewed', { insight_category: 'resource-optimization', has_ai_enrichment: true })
    })
  })

})
