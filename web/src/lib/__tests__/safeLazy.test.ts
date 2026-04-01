import { describe, it, expect } from 'vitest'
import { safeLazy } from '../safeLazy'

describe('safeLazy', () => {
  it('returns a lazy component', () => {
    const LazyComp = safeLazy(
      () => Promise.resolve({ TestComp: () => null }),
      'TestComp',
    )
    expect(LazyComp).toBeDefined()
    expect(typeof LazyComp).toBe('object') // React.lazy returns an object
  })

  it('throws descriptive error when module is null', async () => {
    const LazyComp = safeLazy(
      () => Promise.resolve(null as unknown as Record<string, unknown>),
      'Foo',
    )

    try {
      // Access the internal loader
      const loader = (LazyComp as unknown as { _init: unknown; _payload: { _result: () => Promise<unknown> } })._payload._result
      await loader()
      expect.fail('should have thrown')
    } catch (e: unknown) {
      expect((e as Error).message).toContain('chunk may be stale')
    }
  })

  it('throws descriptive error when export is missing', async () => {
    const LazyComp = safeLazy(
      () => Promise.resolve({ OtherExport: () => null }),
      'MissingExport',
    )

    try {
      const loader = (LazyComp as unknown as { _init: unknown; _payload: { _result: () => Promise<unknown> } })._payload._result
      await loader()
      expect.fail('should have thrown')
    } catch (e: unknown) {
      expect((e as Error).message).toContain('MissingExport')
      expect((e as Error).message).toContain('chunk may be stale')
    }
  })
})
