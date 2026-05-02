/**
 * Cached hooks for GitOps data: Helm releases, Helm history, Helm values,
 * Operators, Operator Subscriptions, GitOps drifts, Buildpack images,
 * and RBAC (Roles, RoleBindings, ServiceAccounts via /api/rbac/).
 *
 * Uses factory functions for the two repeating patterns:
 *   - GitOps SSE hooks (cluster-only, fetchGitOpsAPI + optional SSE)
 *   - RBAC hooks (cluster+namespace, fetchRbacAPI)
 *
 * Hooks with unique signatures (HelmHistory, HelmValues, GitOpsDrifts,
 * BuildpackImages) are kept as standalone functions.
 */

import { useCache, type RefreshCategory, type CachedHookResult } from '../lib/cache'
import { fetchGitOpsAPI, fetchViaGitOpsSSE, fetchRbacAPI } from '../lib/cache/fetcherUtils'
import {
  getDemoHelmReleases,
  getDemoHelmHistory,
  getDemoHelmValues,
  getDemoOperators,
  getDemoOperatorSubscriptions,
  getDemoGitOpsDrifts,
  getDemoBuildpackImages,
  getDemoK8sRoles,
  getDemoK8sRoleBindings,
  getDemoK8sServiceAccountsRbac,
} from './useCachedData/demoData'
import type {
  HelmRelease,
  HelmHistoryEntry,
  Operator,
  OperatorSubscription,
  GitOpsDrift,
  BuildpackImage,
  K8sRole,
  K8sRoleBinding,
  K8sServiceAccountInfo,
} from './useMCP'

// ============================================================================
// GitOps SSE factory — cluster-only hooks using fetchGitOpsAPI + SSE
// ============================================================================

interface GitOpsSseConfig<T> {
  cacheKeyPrefix: string
  apiEndpoint: string
  responseKey: string
  aliasKey: string
  defaultCategory: RefreshCategory
  getDemoData: () => T[]
}

function createGitOpsSseHook<T extends object>(config: GitOpsSseConfig<T>) {
  const { cacheKeyPrefix, apiEndpoint, responseKey, aliasKey, defaultCategory, getDemoData } = config

  return function useCachedGitOpsResource(
    cluster?: string,
    options?: { category?: RefreshCategory }
  ): CachedHookResult<T[]> & Record<string, T[]> {
    const { category = defaultCategory } = options || {}
    const key = `${cacheKeyPrefix}:${cluster || 'all'}`

    const restFetcher = async () => {
      const data = await fetchGitOpsAPI<Record<string, T[]>>(apiEndpoint, cluster ? { cluster } : undefined)
      return (data[responseKey] as T[]) || []
    }

    const result = useCache({
      key,
      category,
      initialData: [] as T[],
      demoData: getDemoData(),
      fetcher: restFetcher,
      progressiveFetcher: cluster ? undefined : async (onProgress) => {
        try {
          return await fetchViaGitOpsSSE<T>(apiEndpoint, responseKey, {}, onProgress)
        } catch {
          // SSE stream failed — fall back to REST endpoint
          return await restFetcher()
        }
      },
    })

    return {
      [aliasKey]: result.data,
      data: result.data,
      isLoading: result.isLoading,
      isRefreshing: result.isRefreshing,
      isDemoFallback: result.isDemoFallback && !result.isLoading,
      error: result.error,
      isFailed: result.isFailed,
      consecutiveFailures: result.consecutiveFailures,
      lastRefresh: result.lastRefresh,
      refetch: result.refetch, retryFetch: result.retryFetch,
    } as CachedHookResult<T[]> & Record<string, T[]>
  }
}

// ============================================================================
// RBAC factory — cluster+namespace hooks using fetchRbacAPI
// ============================================================================

interface RbacConfig<T> {
  cacheKeyPrefix: string
  apiEndpoint: string
  responseKey: string
  aliasKey: string
  getDemoData: () => T[]
  supportsIncludeSystem?: boolean
}

function createRbacHook<T extends object>(config: RbacConfig<T>) {
  const { cacheKeyPrefix, apiEndpoint, responseKey, aliasKey, getDemoData, supportsIncludeSystem = false } = config

  return function useCachedRbacResource(
    cluster?: string,
    namespace?: string,
    options?: { includeSystem?: boolean; category?: RefreshCategory }
  ): CachedHookResult<T[]> & Record<string, T[]> {
    const { includeSystem = false, category = 'rbac' } = options || {}
    const systemSuffix = supportsIncludeSystem ? `:${includeSystem}` : ''
    const key = `${cacheKeyPrefix}:${cluster || 'all'}:${namespace || 'all'}${systemSuffix}`

    const fetchParams: Record<string, string | number | boolean | undefined> = { cluster, namespace }
    if (supportsIncludeSystem) {
      fetchParams.includeSystem = includeSystem
    }

    const result = useCache({
      key,
      category,
      initialData: [] as T[],
      demoData: getDemoData(),
      fetcher: async () => {
        const data = await fetchRbacAPI<Record<string, T[]>>(apiEndpoint, fetchParams)
        return (data[responseKey] as T[]) || []
      },
    })

    return {
      [aliasKey]: result.data,
      data: result.data,
      isLoading: result.isLoading,
      isRefreshing: result.isRefreshing,
      isDemoFallback: result.isDemoFallback && !result.isLoading,
      error: result.error,
      isFailed: result.isFailed,
      consecutiveFailures: result.consecutiveFailures,
      lastRefresh: result.lastRefresh,
      refetch: result.refetch, retryFetch: result.retryFetch,
    } as CachedHookResult<T[]> & Record<string, T[]>
  }
}

