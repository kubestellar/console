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

// ============================================================================
// UI Feedback Timeouts
// ============================================================================

/** Duration to show copy/save confirmation feedback before resetting */
export const UI_FEEDBACK_TIMEOUT_MS = 2_000
