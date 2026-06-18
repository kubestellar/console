/**
 * api.ts — Main API client (now a barrel re-export).
 * Split into domain-specific modules per issue #19013:
 * - api/client.ts — Core HTTP client class
 * - api/utils.ts — Helper functions (safeJson, authFetch)
 * - api/cluster.ts — Cluster and namespace operations
 * - api/settings.ts — Settings and configuration operations
 * - api/dashboard.ts — Dashboard and card management
 * - api/agent.ts — Agent and MCP operations
 * - api/index.ts — Barrel export
 *
 * This file maintained for backward compatibility.
 */
export * from './api/index'
