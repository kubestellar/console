import { useState, useCallback } from 'react'

export interface ResolvedDependency {
  kind: string
  name: string
  namespace: string
  optional: boolean
  order: number
}

export interface DependencyResolution {
  workload: string
  kind: string
  namespace: string
  cluster: string
  dependencies: ResolvedDependency[]
  warnings: string[]
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * Hook to resolve dependencies for a workload (dry-run).
 * Used by the pre-deploy confirmation dialog and the Resource Marshall card.
 */
export function useResolveDependencies() {
  const [data, setData] = useState<DependencyResolution | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const resolve = useCallback(async (
    cluster: string,
    namespace: string,
    name: string,
  ): Promise<DependencyResolution | null> => {
    setIsLoading(true)
    setError(null)
    setData(null)

    try {
      const res = await fetch(
        `/api/workloads/resolve-deps/${encodeURIComponent(cluster)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
        { headers: authHeaders() },
      )
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(errorData.error || `Failed to resolve dependencies: ${res.statusText}`)
      }
      const result: DependencyResolution = await res.json()
      setData(result)
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setIsLoading(false)
  }, [])

  return { data, isLoading, error, resolve, reset }
}
