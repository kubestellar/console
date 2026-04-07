/**
 * LocalStorage key constants.
 *
 * Centralises every key the console reads/writes so they can be audited,
 * searched, and renamed from a single location.
 */

// ── Auth ────────────────────────────────────────────────────────────────
export const STORAGE_KEY_TOKEN = 'token'
export const STORAGE_KEY_AUTH_TOKEN = 'auth_token' // used by notification API
// Consolidated GitHub token — stored server-side, only source/dismissed flags in localStorage
export const STORAGE_KEY_GITHUB_TOKEN = 'github_token' // legacy, kept for cleanup
export const STORAGE_KEY_GITHUB_TOKEN_SOURCE = 'github_token_source' // legacy, kept for cleanup
export const STORAGE_KEY_GITHUB_TOKEN_DISMISSED = 'github_token_dismissed' // legacy, kept for cleanup
export const STORAGE_KEY_FEEDBACK_GITHUB_TOKEN = 'feedback_github_token'
export const STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_SOURCE = 'feedback_github_token_source'
export const STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_DISMISSED = 'ksc-feedback-github-token-dismissed'
export const DEMO_TOKEN_VALUE = 'demo-token'

// ── Demo / Onboarding ──────────────────────────────────────────────────
export const STORAGE_KEY_DEMO_MODE = 'kc-demo-mode'
export const STORAGE_KEY_ONBOARDED = 'demo-user-onboarded'
export const STORAGE_KEY_ONBOARDING_RESPONSES = 'demo-onboarding-responses'

// ── User cache ─────────────────────────────────────────────────────────
export const STORAGE_KEY_USER_CACHE = 'kc-user-cache'
export const STORAGE_KEY_BACKEND_STATUS = 'kc-backend-status'
export const STORAGE_KEY_SQLITE_MIGRATED = 'kc-sqlite-migrated'

// ── Settings (synced via settingsSync.ts) ──────────────────────────────
export const STORAGE_KEY_AI_MODE = 'kubestellar-ai-mode'
export const STORAGE_KEY_PREDICTION_SETTINGS = 'kubestellar-prediction-settings'
export const STORAGE_KEY_TOKEN_SETTINGS = 'kubestellar-token-settings'
export const STORAGE_KEY_THEME = 'kubestellar-theme-id'
export const STORAGE_KEY_CUSTOM_THEMES = 'kc-custom-themes'
export const STORAGE_KEY_ACCESSIBILITY = 'accessibility-settings'
export const STORAGE_KEY_NOTIFICATION_CONFIG = 'kc_notification_config'
export const STORAGE_KEY_TOUR_COMPLETED = 'kubestellar-console-tour-completed'
export const STORAGE_KEY_ANALYTICS_OPT_OUT = 'kc-analytics-opt-out'
export const STORAGE_KEY_ANONYMOUS_USER_ID = 'kc-anonymous-user-id'

// ── Dashboard persistence ─────────────────────────────────────────────
export const STORAGE_KEY_MAIN_DASHBOARD_CARDS = 'kubestellar-main-dashboard-cards'

// ── UI state persistence ───────────────────────────────────────────────
export const STORAGE_KEY_CLUSTER_LAYOUT = 'kubestellar-cluster-layout-mode'
export const STORAGE_KEY_NAV_HISTORY = 'kubestellar-nav-history'
export const STORAGE_KEY_CLUSTER_PROVIDER_OVERRIDES = 'kubestellar-cluster-provider-overrides'
export const STORAGE_KEY_CLUSTER_ORDER = 'kubestellar-cluster-order'
export const STORAGE_KEY_MISSIONS_ACTIVE = 'kubestellar-missions-active'
export const STORAGE_KEY_MISSIONS_HISTORY = 'kubestellar-missions-history'

