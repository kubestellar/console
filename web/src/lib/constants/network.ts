/**
 * Network Constants - URLs, timeouts, and connection parameters
 *
 * Centralizes all hardcoded network values previously scattered across 40+ files.
 * Any timeout, URL, or connection parameter should be defined here.
 */

// ============================================================================
// URLs
// ============================================================================

/** WebSocket URL for the local kc-agent */
export const LOCAL_AGENT_WS_URL = 'ws://127.0.0.1:8585/ws'

/** HTTP URL for the local kc-agent */
export const LOCAL_AGENT_HTTP_URL = 'http://127.0.0.1:8585'

/** Default backend URL (used as fallback when not configured) */
export const BACKEND_DEFAULT_URL = 'http://localhost:8080'

// ============================================================================
// WebSocket Timeouts
// ============================================================================

/** Timeout for establishing a WebSocket connection to the agent */
export const WS_CONNECT_TIMEOUT_MS = 2500

/** Cooldown period after a WebSocket connection failure before retrying */
export const WS_CONNECTION_COOLDOWN_MS = 5000

// ============================================================================
// Kubectl Request Timeouts
// ============================================================================

/** Default timeout for kubectl operations */
export const KUBECTL_DEFAULT_TIMEOUT_MS = 10_000

/** Timeout for medium-complexity kubectl operations (config, OPA, certs) */
export const KUBECTL_MEDIUM_TIMEOUT_MS = 15_000

/** Extended timeout for kubectl list operations (pods, services, deployments) */
export const KUBECTL_EXTENDED_TIMEOUT_MS = 30_000

/** Maximum timeout for heavy kubectl operations (all nodes, all pods) */
export const KUBECTL_MAX_TIMEOUT_MS = 45_000

// ============================================================================
// API & Health Check Timeouts
// ============================================================================

/** Timeout for metrics server / quick agent health checks */
export const METRICS_SERVER_TIMEOUT_MS = 5_000

/** Timeout for MCP hook calls and agent API requests */
export const MCP_HOOK_TIMEOUT_MS = 15_000

/** Extended timeout for MCP operations on large clusters */
export const MCP_EXTENDED_TIMEOUT_MS = 30_000

/** Timeout for backend API health checks */
export const BACKEND_HEALTH_CHECK_TIMEOUT_MS = 2_000

/** Default timeout for fetch() calls to the local backend API */
export const FETCH_DEFAULT_TIMEOUT_MS = 10_000

/** Timeout for fetch() calls to external services (GitHub API, registries, etc.) */
export const FETCH_EXTERNAL_TIMEOUT_MS = 15_000

// ============================================================================
// UI Feedback Timeouts
// ============================================================================

/** Duration to show copy/save confirmation feedback before resetting */
export const UI_FEEDBACK_TIMEOUT_MS = 2_000

/** Duration to show success/confirmation toasts before auto-dismissing */
export const TOAST_DISMISS_MS = 3_000

/** Duration to show delete-confirmation prompts before auto-cancelling */
export const DELETE_CONFIRM_TIMEOUT_MS = 3_000

/** Duration to show restored/imported success banners */
export const BANNER_DISMISS_MS = 5_000

/** Duration to show saved-mission toast */
export const SAVED_TOAST_MS = 4_000

// ============================================================================
// UI Animation & Focus Delays
// ============================================================================

/** Short delay for DOM focus after render (input autofocus, scroll-to) */
export const FOCUS_DELAY_MS = 100

/** Delay after closing a panel/sidebar to allow exit animation */
export const CLOSE_ANIMATION_MS = 150

/** Delay for tooltip/popover positioning after DOM layout */
export const TOOLTIP_POSITION_DELAY_MS = 400

/** Delay for UI transitions (navigation, card flash, animations) */
export const TRANSITION_DELAY_MS = 200

/** Delay before scroll-to-section completes (smooth scroll timing) */
export const SCROLL_COMPLETE_MS = 600

