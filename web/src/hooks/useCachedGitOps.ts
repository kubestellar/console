/**
 * Cached hooks for GitOps data: Helm releases, Helm history, Helm values,
 * Operators, Operator Subscriptions, GitOps drifts, Buildpack images,
 * and RBAC (Roles, RoleBindings, ServiceAccounts via /api/rbac/).
 *
 * Extracted from useCachedData.ts for maintainability.
 */

import { useCache, type RefreshCategory } from '../lib/cache'
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
// Shared types
// ============================================================================

/** Shared result shape for all useCached* hooks */
interface CachedHookResult<T> {
  data: T
  isLoading: boolean
  isRefreshing: boolean
  isDemoFallback: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

// ============================================================================
// Helm hooks
// ============================================================================

/**
 * Hook for fetching Helm releases with caching (GitOps SSE endpoint)
 */
export function useCachedHelmReleases(
  cluster?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<HelmRelease[]> & { releases: HelmRelease[] } {
  const { category = 'helm' } = options || {}
  const key = `helmReleases:${cluster || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as HelmRelease[],
    demoData: getDemoHelmReleases(),
    fetcher: async () => {
      const data = await fetchGitOpsAPI<{ releases: HelmRelease[] }>('helm-releases', cluster ? { cluster } : undefined)
      return data.releases || []
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaGitOpsSSE<HelmRelease>('helm-releases', 'releases', {}, onProgress)
    } })

  return {
    releases: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching Helm release history with caching
 */
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
    } })

  return {
    history: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching Helm release values with caching
 */
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
    } })

  return {
    values: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

// ============================================================================
// Operator hooks
// ============================================================================

/**
 * Hook for fetching operators with caching (GitOps SSE endpoint)
 */
export function useCachedOperators(
  cluster?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<Operator[]> & { operators: Operator[] } {
  const { category = 'operators' } = options || {}
  const key = `operators:${cluster || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as Operator[],
    demoData: getDemoOperators(),
    fetcher: async () => {
      const data = await fetchGitOpsAPI<{ operators: Operator[] }>('operators', cluster ? { cluster } : undefined)
      return data.operators || []
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaGitOpsSSE<Operator>('operators', 'operators', {}, onProgress)
    } })

  return {
    operators: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching operator subscriptions with caching (GitOps SSE endpoint)
 */
export function useCachedOperatorSubscriptions(
  cluster?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<OperatorSubscription[]> & { subscriptions: OperatorSubscription[] } {
  const { category = 'operators' } = options || {}
  const key = `operatorSubscriptions:${cluster || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as OperatorSubscription[],
    demoData: getDemoOperatorSubscriptions(),
    fetcher: async () => {
      const data = await fetchGitOpsAPI<{ subscriptions: OperatorSubscription[] }>('operator-subscriptions', cluster ? { cluster } : undefined)
      return data.subscriptions || []
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaGitOpsSSE<OperatorSubscription>('operator-subscriptions', 'subscriptions', {}, onProgress)
    } })

  return {
    subscriptions: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

// ============================================================================
// GitOps drift hook
// ============================================================================

/**
 * Hook for fetching GitOps drift data with caching
 */
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
    } })

  return {
    drifts: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

// ============================================================================
// Buildpack hook
// ============================================================================

/**
 * Hook for fetching buildpack images with caching
 */
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
      } catch (err) {
        // When no buildpacks CRDs exist on any cluster, the API returns 404.
        // Treat this as an empty result rather than an error so the card
        // settles into its empty state instead of retrying indefinitely.
        if (err instanceof Error && err.message.includes('404')) {
          return []
        }
        throw err
      }
    } })

  return {
    images: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

// ============================================================================
// RBAC hooks
// ============================================================================

/**
 * Hook for fetching K8s Roles with caching (RBAC endpoint)
 */
export function useCachedK8sRoles(
  cluster?: string,
  namespace?: string,
  options?: { includeSystem?: boolean; category?: RefreshCategory }
): CachedHookResult<K8sRole[]> & { roles: K8sRole[] } {
  const { includeSystem = false, category = 'rbac' } = options || {}
  const key = `k8sRoles:${cluster || 'all'}:${namespace || 'all'}:${includeSystem}`

  const result = useCache({
    key,
    category,
    initialData: [] as K8sRole[],
    demoData: getDemoK8sRoles(),
    fetcher: async () => {
      const data = await fetchRbacAPI<{ roles: K8sRole[] }>('roles', { cluster, namespace, includeSystem })
      return data.roles || []
    } })

  return {
    roles: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching K8s RoleBindings with caching (RBAC endpoint)
 */
export function useCachedK8sRoleBindings(
  cluster?: string,
  namespace?: string,
  options?: { includeSystem?: boolean; category?: RefreshCategory }
): CachedHookResult<K8sRoleBinding[]> & { bindings: K8sRoleBinding[] } {
  const { includeSystem = false, category = 'rbac' } = options || {}
  const key = `k8sRoleBindings:${cluster || 'all'}:${namespace || 'all'}:${includeSystem}`

  const result = useCache({
    key,
    category,
    initialData: [] as K8sRoleBinding[],
    demoData: getDemoK8sRoleBindings(),
    fetcher: async () => {
      const data = await fetchRbacAPI<{ bindings: K8sRoleBinding[] }>('bindings', { cluster, namespace, includeSystem })
      return data.bindings || []
    } })

  return {
    bindings: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching K8s ServiceAccounts with caching (RBAC endpoint)
 */
export function useCachedK8sServiceAccounts(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<K8sServiceAccountInfo[]> & { serviceAccounts: K8sServiceAccountInfo[] } {
  const { category = 'rbac' } = options || {}
  const key = `k8sServiceAccounts:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as K8sServiceAccountInfo[],
    demoData: getDemoK8sServiceAccountsRbac(),
    fetcher: async () => {
      const data = await fetchRbacAPI<{ serviceAccounts: K8sServiceAccountInfo[] }>('service-accounts', { cluster, namespace })
      return data.serviceAccounts || []
    } })

  return {
    serviceAccounts: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}