// ── Engagement / Nudges ───────────────────────────────────────────────
export const STORAGE_KEY_NUDGE_DISMISSED = 'kc-nudge-dismissed'
export const STORAGE_KEY_SMART_SUGGESTIONS_DISMISSED = 'kc-smart-suggestions-dismissed'
export const STORAGE_KEY_DRAG_HINT_SHOWN = 'kc-drag-hint-shown'
export const STORAGE_KEY_PWA_PROMPT_DISMISSED = 'kc-pwa-prompt-dismissed'
export const STORAGE_KEY_SESSION_COUNT = 'kc-session-count'
export const STORAGE_KEY_VISIT_COUNT = 'kc-visit-count'
export const STORAGE_KEY_FEATURE_HINTS_DISMISSED = 'kc-feature-hints-dismissed'
export const STORAGE_KEY_GETTING_STARTED_DISMISSED = 'kc-getting-started-dismissed'
export const STORAGE_KEY_HINTS_SUPPRESSED = 'kc-hints-suppressed'
export const STORAGE_KEY_POST_CONNECT_DISMISSED = 'kc-post-connect-dismissed'
export const STORAGE_KEY_DEMO_CTA_DISMISSED = 'kc-demo-cta-dismissed'
export const STORAGE_KEY_ADOPTER_NUDGE_DISMISSED = 'kc-adopter-nudge-dismissed'
export const STORAGE_KEY_FIRST_AGENT_CONNECT = 'kc-first-agent-connect'
export const STORAGE_KEY_VISIT_STREAK = 'ksc-visit-streak'
export const STORAGE_KEY_SEEN_TIPS = 'ksc-seen-tips'
export const STORAGE_KEY_NPS_STATE = 'kc-nps-state'

// ── Orbit (Recurring Maintenance) ─────────────────────────────────
export const STORAGE_KEY_ORBIT_MISSIONS = 'kc-orbit-missions'
export const STORAGE_KEY_ORBIT_HISTORY = 'kc-orbit-history'
export const STORAGE_KEY_GROUND_CONTROL_DASHBOARDS = 'kc-ground-control-dashboards'

// ── Snooze persistence ────────────────────────────────────────────────
export const STORAGE_KEY_SNOOZED_CARDS = 'kubestellar-snoozed-cards'
export const STORAGE_KEY_SNOOZED_RECOMMENDATIONS = 'kubestellar-snoozed-recommendations'

// ── Notification dedup ────────────────────────────────────────────────
export const STORAGE_KEY_NOTIFIED_ALERT_KEYS = 'kc-notified-alert-keys'

// ── Component-specific cache ───────────────────────────────────────────
export const STORAGE_KEY_OPA_CACHE = 'opa-statuses-cache'
export const STORAGE_KEY_OPA_CACHE_TIME = 'opa-statuses-cache-time'
export const STORAGE_KEY_KYVERNO_CACHE = 'kc-kyverno-cache'
export const STORAGE_KEY_KYVERNO_CACHE_TIME = 'kc-kyverno-cache-time'
export const STORAGE_KEY_KUBESCAPE_CACHE = 'kc-kubescape-cache'
export const STORAGE_KEY_KUBESCAPE_CACHE_TIME = 'kc-kubescape-cache-time'
export const STORAGE_KEY_TRIVY_CACHE = 'kc-trivy-cache'
export const STORAGE_KEY_TRIVY_CACHE_TIME = 'kc-trivy-cache-time'
export const STORAGE_KEY_TRESTLE_CACHE = 'kc-trestle-cache'
export const STORAGE_KEY_TRESTLE_CACHE_TIME = 'kc-trestle-cache-time'
export const STORAGE_KEY_KUBECTL_HISTORY = 'kubectl-history'
export const STORAGE_KEY_RBAC_CACHE = 'kc-rbac-cache'
export const STORAGE_KEY_RBAC_CACHE_TIME = 'kc-rbac-cache-time'
export const STORAGE_KEY_NS_OVERVIEW_CLUSTER = 'kc-ns-overview-cluster'
export const STORAGE_KEY_NS_OVERVIEW_NAMESPACE = 'kc-ns-overview-namespace'