/** Delay for scan/generation progress simulation */
export const PROGRESS_SIMULATION_MS = 800

/** Delay for navigation after marketplace install animation */
export const NAV_AFTER_ANIMATION_MS = 1_500

/** Simulated delay for mock Argo CD sync operations (UI demonstration only) */
export const MOCK_SYNC_DELAY_MS = 1_200

// ============================================================================
// Polling & Refresh Intervals
// ============================================================================

/** Standard polling interval for data refresh (30 seconds) */
export const POLL_INTERVAL_MS = 30_000

/** Slow polling interval for less time-sensitive data (60 seconds) */
export const POLL_INTERVAL_SLOW_MS = 60_000

/** Fast polling interval for real-time metrics (2 seconds) */
export const POLL_INTERVAL_FAST_MS = 2_000

/** Update interval for elapsed time counters (1 second) */
export const TICK_INTERVAL_MS = 1_000

/** Interval for card recommendation analysis (60 seconds) */
export const RECOMMENDATION_INTERVAL_MS = 60_000

/** Interval for mission suggestion analysis (120 seconds) */
export const MISSION_SUGGEST_INTERVAL_MS = 120_000

// ============================================================================
// Loading & Timeout Thresholds
// ============================================================================

/** Timeout before showing "loading took too long" UI (5 seconds) */
export const LOADING_TIMEOUT_MS = 5_000

/** Extended loading timeout for cluster/page loads (10 seconds) */
export const LOADING_TIMEOUT_EXTENDED_MS = 10_000

/** Timeout for skeleton placeholder before showing fallback (100ms) */
export const SKELETON_DELAY_MS = 100

/** Timeout for initial render measurement (150ms) */
export const INITIAL_RENDER_TIMEOUT_MS = 150

/** Short retry/backoff delay (500ms) */
export const SHORT_DELAY_MS = 500

/** Delay before initial data fetch on component mount (stagger loads) */
export const INITIAL_FETCH_DELAY_MS = 5_000

/** Delay for staggered secondary data fetch */
export const SECONDARY_FETCH_DELAY_MS = 8_000

/** Retry delay after failed data fetch (1 second) */
export const RETRY_DELAY_MS = 1_000

/** Minimum delay for perceived UX responsiveness (500ms) */
export const MIN_PERCEIVED_DELAY_MS = 500

// ============================================================================
// MCP Abort Timeouts (setTimeout-based, distinct from fetch signal timeouts)
// ============================================================================

/** Abort timeout for MCP agent probe (1.5 seconds) */
export const MCP_PROBE_TIMEOUT_MS = 1_500

/** Abort timeout for quick API health checks (3 seconds) */
export const QUICK_ABORT_TIMEOUT_MS = 3_000

/** Abort timeout for AI prediction requests (5 seconds) */
export const AI_PREDICTION_TIMEOUT_MS = 5_000

/** Abort timeout for namespace management operations (8 seconds) */
export const NAMESPACE_ABORT_TIMEOUT_MS = 8_000

/** Abort timeout for deploy mission operations (10 seconds) */
export const DEPLOY_ABORT_TIMEOUT_MS = 10_000

/** KV cache stats update interval (3 seconds) */
export const KV_CACHE_UPDATE_INTERVAL_MS = 3_000

/** Animation packet spawn interval (800ms) */
export const PACKET_SPAWN_INTERVAL_MS = 800

/** Flash animation duration (1100ms) */
export const FLASH_ANIMATION_MS = 1_100

/** WebSocket reconnect delay (5 seconds) */
export const WS_RECONNECT_DELAY_MS = 5_000

/** Delay for simulated AI thinking/processing (300ms) */
export const AI_THINKING_DELAY_MS = 300

/** Hover popup hide delay (150ms) */
export const POPUP_HIDE_DELAY_MS = 150

/** Hover tooltip hide delay (50ms) */
export const TOOLTIP_HIDE_DELAY_MS = 50
