/**
 * Federation action helpers — Phase 2 imperative operations.
 *
 * This module provides the TypeScript types and fetch wrapper for the
 * POST /federation/action endpoint added in PR F. The UI calls
 * executeFederationAction() to run a provider-specific action (approve CSR,
 * accept cluster, detach cluster, taint cluster, etc.) against a hub.
 *
 * Types mirror pkg/agent/federation/actions.go.
 */

import { LOCAL_AGENT_HTTP_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { agentFetch } from './mcp/shared'
import { STORAGE_KEY_TOKEN } from '../lib/constants'
import type { FederationProviderName } from './useFederation'

/** Describes a single imperative action a provider supports. */
export interface ActionDescriptor {
  /** Stable identifier (e.g. "ocm.approveCSR"). */
  id: string
  /** Human-readable button label. */
  label: string
  /** Kubernetes API verb the action performs (e.g. "update", "patch", "delete"). */
  verb: string
  /** Provider that owns this action. */
  provider: FederationProviderName
  /** Whether the action is destructive (UI should confirm before executing). */
  destructive: boolean
}

/** POST body for /federation/action. */
export interface ActionRequest {
  actionId: string
  provider: FederationProviderName
  hubContext: string
  clusterName?: string
  payload?: Record<string, unknown>
}

/** Response from /federation/action. */
export interface ActionResult {
  ok: boolean
  already: boolean
  message?: string
}

/**
 * Execute a federation action against the kc-agent backend.
 *
 * The caller is responsible for showing a confirmation dialog before calling
 * this for destructive actions (ActionDescriptor.destructive === true).
 */
export async function executeFederationAction(req: ActionRequest): Promise<ActionResult> {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/federation/action`, {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  if (!response.ok) {
    const text = await response.text()
    return { ok: false, already: false, message: text }
  }
  return await response.json()
}
