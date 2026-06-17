import { MS_PER_SECOND, MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../constants/time'

export const THIRTY_SECONDS_MS = 30 * MS_PER_SECOND
export const TWO_MINUTES_MS = 2 * MS_PER_MINUTE
export const THREE_MINUTES_MS = 3 * MS_PER_MINUTE
export const FOUR_MINUTES_MS = 4 * MS_PER_MINUTE
export const FIVE_MINUTES_MS = 5 * MS_PER_MINUTE
export const TEN_MINUTES_MS = 10 * MS_PER_MINUTE
export const FIFTEEN_MINUTES_MS = 15 * MS_PER_MINUTE
export const THIRTY_MINUTES_MS = 30 * MS_PER_MINUTE
export const FORTY_FIVE_MINUTES_MS = 45 * MS_PER_MINUTE
export const TWO_HOURS_MS = 2 * MS_PER_HOUR
export const THREE_HOURS_MS = 3 * MS_PER_HOUR
export const TWO_DAYS_MS = 2 * MS_PER_DAY
export const THREE_DAYS_MS = 3 * MS_PER_DAY

// ============================================================================
// Factory-generated hook registration config
// ============================================================================

/** Base shape returned by resource hooks registered with the unified system. */
interface HookResult {
  isLoading: boolean
  error?: string | null
  refetch: () => void
}

/** Base shape returned by cached status hooks. */
interface CachedHookResult<TData extends object = object> {
  data: TData
  isLoading?: boolean
  showSkeleton?: boolean
  error?: string | null | boolean
  isFailed?: boolean
  refetch?: () => void | Promise<void>
}

interface BaseResourceHookConfig {
  dataField: string
  wrapRefetch?: boolean
  extra?: (result: HookResult) => Record<string, unknown>
  dataFallback?: unknown
}

interface NoArgResourceHookConfig extends BaseResourceHookConfig {
  arity: 'none'
  useHook: () => HookResult
}

interface ClusterResourceHookConfig extends BaseResourceHookConfig {
  arity: 'cluster'
  useHook: (cluster?: string) => HookResult
}

interface ClusterNamespaceResourceHookConfig extends BaseResourceHookConfig {
  arity: 'cluster+namespace'
  useHook: (cluster?: string, namespace?: string) => HookResult
}

type ResourceHookConfig = NoArgResourceHookConfig | ClusterResourceHookConfig | ClusterNamespaceResourceHookConfig

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

interface CachedStatusHookConfig<
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

export type { ResourceHookConfig, CachedStatusHookConfig }
