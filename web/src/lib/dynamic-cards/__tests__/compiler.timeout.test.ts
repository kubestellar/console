import { act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const neverResolvingModule = new Promise<never>(() => {})

describe('compileCardCode timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.doUnmock('sucrase')
    vi.doUnmock('../scope')
  })

  it('returns a timeout error when the compiler never resolves', async () => {
    vi.doMock('../scope', () => ({
      getDynamicScope: () => ({}),
    }))
    vi.doMock('sucrase', async () => await neverResolvingModule)

    const { compileCardCode, CARD_COMPILE_TIMEOUT_MS } = await import('../compiler')

    const resultPromise = compileCardCode('export default function Card() { return null }')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CARD_COMPILE_TIMEOUT_MS)
    })

    await expect(resultPromise).resolves.toEqual({
      code: null,
      error: `Compilation error: timed out after ${CARD_COMPILE_TIMEOUT_MS}ms. Please try again.`,
    })
  })
})
