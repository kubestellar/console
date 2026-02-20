/**
 * LocalStorage key constants.
 *
 * Centralises every key the console reads/writes so they can be audited,
 * searched, and renamed from a single location.
 */

// ── Auth ────────────────────────────────────────────────────────────────
export const STORAGE_KEY_TOKEN = 'token'
export const STORAGE_KEY_AUTH_TOKEN = 'auth_token' // used by notification API
export const STORAGE_KEY_GITHUB_TOKEN = 'github_token'
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
export const STORAGE_KEY_ACCESSIBILITY = 'accessibility-settings'
export const STORAGE_KEY_NOTIFICATION_CONFIG = 'kc_notification_config'
export const STORAGE_KEY_TOUR_COMPLETED = 'kubestellar-console-tour-completed'
export const STORAGE_KEY_ANALYTICS_OPT_OUT = 'kc-analytics-opt-out'

// ── UI state persistence ───────────────────────────────────────────────
export const STORAGE_KEY_CLUSTER_LAYOUT = 'kubestellar-cluster-layout-mode'
export const STORAGE_KEY_NAV_HISTORY = 'kubestellar-nav-history'
export const STORAGE_KEY_CLUSTER_PROVIDER_OVERRIDES = 'kubestellar-cluster-provider-overrides'
export const STORAGE_KEY_MISSIONS_ACTIVE = 'kubestellar-missions-active'
export const STORAGE_KEY_MISSIONS_HISTORY = 'kubestellar-missions-history'

// ── Component-specific cache ───────────────────────────────────────────
export const STORAGE_KEY_OPA_CACHE = 'opa-statuses-cache'
export const STORAGE_KEY_OPA_CACHE_TIME = 'opa-statuses-cache-time'
export const STORAGE_KEY_KUBECTL_HISTORY = 'kubectl-history'
