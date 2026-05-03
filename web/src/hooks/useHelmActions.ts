/**
 * Helm Write Operations Hook
 *
 * Provides functions for helm rollback, uninstall, and upgrade
 * via the backend API endpoints.
 */

import { useState } from 'react'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_TOKEN } from '../lib/constants'

// #7993 Phase 4: helm rollback/uninstall/upgrade moved from the backend to
// kc-agent. The agent runs `helm` under the user's own kubeconfig instead of
// the backend pod ServiceAccount. The request bodies are identical — only
// the URL changes.
function helmAgentAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

// ============================================================================
// Types
// ============================================================================

export interface HelmActionResult {
  success: boolean
  message: string
  output?: string
  error?: string
  detail?: string
}

export interface HelmRollbackParams {
  release: string
  namespace: string
  cluster: string
  revision: number
}

export interface HelmUninstallParams {
  release: string
  namespace: string
  cluster: string
}

export interface HelmUpgradeParams {
  release: string
  namespace: string
  cluster: string
  chart: string
  version?: string
  values?: string
  reuseValues?: boolean
}

export interface UseHelmActionsResult {
  rollback: (params: HelmRollbackParams) => Promise<HelmActionResult>
  uninstall: (params: HelmUninstallParams) => Promise<HelmActionResult>
  upgrade: (params: HelmUpgradeParams) => Promise<HelmActionResult>
  isLoading: boolean
  error: string | null
  lastResult: HelmActionResult | null
}

// ============================================================================
// Hook
// ============================================================================

export function useHelmActions(): UseHelmActionsResult {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<HelmActionResult | null>(null)

  const executeAction = async (
    endpoint: string,
    body: HelmRollbackParams | HelmUninstallParams | HelmUpgradeParams,
  ): Promise<HelmActionResult> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: helmAgentAuthHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })

      const data = await response.json()

      if (!response.ok || data.error) {
        const result: HelmActionResult = {
          success: false,
          message: data.error || 'Operation failed',
          detail: data.detail }
        setError(result.message)
        setLastResult(result)
        return result
      }

      const result: HelmActionResult = {
        success: true,
        message: data.message || 'Operation completed',
        output: data.output }
      setLastResult(result)
      return result
    } catch (err: unknown) {
      const result: HelmActionResult = {
        success: false,
        message: err instanceof Error ? err.message : 'Network error' }
      setError(result.message)
      setLastResult(result)
      return result
    } finally {
      setIsLoading(false)
    }
  }

  const rollback = async (params: HelmRollbackParams) => {
    return executeAction(`${LOCAL_AGENT_HTTP_URL}/helm/rollback`, params)
  }

  const uninstall = async (params: HelmUninstallParams) => {
    return executeAction(`${LOCAL_AGENT_HTTP_URL}/helm/uninstall`, params)
  }

  const upgrade = async (params: HelmUpgradeParams) => {
    return executeAction(`${LOCAL_AGENT_HTTP_URL}/helm/upgrade`, params)
  }

  return {
    rollback,
    uninstall,
    upgrade,
    isLoading,
    error,
    lastResult }
}
