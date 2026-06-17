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

describe('analytics-events/engagement', () => {
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

  describe('Feedback', () => {
    it('analytics.emitFeedbackSubmitted sends feedback type', () => {
      analytics.emitFeedbackSubmitted('bug')
      expect(mockSend).toHaveBeenCalledWith('ksc_feedback_submitted', { feedback_type: 'bug' })
    })

    it('analytics.emitScreenshotAttached sends method and count', () => {
      analytics.emitScreenshotAttached('paste', 2)
      expect(mockSend).toHaveBeenCalledWith('ksc_screenshot_attached', { method: 'paste', count: 2 })
    })

    it('analytics.emitScreenshotUploadFailed truncates error to 100 chars', () => {
      const longError = 'e'.repeat(150)
      analytics.emitScreenshotUploadFailed(longError, 3)
      expect(mockSend).toHaveBeenCalledWith('ksc_screenshot_upload_failed', {
        error: 'e'.repeat(100),
        screenshot_count: 3,
      })
    })

    it('analytics.emitScreenshotUploadSuccess sends screenshot count', () => {
      analytics.emitScreenshotUploadSuccess(2)
      expect(mockSend).toHaveBeenCalledWith('ksc_screenshot_upload_success', { screenshot_count: 2 })
    })
  })

  describe('NPS Survey', () => {
    it('analytics.emitNPSSurveyShown bypasses opt-out', () => {
      analytics.emitNPSSurveyShown()
      expect(mockSend).toHaveBeenCalledWith('ksc_nps_survey_shown', undefined, { bypassOptOut: true })
    })

    it('analytics.emitNPSResponse sends score and category with bypassOptOut', () => {
      analytics.emitNPSResponse(9, 'promoter')
      expect(mockSend).toHaveBeenCalledWith(
        'ksc_nps_response',
        { nps_score: 9, nps_category: 'promoter' },
        { bypassOptOut: true },
      )
    })

    it('analytics.emitNPSResponse includes feedback length when provided', () => {
      analytics.emitNPSResponse(7, 'passive', 42)
      expect(mockSend).toHaveBeenCalledWith(
        'ksc_nps_response',
        { nps_score: 7, nps_category: 'passive', nps_feedback_length: 42 },
        { bypassOptOut: true },
      )
    })

    it('analytics.emitNPSResponse omits feedback length when undefined', () => {
      analytics.emitNPSResponse(3, 'detractor')
      const params = mockSend.mock.calls[0][1] as Record<string, unknown>
      expect(params).not.toHaveProperty('nps_feedback_length')
    })

    it('analytics.emitNPSDismissed sends dismiss count with bypassOptOut', () => {
      analytics.emitNPSDismissed(2)
      expect(mockSend).toHaveBeenCalledWith(
        'ksc_nps_dismissed',
        { dismiss_count: 2 },
        { bypassOptOut: true },
      )
    })
  })

  describe('Tour', () => {
    it('analytics.emitTourStarted sends event', () => {
      analytics.emitTourStarted()
      expect(mockSend).toHaveBeenCalledWith('ksc_tour_started')
    })

    it('analytics.emitTourCompleted sends step count', () => {
      analytics.emitTourCompleted(8)
      expect(mockSend).toHaveBeenCalledWith('ksc_tour_completed', { step_count: 8 })
    })

    it('analytics.emitTourSkipped sends at_step', () => {
      analytics.emitTourSkipped(3)
      expect(mockSend).toHaveBeenCalledWith('ksc_tour_skipped', { at_step: 3 })
    })
  })

  describe('Marketplace', () => {
    it('analytics.emitMarketplaceInstall sends item type and name', () => {
      analytics.emitMarketplaceInstall('card', 'gpu-monitor')
      expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_install', { item_type: 'card', item_name: 'gpu-monitor' })
    })

    it('analytics.emitMarketplaceRemove sends item type', () => {
      analytics.emitMarketplaceRemove('card')
      expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_remove', { item_type: 'card' })
    })

    it('analytics.emitMarketplaceInstallFailed truncates error to 100 chars', () => {
      analytics.emitMarketplaceInstallFailed('card', 'gpu-monitor', 'f'.repeat(150))
      expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_install_failed', {
        item_type: 'card',
        item_name: 'gpu-monitor',
        error_detail: 'f'.repeat(100),
      })
    })

    it('analytics.emitMarketplaceItemViewed sends item type and name', () => {
      analytics.emitMarketplaceItemViewed('mission', 'install-istio')
      expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_item_viewed', { item_type: 'mission', item_name: 'install-istio' })
    })
  })

  describe('Widget Tracking', () => {
    it('analytics.emitWidgetLoaded sends mode', () => {
      analytics.emitWidgetLoaded('standalone')
      expect(mockSend).toHaveBeenCalledWith('ksc_widget_loaded', { mode: 'standalone' })
    })

    it('analytics.emitWidgetNavigation sends target path', () => {
      analytics.emitWidgetNavigation('/dashboard')
      expect(mockSend).toHaveBeenCalledWith('ksc_widget_navigation', { target_path: '/dashboard' })
    })

    it('analytics.emitWidgetInstalled sends method', () => {
      analytics.emitWidgetInstalled('pwa-prompt')
      expect(mockSend).toHaveBeenCalledWith('ksc_widget_installed', { method: 'pwa-prompt' })
    })

    it('analytics.emitWidgetDownloaded sends widget type', () => {
      analytics.emitWidgetDownloaded('uebersicht')
      expect(mockSend).toHaveBeenCalledWith('ksc_widget_downloaded', { widget_type: 'uebersicht' })
    })
  })

  describe('Engagement Nudges', () => {
    it('analytics.emitNudgeShown sends nudge type', () => {
      analytics.emitNudgeShown('add-card')
      expect(mockSend).toHaveBeenCalledWith('ksc_nudge_shown', { nudge_type: 'add-card' })
    })

    it('analytics.emitNudgeDismissed sends nudge type', () => {
      analytics.emitNudgeDismissed('add-card')
      expect(mockSend).toHaveBeenCalledWith('ksc_nudge_dismissed', { nudge_type: 'add-card' })
    })

    it('analytics.emitNudgeActioned sends nudge type', () => {
      analytics.emitNudgeActioned('add-card')
      expect(mockSend).toHaveBeenCalledWith('ksc_nudge_actioned', { nudge_type: 'add-card' })
    })

    it('analytics.emitSmartSuggestionsShown sends card count', () => {
      analytics.emitSmartSuggestionsShown(4)
      expect(mockSend).toHaveBeenCalledWith('ksc_smart_suggestions_shown', { card_count: 4 })
    })

    it('analytics.emitSmartSuggestionAccepted sends card type', () => {
      analytics.emitSmartSuggestionAccepted('gpu-monitor')
      expect(mockSend).toHaveBeenCalledWith('ksc_smart_suggestion_accepted', { card_type: 'gpu-monitor' })
    })

    it('analytics.emitSmartSuggestionsAddAll sends card count', () => {
      analytics.emitSmartSuggestionsAddAll(6)
      expect(mockSend).toHaveBeenCalledWith('ksc_smart_suggestions_add_all', { card_count: 6 })
    })
  })

  describe('LinkedIn Share', () => {
    it('analytics.emitLinkedInShare sends source', () => {
      analytics.emitLinkedInShare('dashboard')
      expect(mockSend).toHaveBeenCalledWith('ksc_linkedin_share', { source: 'dashboard' })
    })
  })

  describe('Insights', () => {
    it('analytics.emitInsightViewed sends insight category', () => {
      analytics.emitInsightViewed('security')
      expect(mockSend).toHaveBeenCalledWith('ksc_insight_viewed', { insight_category: 'security' })
    })
  })

  describe('Arcade Games', () => {
    it('analytics.emitGameStarted sends game name', () => {
      analytics.emitGameStarted('space-invaders')
      expect(mockSend).toHaveBeenCalledWith('ksc_game_started', { game_name: 'space-invaders' })
    })

    it('analytics.emitGameEnded sends game name, outcome, and score', () => {
      analytics.emitGameEnded('space-invaders', 'win', 9500)
      expect(mockSend).toHaveBeenCalledWith('ksc_game_ended', { game_name: 'space-invaders', outcome: 'win', score: 9500 })
    })
  })

  describe('Sidebar Navigation', () => {
    it('analytics.emitSidebarNavigated sends destination', () => {
      analytics.emitSidebarNavigated('/settings')
      expect(mockSend).toHaveBeenCalledWith('ksc_sidebar_navigated', { destination: '/settings' })
    })
  })

  describe('Feature Hints', () => {
    it('analytics.emitFeatureHintShown sends hint type', () => {
      analytics.emitFeatureHintShown('drag-reorder')
      expect(mockSend).toHaveBeenCalledWith('ksc_feature_hint_shown', { hint_type: 'drag-reorder' })
    })

    it('analytics.emitFeatureHintDismissed sends hint type', () => {
      analytics.emitFeatureHintDismissed('drag-reorder')
      expect(mockSend).toHaveBeenCalledWith('ksc_feature_hint_dismissed', { hint_type: 'drag-reorder' })
    })

    it('analytics.emitFeatureHintActioned sends hint type', () => {
      analytics.emitFeatureHintActioned('drag-reorder')
      expect(mockSend).toHaveBeenCalledWith('ksc_feature_hint_actioned', { hint_type: 'drag-reorder' })
    })
  })

  describe('Getting Started', () => {
    it('analytics.emitGettingStartedShown sends event', () => {
      analytics.emitGettingStartedShown()
      expect(mockSend).toHaveBeenCalledWith('ksc_getting_started_shown')
    })

    it('analytics.emitGettingStartedActioned sends action', () => {
      analytics.emitGettingStartedActioned('connect_agent')
      expect(mockSend).toHaveBeenCalledWith('ksc_getting_started_actioned', { action: 'connect_agent' })
    })
  })

  describe('Post-Connect Activation', () => {
    it('analytics.emitPostConnectShown sends event', () => {
      analytics.emitPostConnectShown()
      expect(mockSend).toHaveBeenCalledWith('ksc_post_connect_shown')
    })

    it('analytics.emitPostConnectActioned sends action', () => {
      analytics.emitPostConnectActioned('add_dashboard')
      expect(mockSend).toHaveBeenCalledWith('ksc_post_connect_actioned', { action: 'add_dashboard' })
    })
  })

  describe('Demo-to-Local CTA', () => {
    it('analytics.emitDemoToLocalShown sends event', () => {
      analytics.emitDemoToLocalShown()
      expect(mockSend).toHaveBeenCalledWith('ksc_demo_to_local_shown')
    })

    it('analytics.emitDemoToLocalActioned sends action', () => {
      analytics.emitDemoToLocalActioned('install')
      expect(mockSend).toHaveBeenCalledWith('ksc_demo_to_local_actioned', { action: 'install' })
    })
  })

  describe('Adopter Nudge', () => {
    it('analytics.emitAdopterNudgeShown sends event', () => {
      analytics.emitAdopterNudgeShown()
      expect(mockSend).toHaveBeenCalledWith('ksc_adopter_nudge_shown')
    })

    it('analytics.emitAdopterNudgeActioned sends action', () => {
      analytics.emitAdopterNudgeActioned('edit_adopters')
      expect(mockSend).toHaveBeenCalledWith('ksc_adopter_nudge_actioned', { action: 'edit_adopters' })
    })
  })

  describe('Welcome / Conference Landing Page', () => {
    it('analytics.emitWelcomeViewed sends ref', () => {
      analytics.emitWelcomeViewed('kubecon-2026')
      expect(mockSend).toHaveBeenCalledWith('ksc_welcome_viewed', { ref: 'kubecon-2026' })
    })

    it('analytics.emitWelcomeActioned sends action and ref', () => {
      analytics.emitWelcomeActioned('hero_explore_demo', 'kubecon-2026')
      expect(mockSend).toHaveBeenCalledWith('ksc_welcome_actioned', { action: 'hero_explore_demo', ref: 'kubecon-2026' })
    })
  })

  describe('From Lens Landing Page', () => {
    it('analytics.emitFromLensViewed sends event', () => {
      analytics.emitFromLensViewed()
      expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_viewed')
    })

    it('analytics.emitFromLensActioned sends action', () => {
      analytics.emitFromLensActioned('hero_try_demo')
      expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_actioned', { action: 'hero_try_demo' })
    })

    it('analytics.emitFromLensTabSwitch sends tab', () => {
      analytics.emitFromLensTabSwitch('cluster-portforward')
      expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_tab_switch', { tab: 'cluster-portforward' })
    })

    it('analytics.emitFromLensCommandCopy sends tab, step, and command', () => {
      analytics.emitFromLensCommandCopy('localhost', 1, 'brew install kc')
      expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_command_copy', { tab: 'localhost', step: 1, command: 'brew install kc' })
    })
  })

  describe('From Headlamp Landing Page', () => {
    it('analytics.emitFromHeadlampViewed sends event', () => {
      analytics.emitFromHeadlampViewed()
      expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_viewed')
    })

    it('analytics.emitFromHeadlampActioned sends action', () => {
      analytics.emitFromHeadlampActioned('hero_try_demo')
      expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_actioned', { action: 'hero_try_demo' })
    })

    it('analytics.emitFromHeadlampTabSwitch sends tab', () => {
      analytics.emitFromHeadlampTabSwitch('cluster-ingress')
      expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_tab_switch', { tab: 'cluster-ingress' })
    })

    it('analytics.emitFromHeadlampCommandCopy sends tab, step, and command', () => {
      analytics.emitFromHeadlampCommandCopy('localhost', 2, 'kubectl apply -f')
      expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_command_copy', { tab: 'localhost', step: 2, command: 'kubectl apply -f' })
    })
  })

  describe('White Label Landing Page', () => {
    it('analytics.emitWhiteLabelViewed sends event', () => {
      analytics.emitWhiteLabelViewed()
      expect(mockSend).toHaveBeenCalledWith('ksc_white_label_viewed')
    })

    it('analytics.emitWhiteLabelActioned sends action', () => {
      analytics.emitWhiteLabelActioned('hero_view_github')
      expect(mockSend).toHaveBeenCalledWith('ksc_white_label_actioned', { action: 'hero_view_github' })
    })

    it('analytics.emitWhiteLabelTabSwitch sends tab', () => {
      analytics.emitWhiteLabelTabSwitch('helm')
      expect(mockSend).toHaveBeenCalledWith('ksc_white_label_tab_switch', { tab: 'helm' })
    })

    it('analytics.emitWhiteLabelCommandCopy sends tab, step, and command', () => {
      analytics.emitWhiteLabelCommandCopy('docker', 1, 'docker pull')
      expect(mockSend).toHaveBeenCalledWith('ksc_white_label_command_copy', { tab: 'docker', step: 1, command: 'docker pull' })
    })
  })

  describe('Rotating Tips & Streaks', () => {
    it('analytics.emitTipShown sends page and tip', () => {
      analytics.emitTipShown('/dashboard', 'Did you know: Drag cards to reorder')
      expect(mockSend).toHaveBeenCalledWith('ksc_tip_shown', { page: '/dashboard', tip: 'Did you know: Drag cards to reorder' })
    })

    it('analytics.emitStreakDay sends streak count', () => {
      analytics.emitStreakDay(7)
      expect(mockSend).toHaveBeenCalledWith('ksc_streak_day', { streak_count: 7 })
    })

    it('analytics.emitBlogPostClicked sends blog title', () => {
      analytics.emitBlogPostClicked('New Features in v2.0')
      expect(mockSend).toHaveBeenCalledWith('ksc_blog_post_clicked', { blog_title: 'New Features in v2.0' })
    })
  })

  describe("What's New Modal", () => {
    it('analytics.emitWhatsNewModalOpened sends release tag', () => {
      analytics.emitWhatsNewModalOpened('v2.0.0')
      expect(mockSend).toHaveBeenCalledWith('ksc_whats_new_modal_opened', { release_tag: 'v2.0.0' })
    })

    it('analytics.emitWhatsNewUpdateClicked sends tag and install method', () => {
      analytics.emitWhatsNewUpdateClicked('v2.0.0', 'homebrew')
      expect(mockSend).toHaveBeenCalledWith('ksc_whats_new_update_clicked', { release_tag: 'v2.0.0', install_method: 'homebrew' })
    })

    it('analytics.emitWhatsNewRemindLater sends tag and snooze duration', () => {
      analytics.emitWhatsNewRemindLater('v2.0.0', '24h')
      expect(mockSend).toHaveBeenCalledWith('ksc_whats_new_remind_later', { release_tag: 'v2.0.0', snooze_duration: '24h' })
    })
  })

})
