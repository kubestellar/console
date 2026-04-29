/**
 * Network Constants - URLs, timeouts, and connection parameters
 *
 * Centralizes all hardcoded network values previously scattered across 40+ files.
 * Any timeout, URL, or connection parameter should be defined here.
 */

// ============================================================================
// URLs
// ============================================================================

/**
 * Whether the app is running on a Netlify deployment (console.kubestellar.io, preview deploys).
 * On Netlify, agent URLs are disabled — there is no local kc-agent.
 * Duplicated from demoMode.ts to avoid circular imports (demoMode → constants → network).
 */
const _isNetlify = typeof window !== 'undefined' && (
  import.meta.env.VITE_DEMO_MODE === 'true' ||
  window.location.hostname.includes('netlify.app') ||
  window.location.hostname.includes('deploy-preview-') ||
  window.location.hostname === 'console.kubestellar.io'
)

/**
 * Whether the local kc-agent should be suppressed.
 * True on Netlify deployments, or when VITE_NO_LOCAL_AGENT is set at build time,
 * or when the backend reports no_local_agent via /health (in-cluster deployments).
 *
 * The build-time VITE_NO_LOCAL_AGENT covers custom builds (e.g. CI, Docker).
 * The runtime flag (set via suppressLocalAgent()) covers pre-built images
 * deployed in-cluster where Vite env vars cannot be injected at runtime.
 */
let _suppressAgent = _isNetlify || import.meta.env.VITE_NO_LOCAL_AGENT === 'true'

/**
 * Called by the BrandingProvider after fetching /health to suppress agent
 * connections at runtime (e.g. in-cluster Helm deployments that ship a
 * pre-built frontend image where VITE_NO_LOCAL_AGENT cannot be set).
 *
 * Once called with `true`, the agent URLs are permanently disabled for
 * the lifetime of the page — there is no "un-suppress" path.
 */
export function suppressLocalAgent(suppress: boolean): void {
  if (suppress && !_suppressAgent) {
    _suppressAgent = true
    // Update the mutable URLs so any future reads get the suppressed values
    LOCAL_AGENT_WS_URL = AGENT_WS_DISABLED_URL
    LOCAL_AGENT_HTTP_URL = ''
  }
}

/** Check whether the local agent is suppressed (build-time or runtime). */
export function isLocalAgentSuppressed(): boolean {
  return _suppressAgent
}

/** Syntactically-valid but unroutable WS URL used when the agent is suppressed.
 * Safari throws TypeError for empty/invalid URLs in `new WebSocket(url)`,
 * so this ensures the constructor succeeds but the connection simply fails
 * via `onerror`, which all consumers already handle. */
const AGENT_WS_DISABLED_URL = 'ws://localhost:1/disabled'

/**
 * WebSocket URL for the local kc-agent.
 * Suppressed (unroutable) when running on Netlify, in-cluster, or with
 * VITE_NO_LOCAL_AGENT=true. The connection fails via `onerror`, which
 * all consumers already handle.
 */
export let LOCAL_AGENT_WS_URL = _suppressAgent ? AGENT_WS_DISABLED_URL : 'ws://127.0.0.1:8585/ws'

/**
 * HTTP URL for the local kc-agent.
 * Empty when suppressed — fetch calls become relative URLs (e.g. '/settings'),
 * which 404 silently.
 */
export let LOCAL_AGENT_HTTP_URL = _suppressAgent ? '' : 'http://127.0.0.1:8585'

/** Default backend URL — empty string means same-origin relative URL.
 * This ensures API requests work in deployed environments (custom domain,
 * ingress, reverse proxy) without requiring VITE_API_BASE_URL to be set. */
export const BACKEND_DEFAULT_URL = ''

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
// CRD Discovery Timeouts (shared by useKyverno, useTrivy, useKubescape, etc.)
// ============================================================================

/** Timeout for checking whether a CRD exists on a cluster */
export const CRD_CHECK_TIMEOUT_MS = 8_000

/** Timeout for fetching data after CRD presence is confirmed */
export const CRD_DATA_FETCH_TIMEOUT_MS = 30_000

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

/** Timeout for RBAC queries that fan out across all clusters */
export const RBAC_QUERY_TIMEOUT_MS = 60_000

/** Extended timeout for feedback submissions with screenshot uploads (90 seconds).
 * Screenshots are uploaded server-side to GitHub via the Contents API, which can
 * be slow for multiple large images. */
export const FEEDBACK_UPLOAD_TIMEOUT_MS = 90_000

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

/** Duration to show saved-mission toast (60 seconds with countdown) */
export const SAVED_TOAST_MS = 60_000

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

/** Polling interval for nightly E2E run data (5 minutes) */
export const NIGHTLY_E2E_POLL_INTERVAL_MS = 300_000

