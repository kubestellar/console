import { send } from '../analytics-core'

// ── Widget Tracking ─────────────────────────────────────────────

export function emitWidgetLoaded(mode: 'standalone' | 'browser') {
  send('ksc_widget_loaded', { mode })
}

export function emitWidgetNavigation(targetPath: string) {
  send('ksc_widget_navigation', { target_path: targetPath })
}

export function emitWidgetInstalled(method: 'pwa-prompt' | 'safari-dock') {
  send('ksc_widget_installed', { method })
}

export function emitWidgetDownloaded(widgetType: 'uebersicht' | 'browser') {
  send('ksc_widget_downloaded', { widget_type: widgetType })
}

// ── Nudges & Suggestions ────────────────────────────────────────────

export function emitNudgeShown(nudgeType: string) {
  send('ksc_nudge_shown', { nudge_type: nudgeType })
}

export function emitNudgeDismissed(nudgeType: string) {
  send('ksc_nudge_dismissed', { nudge_type: nudgeType })
}

export function emitNudgeActioned(nudgeType: string) {
  send('ksc_nudge_actioned', { nudge_type: nudgeType })
}

export function emitSmartSuggestionsShown(cardCount: number) {
  send('ksc_smart_suggestions_shown', { card_count: cardCount })
}

export function emitSmartSuggestionAccepted(cardType: string) {
  send('ksc_smart_suggestion_accepted', { card_type: cardType })
}

export function emitSmartSuggestionsAddAll(cardCount: number) {
  send('ksc_smart_suggestions_add_all', { card_count: cardCount })
}

// ── Engagement Moments ──────────────────────────────────────────────

export function emitDashboardScrolled(depth: 'shallow' | 'deep') {
  send('ksc_dashboard_scrolled', { depth })
}

export function emitPwaPromptShown() {
  send('ksc_pwa_prompt_shown')
}

export function emitPwaPromptDismissed() {
  send('ksc_pwa_prompt_dismissed')
}

export function emitFeatureHintShown(hintType: string) {
  send('ksc_feature_hint_shown', { hint_type: hintType })
}

export function emitFeatureHintDismissed(hintType: string) {
  send('ksc_feature_hint_dismissed', { hint_type: hintType })
}

export function emitFeatureHintActioned(hintType: string) {
  send('ksc_feature_hint_actioned', { hint_type: hintType })
}

export function emitGettingStartedShown() {
  send('ksc_getting_started_shown')
}

export function emitGettingStartedActioned(action: string) {
  send('ksc_getting_started_actioned', { action })
}

export function emitPostConnectShown() {
  send('ksc_post_connect_shown')
}

export function emitPostConnectActioned(action: string) {
  send('ksc_post_connect_actioned', { action })
}

export function emitDemoToLocalShown() {
  send('ksc_demo_to_local_shown')
}

export function emitDemoToLocalActioned(action: string) {
  send('ksc_demo_to_local_actioned', { action })
}

export function emitAdopterNudgeShown() {
  send('ksc_adopter_nudge_shown')
}

export function emitAdopterNudgeActioned(action: string) {
  send('ksc_adopter_nudge_actioned', { action })
}

// ── Insights & Content ────────────

export function emitInsightViewed(insightCategory: string) {
  send('ksc_insight_viewed', { insight_category: insightCategory })
}

export function emitInsightAcknowledged(insightCategory: string, insightSeverity: string) {
  send('ksc_insight_acknowledged', { insight_category: insightCategory, insight_severity: insightSeverity })
}

export function emitInsightDismissed(insightCategory: string, insightSeverity: string) {
  send('ksc_insight_dismissed', { insight_category: insightCategory, insight_severity: insightSeverity })
}

export function emitAISuggestionViewed(insightCategory: string, hasAIEnrichment: boolean) {
  send('ksc_ai_suggestion_viewed', { insight_category: insightCategory, has_ai_enrichment: hasAIEnrichment })
}

export function emitTipShown(page: string, tip: string) {
  send('ksc_tip_shown', { page, tip })
}

export function emitStreakDay(streakCount: number) {
  send('ksc_streak_day', { streak_count: streakCount })
}

export function emitBlogPostClicked(title: string) {
  send('ksc_blog_post_clicked', { blog_title: title })
}
