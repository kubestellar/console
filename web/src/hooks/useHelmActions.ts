/**
 * Helm Write Operations Hook
 *
 * Provides functions for helm rollback, uninstall, and upgrade
 * via the backend API endpoints.
 */

import { useState, useCallback } from 'react'

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

  const executeAction = useCallback(async (
    endpoint: string,
    body: HelmRollbackParams | HelmUninstallParams | HelmUpgradeParams,
  ): Promise<HelmActionResult> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok || data.error) {
        const result: HelmActionResult = {
          success: false,
          message: data.error || 'Operation failed',
          detail: data.detail,
        }
        setError(result.message)
        setLastResult(result)
        return result
      }

      const result: HelmActionResult = {
        success: true,
        message: data.message || 'Operation completed',
        output: data.output,
      }
      setLastResult(result)
      return result
    } catch (err) {
      const result: HelmActionResult = {
        success: false,
        message: err instanceof Error ? err.message : 'Network error',
      }
      setError(result.message)
      setLastResult(result)
      return result
    } finally {
      setIsLoading(false)
    }
  }, [])

  const rollback = useCallback(async (params: HelmRollbackParams) => {
    return executeAction('/api/gitops/helm-rollback', params)
  }, [executeAction])

  const uninstall = useCallback(async (params: HelmUninstallParams) => {
    return executeAction('/api/gitops/helm-uninstall', params)
  }, [executeAction])

  const upgrade = useCallback(async (params: HelmUpgradeParams) => {
    return executeAction('/api/gitops/helm-upgrade', params)
  }, [executeAction])

  return {
    rollback,
    uninstall,
    upgrade,
    isLoading,
    error,
    lastResult,
  }
}
