import { describe, it, expect, vi } from 'vitest'
import {
  createUnifiedResourceHook,
  createUnifiedCachedHook,
  type HookResult,
  type CachedHookResult,
} from '../factories'

type ExtendedResult = HookResult & Record<string, unknown>

const baseResult = (over: Partial<ExtendedResult> = {}): HookResult => ({
  isLoading: false,
  error: null,
  refetch: vi.fn(),
  ...over,
}) as HookResult

describe('createUnifiedResourceHook', () => {
  it('arity=none: invokes hook with no args and returns data from dataField', () => {
    const useHook = vi.fn(() => baseResult({ pods: [{ name: 'a' }] }))
    const useUnified = createUnifiedResourceHook({ arity: 'none', useHook, dataField: 'pods' })
    const r = useUnified()
    expect(useHook).toHaveBeenCalledWith()
    expect(r.data).toEqual([{ name: 'a' }])
    expect(r.error).toBeNull()
  })

  it('arity=cluster: forwards params.cluster to hook', () => {
    const useHook = vi.fn(() => baseResult({ svc: 'x' }))
    const useUnified = createUnifiedResourceHook({ arity: 'cluster', useHook, dataField: 'svc' })
    useUnified({ cluster: 'c1' })
    expect(useHook).toHaveBeenCalledWith('c1')
  })

  it('arity=cluster+namespace: forwards both cluster and namespace', () => {
    const useHook = vi.fn(() => baseResult({ x: 1 }))
    const useUnified = createUnifiedResourceHook({ arity: 'cluster+namespace', useHook, dataField: 'x' })
    useUnified({ cluster: 'c1', namespace: 'ns1' })
    expect(useHook).toHaveBeenCalledWith('c1', 'ns1')
  })

  it('applies dataFallback when dataField value is falsy', () => {
    const useHook = () => baseResult({ items: undefined })
    const useUnified = createUnifiedResourceHook({
      arity: 'none', useHook, dataField: 'items', dataFallback: [],
    })
    expect(useUnified().data).toEqual([])
  })

  it('does not apply fallback when dataFallback is not configured', () => {
    const useHook = () => baseResult({ items: undefined })
    const useUnified = createUnifiedResourceHook({ arity: 'none', useHook, dataField: 'items' })
    expect(useUnified().data).toBeUndefined()
  })

  it('wraps string error into Error instance', () => {
    const useHook = () => baseResult({ x: 1, error: 'boom' })
    const useUnified = createUnifiedResourceHook({ arity: 'none', useHook, dataField: 'x' })
    const r = useUnified()
    expect(r.error).toBeInstanceOf(Error)
    expect((r.error as Error).message).toBe('boom')
  })

  it('wrapRefetch replaces refetch with void-returning wrapper that calls original', () => {
    const original = vi.fn(() => 42 as unknown as void)
    const useHook = () => baseResult({ x: 1, refetch: original })
    const useUnified = createUnifiedResourceHook({
      arity: 'none', useHook, dataField: 'x', wrapRefetch: true,
    })
    const r = useUnified()
    expect(r.refetch()).toBeUndefined()
    expect(original).toHaveBeenCalled()
  })

  it('extra() output is spread into the returned result', () => {
    const useHook = () => baseResult({ x: 1 })
    const useUnified = createUnifiedResourceHook({
      arity: 'none', useHook, dataField: 'x',
      extra: () => ({ extraFlag: true, count: 3 }),
    })
    const r = useUnified() as unknown as Record<string, unknown>
    expect(r.extraFlag).toBe(true)
    expect(r.count).toBe(3)
  })
})

describe('createUnifiedCachedHook', () => {
  type Cached = CachedHookResult<Record<string, unknown>>

  const cached = (over: Partial<Cached> = {}): Cached => ({
    data: {},
    ...over,
  })

  it('selects loadingField=showSkeleton', () => {
    const useCachedHook = () => cached({ data: { pods: [] }, showSkeleton: true, isLoading: false })
    const useUnified = createUnifiedCachedHook({
      useCachedHook, dataField: 'pods', loadingField: 'showSkeleton', errorMode: 'passthrough',
    })
    expect(useUnified().isLoading).toBe(true)
  })

  it('selects loadingField=isLoading', () => {
    const useCachedHook = () => cached({ data: { pods: [] }, showSkeleton: false, isLoading: true })
    const useUnified = createUnifiedCachedHook({
      useCachedHook, dataField: 'pods', loadingField: 'isLoading', errorMode: 'passthrough',
    })
    expect(useUnified().isLoading).toBe(true)
  })

  it('errorMode=message wraps error with configured errorMsg', () => {
    const useCachedHook = () => cached({ data: { x: 1 }, error: 'raw stderr' })
    const useUnified = createUnifiedCachedHook({
      useCachedHook, dataField: 'x', loadingField: 'isLoading',
      errorMode: 'message', errorMsg: 'friendly',
    })
    const r = useUnified()
    expect((r.error as Error).message).toBe('friendly')
  })

  it('errorMode=passthrough preserves original error string', () => {
    const useCachedHook = () => cached({ data: { x: 1 }, error: 'raw' })
    const useUnified = createUnifiedCachedHook({
      useCachedHook, dataField: 'x', loadingField: 'isLoading', errorMode: 'passthrough',
    })
    expect((useUnified().error as Error).message).toBe('raw')
  })

  it('errorMode=isFailed uses errorMsg when isFailed is true', () => {
    const useCachedHook = () => cached({ data: { x: 1 }, isFailed: true })
    const useUnified = createUnifiedCachedHook({
      useCachedHook, dataField: 'x', loadingField: 'isLoading',
      errorMode: 'isFailed', errorMsg: 'cache failed',
    })
    expect((useUnified().error as Error).message).toBe('cache failed')
  })

  it('errorMode=isFailed returns null when isFailed is false', () => {
    const useCachedHook = () => cached({ data: { x: 1 }, isFailed: false })
    const useUnified = createUnifiedCachedHook({
      useCachedHook, dataField: 'x', loadingField: 'isLoading',
      errorMode: 'isFailed', errorMsg: 'cache failed',
    })
    expect(useUnified().error).toBeNull()
  })

  it('optionalData=true falls back to [] when dataField is missing', () => {
    const useCachedHook = () => cached({ data: {} })
    const useUnified = createUnifiedCachedHook({
      useCachedHook, dataField: 'items', loadingField: 'isLoading',
      errorMode: 'passthrough', optionalData: true,
    })
    expect(useUnified().data).toEqual([])
  })

  it('refetchOverride takes precedence over wrapRefetch', () => {
    const overrideFn = vi.fn()
    const original = vi.fn()
    const useCachedHook = () => cached({ data: { x: 1 }, refetch: original })
    const useUnified = createUnifiedCachedHook({
      useCachedHook, dataField: 'x', loadingField: 'isLoading',
      errorMode: 'passthrough',
      refetchOverride: () => overrideFn,
      wrapRefetch: true,
    })
    useUnified().refetch()
    expect(overrideFn).toHaveBeenCalled()
    expect(original).not.toHaveBeenCalled()
  })

  it('returns noop refetch when result.refetch is missing and no overrides', () => {
    const useCachedHook = () => cached({ data: { x: 1 } })
    const useUnified = createUnifiedCachedHook({
      useCachedHook, dataField: 'x', loadingField: 'isLoading', errorMode: 'passthrough',
    })
    expect(() => useUnified().refetch()).not.toThrow()
  })
})
