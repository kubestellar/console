/**
 * Direct tests for lib/analytics-events split modules.
 *
 * Covers:
 * - missions.ts  — AI mission events, ACMM events, compliance events
 * - engagement.ts — widget, nudge, insight events
 * - marketplace.ts — install, conversion, landing page events
 * - feedback.ts   — feedback, NPS, screenshot events
 *
 * Strategy: mock `lib/analytics-core` `send` and assert event names + params.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../analytics-core', () => ({
  send: vi.fn(),
}))

import { send } from '../../analytics-core'

import {
  emitMissionStarted,
  emitMissionCompleted,
  emitMissionError,
  emitMissionSuggestionsShown,
  emitMissionSuggestionActioned,
  emitComplianceDrillDown,
  emitComplianceFilterChanged,
  emitBenchmarkViewed,
  emitACMMScanned,
  emitACMMMissionLaunched,
  emitACMMLevelMissionLaunched,
} from '../../analytics-events/missions'

import {
  emitWidgetLoaded,
  emitWidgetNavigation,
  emitWidgetInstalled,
  emitWidgetDownloaded,
  emitNudgeShown,
  emitNudgeDismissed,
  emitNudgeActioned,
  emitSmartSuggestionsShown,
  emitSmartSuggestionAccepted,
  emitSmartSuggestionsAddAll,
  emitDashboardScrolled,
  emitInsightViewed,
  emitInsightAcknowledged,
  emitStreakDay,
  emitBlogPostClicked,
} from '../../analytics-events/engagement'

import {
  emitMarketplaceInstall,
  emitMarketplaceRemove,
  emitMarketplaceInstallFailed,
  emitMarketplaceItemViewed,
  emitInstallCommandCopied,
  emitConversionStep,
  emitLocalClusterCreated,
  emitWelcomeViewed,
  emitWelcomeActioned,
} from '../../analytics-events/marketplace'

import {
  emitFeedbackSubmitted,
  emitScreenshotAttached,
  emitScreenshotUploadFailed,
  emitScreenshotUploadSuccess,
  emitNPSSurveyShown,
  emitNPSResponse,
  emitNPSDismissed,
  emitLinkedInShare,
  emitPredictionFeedbackSubmitted,
} from '../../analytics-events/feedback'

const mockSend = vi.mocked(send)

beforeEach(() => {
  mockSend.mockClear()
})

// ── missions.ts ───────────────────────────────────────────────────────────────

describe('analytics-events/missions', () => {
  it('emitMissionStarted sends ksc_mission_started with type and provider', () => {
    emitMissionStarted('deploy', 'openai')
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_started', {
      mission_type: 'deploy',
      agent_provider: 'openai',
    })
  })

  it('emitMissionCompleted sends ksc_mission_completed with duration', () => {
    emitMissionCompleted('deploy', 12.5)
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_completed', {
      mission_type: 'deploy',
      duration_sec: 12.5,
    })
  })

  it('emitMissionError sends ksc_mission_error with truncated detail (<=100 chars)', () => {
    const detail = 'a'.repeat(120)
    emitMissionError('deploy', 'TIMEOUT', detail)
    const call = mockSend.mock.calls[0]
    expect(call[0]).toBe('ksc_mission_error')
    expect((call[1] as Record<string, unknown>).error_detail).toHaveLength(100)
  })

  it('emitMissionError sends empty string when detail absent', () => {
    emitMissionError('deploy', 'TIMEOUT')
    const params = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect(params.error_detail).toBe('')
  })

  it('emitMissionError trims whitespace before truncating', () => {
    emitMissionError('scan', 'ERR', '   hello   ')
    const params = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect(params.error_detail).toBe('hello')
  })

  it('emitMissionSuggestionsShown sends correct counts', () => {
    emitMissionSuggestionsShown(5, 2)
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_suggestions_shown', {
      suggestion_count: 5,
      critical_count: 2,
    })
  })

  it('emitMissionSuggestionActioned sends type, priority, action', () => {
    emitMissionSuggestionActioned('deploy', 'critical', 'launch')
    expect(mockSend).toHaveBeenCalledWith('ksc_mission_suggestion_actioned', {
      mission_type: 'deploy',
      priority: 'critical',
      action: 'launch',
    })
  })

  it('emitComplianceDrillDown sends stat_type', () => {
    emitComplianceDrillDown('pass-rate')
    expect(mockSend).toHaveBeenCalledWith('ksc_compliance_drill_down', { stat_type: 'pass-rate' })
  })

  it('emitComplianceFilterChanged sends filter_type', () => {
    emitComplianceFilterChanged('namespace')
    expect(mockSend).toHaveBeenCalledWith('ksc_compliance_filter_changed', { filter_type: 'namespace' })
  })

  it('emitBenchmarkViewed sends benchmark_type', () => {
    emitBenchmarkViewed('latency')
    expect(mockSend).toHaveBeenCalledWith('ksc_benchmark_viewed', { benchmark_type: 'latency' })
  })

  it('emitACMMScanned sends repo, level, detected, total', () => {
    emitACMMScanned('my-repo', 2, 7, 10)
    expect(mockSend).toHaveBeenCalledWith('ksc_acmm_scanned', {
      repo: 'my-repo',
      acmm_level: 2,
      detected: 7,
      total: 10,
    })
  })

  it('emitACMMMissionLaunched sends repo, criterion, targetLevel', () => {
    emitACMMMissionLaunched('repo', 'crit-1', 'builtin', 3)
    expect(mockSend).toHaveBeenCalledWith('ksc_acmm_mission_launched', {
      repo: 'repo',
      criterion_id: 'crit-1',
      criterion_source: 'builtin',
      target_level: 3,
    })
  })

  it('emitACMMLevelMissionLaunched sends level and criteria count', () => {
    emitACMMLevelMissionLaunched('repo', 3, 4)
    expect(mockSend).toHaveBeenCalledWith('ksc_acmm_level_mission_launched', {
      repo: 'repo',
      target_level: 3,
      criteria_count: 4,
    })
  })
})

// ── engagement.ts ─────────────────────────────────────────────────────────────

describe('analytics-events/engagement', () => {
  it('emitWidgetLoaded sends mode', () => {
    emitWidgetLoaded('standalone')
    expect(mockSend).toHaveBeenCalledWith('ksc_widget_loaded', { mode: 'standalone' })
  })

  it('emitWidgetNavigation sends target_path', () => {
    emitWidgetNavigation('/clusters')
    expect(mockSend).toHaveBeenCalledWith('ksc_widget_navigation', { target_path: '/clusters' })
  })

  it('emitWidgetInstalled sends method', () => {
    emitWidgetInstalled('pwa-prompt')
    expect(mockSend).toHaveBeenCalledWith('ksc_widget_installed', { method: 'pwa-prompt' })
  })

  it('emitWidgetDownloaded sends widget_type', () => {
    emitWidgetDownloaded('browser')
    expect(mockSend).toHaveBeenCalledWith('ksc_widget_downloaded', { widget_type: 'browser' })
  })

  it('emitNudgeShown sends nudge_type', () => {
    emitNudgeShown('connect')
    expect(mockSend).toHaveBeenCalledWith('ksc_nudge_shown', { nudge_type: 'connect' })
  })

  it('emitNudgeDismissed sends nudge_type', () => {
    emitNudgeDismissed('connect')
    expect(mockSend).toHaveBeenCalledWith('ksc_nudge_dismissed', { nudge_type: 'connect' })
  })

  it('emitNudgeActioned sends nudge_type', () => {
    emitNudgeActioned('connect')
    expect(mockSend).toHaveBeenCalledWith('ksc_nudge_actioned', { nudge_type: 'connect' })
  })

  it('emitSmartSuggestionsShown sends card_count', () => {
    emitSmartSuggestionsShown(3)
    expect(mockSend).toHaveBeenCalledWith('ksc_smart_suggestions_shown', { card_count: 3 })
  })

  it('emitSmartSuggestionAccepted sends card_type', () => {
    emitSmartSuggestionAccepted('metric')
    expect(mockSend).toHaveBeenCalledWith('ksc_smart_suggestion_accepted', { card_type: 'metric' })
  })

  it('emitSmartSuggestionsAddAll sends card_count', () => {
    emitSmartSuggestionsAddAll(5)
    expect(mockSend).toHaveBeenCalledWith('ksc_smart_suggestions_add_all', { card_count: 5 })
  })

  it('emitDashboardScrolled sends depth', () => {
    emitDashboardScrolled('deep')
    expect(mockSend).toHaveBeenCalledWith('ksc_dashboard_scrolled', { depth: 'deep' })
  })

  it('emitInsightViewed sends insight_category', () => {
    emitInsightViewed('security')
    expect(mockSend).toHaveBeenCalledWith('ksc_insight_viewed', { insight_category: 'security' })
  })

  it('emitInsightAcknowledged sends category and severity', () => {
    emitInsightAcknowledged('security', 'high')
    expect(mockSend).toHaveBeenCalledWith('ksc_insight_acknowledged', {
      insight_category: 'security',
      insight_severity: 'high',
    })
  })

  it('emitStreakDay sends streak_count', () => {
    emitStreakDay(7)
    expect(mockSend).toHaveBeenCalledWith('ksc_streak_day', { streak_count: 7 })
  })

  it('emitBlogPostClicked sends blog_title', () => {
    emitBlogPostClicked('KubeStellar v1 released')
    expect(mockSend).toHaveBeenCalledWith('ksc_blog_post_clicked', {
      blog_title: 'KubeStellar v1 released',
    })
  })
})

// ── marketplace.ts ────────────────────────────────────────────────────────────

describe('analytics-events/marketplace', () => {
  it('emitMarketplaceInstall sends item_type and item_name', () => {
    emitMarketplaceInstall('plugin', 'my-plugin')
    expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_install', {
      item_type: 'plugin',
      item_name: 'my-plugin',
    })
  })

  it('emitMarketplaceRemove sends item_type', () => {
    emitMarketplaceRemove('plugin')
    expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_remove', { item_type: 'plugin' })
  })

  it('emitMarketplaceInstallFailed truncates error to 100 chars', () => {
    const longError = 'e'.repeat(150)
    emitMarketplaceInstallFailed('plugin', 'my-plugin', longError, 'parse')
    const params = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect((params.error_detail as string)).toHaveLength(100)
    expect(params.failure_stage).toBe('parse')
  })

  it('emitMarketplaceItemViewed sends item_type and item_name', () => {
    emitMarketplaceItemViewed('theme', 'dracula')
    expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_item_viewed', {
      item_type: 'theme',
      item_name: 'dracula',
    })
  })

  it('emitInstallCommandCopied sends source and command', () => {
    emitInstallCommandCopied('landing', 'helm install kubestellar')
    expect(mockSend).toHaveBeenCalledWith('ksc_install_command_copied', {
      source: 'landing',
      command: 'helm install kubestellar',
    })
  })

  it('emitConversionStep sends step number and name', () => {
    emitConversionStep(2, 'connect-cluster')
    expect(mockSend).toHaveBeenCalledWith('ksc_conversion_step', {
      step_number: 2,
      step_name: 'connect-cluster',
    })
  })

  it('emitConversionStep merges extra details', () => {
    emitConversionStep(3, 'review', { region: 'us-east-1' })
    const params = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect(params.region).toBe('us-east-1')
  })

  it('emitLocalClusterCreated sends tool', () => {
    emitLocalClusterCreated('kind')
    expect(mockSend).toHaveBeenCalledWith('ksc_local_cluster_created', { tool: 'kind' })
  })

  it('emitWelcomeViewed sends ref', () => {
    emitWelcomeViewed('github')
    expect(mockSend).toHaveBeenCalledWith('ksc_welcome_viewed', { ref: 'github' })
  })

  it('emitWelcomeActioned sends action and ref', () => {
    emitWelcomeActioned('get-started', 'github')
    expect(mockSend).toHaveBeenCalledWith('ksc_welcome_actioned', {
      action: 'get-started',
      ref: 'github',
    })
  })
})

// ── feedback.ts ───────────────────────────────────────────────────────────────

describe('analytics-events/feedback', () => {
  it('emitFeedbackSubmitted sends feedback_type', () => {
    emitFeedbackSubmitted('bug')
    expect(mockSend).toHaveBeenCalledWith('ksc_feedback_submitted', { feedback_type: 'bug' })
  })

  it('emitScreenshotAttached sends method and count', () => {
    emitScreenshotAttached('paste', 2)
    expect(mockSend).toHaveBeenCalledWith('ksc_screenshot_attached', { method: 'paste', count: 2 })
  })

  it('emitScreenshotUploadFailed truncates error', () => {
    const longError = 'x'.repeat(200)
    emitScreenshotUploadFailed(longError, 1)
    const params = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect((params.error as string).length).toBeLessThanOrEqual(100)
    expect(params.screenshot_count).toBe(1)
  })

  it('emitScreenshotUploadSuccess sends screenshot_count', () => {
    emitScreenshotUploadSuccess(3)
    expect(mockSend).toHaveBeenCalledWith('ksc_screenshot_upload_success', { screenshot_count: 3 })
  })

  it('emitNPSSurveyShown sends with bypassOptOut', () => {
    emitNPSSurveyShown()
    expect(mockSend).toHaveBeenCalledWith('ksc_nps_survey_shown', undefined, { bypassOptOut: true })
  })

  it('emitNPSResponse sends score and category with bypassOptOut', () => {
    emitNPSResponse(9, 'promoter')
    const call = mockSend.mock.calls[0]
    expect(call[0]).toBe('ksc_nps_response')
    expect((call[1] as Record<string, unknown>).nps_score).toBe(9)
    expect((call[1] as Record<string, unknown>).nps_category).toBe('promoter')
    expect(call[2]).toEqual({ bypassOptOut: true })
  })

  it('emitNPSResponse includes feedback_length when provided', () => {
    emitNPSResponse(7, 'passive', 42)
    const params = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect(params.nps_feedback_length).toBe(42)
  })

  it('emitNPSDismissed sends dismiss_count with bypassOptOut', () => {
    emitNPSDismissed(3)
    expect(mockSend).toHaveBeenCalledWith(
      'ksc_nps_dismissed',
      { dismiss_count: 3 },
      { bypassOptOut: true },
    )
  })

  it('emitLinkedInShare sends source', () => {
    emitLinkedInShare('post-connect')
    expect(mockSend).toHaveBeenCalledWith('ksc_linkedin_share', { source: 'post-connect' })
  })

  it('emitPredictionFeedbackSubmitted sends feedback, type, provider', () => {
    emitPredictionFeedbackSubmitted('helpful', 'suggestion', 'openai')
    expect(mockSend).toHaveBeenCalledWith('ksc_prediction_feedback', {
      feedback: 'helpful',
      prediction_type: 'suggestion',
      provider: 'openai',
    })
  })

  it('emitPredictionFeedbackSubmitted defaults provider to unknown', () => {
    emitPredictionFeedbackSubmitted('helpful', 'suggestion')
    const params = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect(params.provider).toBe('unknown')
  })
})