// ============================================================================
// GitOps SSE hooks (factory-generated)
// ============================================================================

export const useCachedHelmReleases = createGitOpsSseHook<HelmRelease>({
  cacheKeyPrefix: 'helmReleases',
  apiEndpoint: 'helm-releases',
  responseKey: 'releases',
  aliasKey: 'releases',
  defaultCategory: 'helm',
  getDemoData: getDemoHelmReleases,
})

export const useCachedOperators = createGitOpsSseHook<Operator>({
  cacheKeyPrefix: 'operators',
  apiEndpoint: 'operators',
  responseKey: 'operators',
  aliasKey: 'operators',
  defaultCategory: 'operators',
  getDemoData: getDemoOperators,
})

export const useCachedOperatorSubscriptions = createGitOpsSseHook<OperatorSubscription>({
  cacheKeyPrefix: 'operatorSubscriptions',
  apiEndpoint: 'operator-subscriptions',
  responseKey: 'subscriptions',
  aliasKey: 'subscriptions',
  defaultCategory: 'operators',
  getDemoData: getDemoOperatorSubscriptions,
})

// ============================================================================
// Helm history & values — unique signatures, kept standalone
// ============================================================================

export function useCachedHelmHistory(
  cluster?: string,
  release?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<HelmHistoryEntry[]> & { history: HelmHistoryEntry[] } {
  const { category = 'helm' } = options || {}
  const key = `helmHistory:${cluster || 'none'}:${release || 'none'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as HelmHistoryEntry[],
    demoData: getDemoHelmHistory(),
    enabled: !!(cluster && release),
    fetcher: async () => {
      const data = await fetchGitOpsAPI<{ history: HelmHistoryEntry[] }>('helm-history', { cluster, release, namespace })
      return data.history || []
    },
  })

  return {
    history: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch, retryFetch: result.retryFetch,
  }
}

export function useCachedHelmValues(
  cluster?: string,
  release?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<Record<string, unknown>> & { values: Record<string, unknown> } {
  const { category = 'helm' } = options || {}
  const key = `helmValues:${cluster || 'none'}:${release || 'none'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: {} as Record<string, unknown>,
    demoData: getDemoHelmValues(),
    enabled: !!(cluster && release),
    fetcher: async () => {
      const data = await fetchGitOpsAPI<{ values: Record<string, unknown> }>('helm-values', { cluster, release, namespace })
      return data.values || {}
    },
  })

  return {
    values: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch, retryFetch: result.retryFetch,
  }
}

// ============================================================================
// GitOps drift — cluster+namespace, no SSE, single instance (kept standalone)
// ============================================================================

export function useCachedGitOpsDrifts(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<GitOpsDrift[]> & { drifts: GitOpsDrift[] } {
  const { category = 'gitops' } = options || {}
  const key = `gitopsDrifts:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as GitOpsDrift[],
    demoData: getDemoGitOpsDrifts(),
    fetcher: async () => {
      const data = await fetchGitOpsAPI<{ drifts: GitOpsDrift[] }>('drifts', { cluster, namespace })
      return data.drifts || []
    },
  })

  return {
    drifts: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch, retryFetch: result.retryFetch,
  }
}

// ============================================================================
// Buildpack hook — custom 404 handling, kept standalone
// ============================================================================

export function useCachedBuildpackImages(
  cluster?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<BuildpackImage[]> & { images: BuildpackImage[] } {
  const { category = 'default' } = options || {}
  const key = `buildpackImages:${cluster || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as BuildpackImage[],
    demoData: getDemoBuildpackImages(),
    fetcher: async () => {
      try {
        const data = await fetchGitOpsAPI<{ images: BuildpackImage[] }>('buildpack-images', cluster ? { cluster } : undefined)
        return data.images || []
      } catch (err: unknown) {
        // When no buildpacks CRDs exist on any cluster, the API returns 404.
        // Treat this as an empty result rather than an error so the card
        // settles into its empty state instead of retrying indefinitely.
        if (err instanceof Error && err.message.includes('404')) {
          return []
        }
        throw err
      }
    },
  })

  return {
    images: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch, retryFetch: result.retryFetch,
  }
}

// ============================================================================
// RBAC hooks (factory-generated)
// ============================================================================

export const useCachedK8sRoles = createRbacHook<K8sRole>({
  cacheKeyPrefix: 'k8sRoles',
  apiEndpoint: 'roles',
  responseKey: 'roles',
  aliasKey: 'roles',
  getDemoData: getDemoK8sRoles,
  supportsIncludeSystem: true,
})

export const useCachedK8sRoleBindings = createRbacHook<K8sRoleBinding>({
  cacheKeyPrefix: 'k8sRoleBindings',
  apiEndpoint: 'bindings',
  responseKey: 'bindings',
  aliasKey: 'bindings',
  getDemoData: getDemoK8sRoleBindings,
  supportsIncludeSystem: true,
})

export const useCachedK8sServiceAccounts = createRbacHook<K8sServiceAccountInfo>({
  cacheKeyPrefix: 'k8sServiceAccounts',
  apiEndpoint: 'service-accounts',
  responseKey: 'serviceAccounts',
  aliasKey: 'serviceAccounts',
  getDemoData: getDemoK8sServiceAccountsRbac,
})
