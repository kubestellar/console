/**
 * Factory helpers for unified hook registration.
 */

/** Base shape returned by resource hooks registered with the unified system. */
export interface HookResult {
  isLoading: boolean
  error?: string | null
  refetch: () => void
}

/** Base shape returned by cached status hooks. */
export interface CachedHookResult<TData extends object = object> {
  data: TData
  isLoading?: boolean
  showSkeleton?: boolean
  error?: string | null | boolean
  isFailed?: boolean
  refetch?: () => void | Promise<void>
}

export interface BaseResourceHookConfig {
  dataField: string
  wrapRefetch?: boolean
  extra?: (result: HookResult) => Record<string, unknown>
  dataFallback?: unknown
}

export interface NoArgResourceHookConfig extends BaseResourceHookConfig {
  arity: 'none'
  useHook: () => HookResult
}

export interface ClusterResourceHookConfig extends BaseResourceHookConfig {
  arity: 'cluster'
  useHook: (cluster?: string) => HookResult
}

export interface ClusterNamespaceResourceHookConfig extends BaseResourceHookConfig {
  arity: 'cluster+namespace'
  useHook: (cluster?: string, namespace?: string) => HookResult
}

export type ResourceHookConfig = NoArgResourceHookConfig | ClusterResourceHookConfig | ClusterNamespaceResourceHookConfig

export function createUnifiedResourceHook(config: ResourceHookConfig) {
  return function useUnifiedResource(params?: Record<string, unknown>) {
    const cluster = config.arity !== 'none' ? (params?.cluster as string | undefined) : undefined
    const namespace = config.arity === 'cluster+namespace' ? (params?.namespace as string | undefined) : undefined

    const result = config.arity === 'none'
      ? config.useHook()
      : config.arity === 'cluster'
        ? config.useHook(cluster)
        : config.useHook(cluster, namespace)

    // Dynamic field access by name — cast is intentional since dataField
    // is a runtime-configured key that varies per hook registration.
    const resultRecord = result as unknown as Record<string, unknown>
    const data = config.dataFallback !== undefined
      ? (resultRecord[config.dataField] || config.dataFallback)
      : resultRecord[config.dataField]

    return {
      data,
      isLoading: result.isLoading,
      error: result.error ? new Error(result.error) : null,
      refetch: config.wrapRefetch ? () => { result.refetch() } : result.refetch,
      ...(config.extra ? config.extra(result) : {}),
    }
  }
}

export interface CachedStatusHookConfig<
  TData extends object = object,
  TResult extends CachedHookResult<TData> = CachedHookResult<TData>,
> {
  useCachedHook: () => TResult
  dataField: string
  loadingField: 'showSkeleton' | 'isLoading'
  errorMode: 'message' | 'passthrough' | 'isFailed'
  errorMsg?: string
  wrapRefetch?: boolean
  optionalData?: boolean
  refetchOverride?: (result: TResult) => (() => void | Promise<void>)
}

export function createUnifiedCachedHook<
  TData extends object,
  TResult extends CachedHookResult<TData>,
>(config: CachedStatusHookConfig<TData, TResult>) {
  return function useUnifiedCachedStatus() {
    const result = config.useCachedHook()
    const resultData: Record<string, unknown> = result.data as Record<string, unknown>

    const data = config.optionalData
      ? (resultData[config.dataField] ?? [])
      : resultData[config.dataField]

    const isLoading = result[config.loadingField] ?? false

    let error: Error | null = null
    if (config.errorMode === 'message') {
      error = result.error ? new Error(config.errorMsg!) : null
    } else if (config.errorMode === 'passthrough') {
      error = result.error ? new Error(String(result.error)) : null
    } else if (config.errorMode === 'isFailed') {
      error = result.isFailed ? new Error(config.errorMsg!) : null
    }

    const refetch = config.refetchOverride
      ? config.refetchOverride(result)
      : config.wrapRefetch
        ? () => { void result.refetch?.() }
        : (result.refetch ?? (() => {}))

    return {
      data,
      isLoading,
      error,
      refetch,
    }
  }
}