/** Default auto-refresh interval for cached data hooks (2 minutes).
 *  Most useCached* / use* hooks poll on this cadence. Import this
 *  constant instead of defining a local `REFRESH_INTERVAL_MS = 120_000`. */
export const DEFAULT_REFRESH_INTERVAL_MS = 120_000

// ============================================================================
// Loading & Timeout Thresholds
// ============================================================================

/** Timeout before showing "loading took too long" UI (5 seconds) */
export const LOADING_TIMEOUT_MS = 5_000

/** Timeout for skeleton placeholder before showing fallback (100ms) */
export const SKELETON_DELAY_MS = 100

/** Timeout for initial render measurement (150ms) */
export const INITIAL_RENDER_TIMEOUT_MS = 150

/** Minimum duration to show skeleton on initial mount before transitioning to content (200ms).
 * Prevents flicker when child reports state via useLayoutEffect causing a re-render
 * that briefly shows content before the skeleton timeout completes (#5206). */
export const MIN_SKELETON_DISPLAY_MS = 200

/** Maximum time a card can remain in loading state before forced fallback (30 seconds).
 * If a card reports isLoading:true but never transitions out (e.g., interrupted render,
 * hook cancellation, or error during data fetching), this timeout forces it to exit
 * the loading state and show content or an error fallback. */
export const CARD_LOADING_TIMEOUT_MS = 30_000

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

/** Abort timeout for namespace management operations (15 seconds — matches nsDefaultTimeout in Go backend) */
export const NAMESPACE_ABORT_TIMEOUT_MS = 15_000

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

// ============================================================================
// WebSocket Reconnect with Exponential Backoff
// ============================================================================

/** Base delay for WebSocket reconnection attempts (doubles each retry) */
export const WS_RECONNECT_BASE_DELAY_MS = 2_000

/** Maximum delay between WebSocket reconnection attempts */
export const WS_RECONNECT_MAX_DELAY_MS = 30_000

/** Maximum WebSocket reconnection attempts before giving up */
export const MAX_WS_RECONNECT_ATTEMPTS = 5

/** Small random jitter added to backoff to avoid thundering herd */
export const WS_BACKOFF_JITTER_MAX_MS = 1_000

/**
 * Calculate exponential backoff delay with jitter.
 * Delay = min(base * 2^attempt, max) + random jitter
 */
export function getWsBackoffDelay(attempt: number): number {
  const delay = Math.min(
    WS_RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt),
    WS_RECONNECT_MAX_DELAY_MS,
  )
  const jitter = Math.random() * WS_BACKOFF_JITTER_MAX_MS
  return delay + jitter
}

/** Delay for simulated AI thinking/processing (300ms) */
export const AI_THINKING_DELAY_MS = 300

/** Hover popup hide delay (150ms) */
export const POPUP_HIDE_DELAY_MS = 150

/** Hover tooltip hide delay (50ms) */
export const TOOLTIP_HIDE_DELAY_MS = 50

/** Hover tooltip/popover show delay — prevents flicker from incidental cursor pass-through */
export const TOOLTIP_SHOW_DELAY_MS = 250

// ============================================================================
// AI Mission Chat Limits
// ============================================================================

/** Maximum number of characters allowed in a single mission chat message */
export const MAX_MESSAGE_SIZE_CHARS = 10_000

// ============================================================================
// Service / LoadBalancer labels
// ============================================================================

/** Display label for a LoadBalancer service whose cloud provider has not yet
 * assigned an external IP or hostname. Issue #6153 — previously the UI
 * showed a blank / dash value which was indistinguishable from a provisioned
 * service with no ingress. */
export const LB_PROVISIONING_LABEL = 'Provisioning'

/** Wire value returned by the backend for a LoadBalancer service that is
 * still being provisioned (matches k8s.LBStatusProvisioning in Go). */
export const LB_STATUS_PROVISIONING = 'Provisioning'

/** Wire value returned by the backend for a LoadBalancer service that has
 * an ingress IP/hostname assigned (matches k8s.LBStatusReady in Go). */
export const LB_STATUS_READY = 'Ready'

// ============================================================================
// Services cache freshness (issue #6162)
// ============================================================================

/** Maximum age of a cached services payload before it must be discarded
 * and refetched. The underlying cache layer refreshes on a shorter
 * interval but this is the hard wall after which stale data is ignored
 * on read. */
export const SERVICES_CACHE_TTL_MS = 60_000

/** Age threshold above which the services UI marks its data as stale
 * (shown as a "Cached • Ns ago" / "Stale" badge). Strictly less than
 * SERVICES_CACHE_TTL_MS. */
export const SERVICES_CACHE_STALE_MS = 30_000

export { MS_PER_SECOND } from './time'

// ============================================================================
// Service port rendering (issue #6163)
// ============================================================================

/** Separator inserted between a port name and its port/protocol string
 * when rendering a named port (e.g. `http: 80/TCP`). */
export const PORT_NAME_SEPARATOR = ': '
