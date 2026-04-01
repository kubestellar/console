import { describe, it, expect, vi, beforeEach } from 'vitest'
import { copyToClipboard } from '../clipboard'

describe('copyToClipboard', () => {
  beforeEach(() => {
    // Reset clipboard mock
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    })
  })

  it('returns true when clipboard API works', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    })
    const result = await copyToClipboard('hello')
    expect(result).toBe(true)
  })

  it('falls back to execCommand when clipboard API is unavailable', async () => {
    // No clipboard API
    const execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand

    const result = await copyToClipboard('hello')
    expect(result).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('returns false when all methods fail', async () => {
    document.execCommand = vi.fn().mockImplementation(() => { throw new Error('not supported') })

    const result = await copyToClipboard('hello')
    expect(result).toBe(false)
  })

  it('falls back when clipboard API throws', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
      writable: true,
      configurable: true,
    })
    document.execCommand = vi.fn().mockReturnValue(true)

    const result = await copyToClipboard('hello')
    expect(result).toBe(true)
  })
})
