import { describe, it, expect, vi, beforeEach } from 'vitest'
import { copyToClipboard, copyBlobToClipboard } from '../clipboard'

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

  // --- New edge case tests ---

  it('passes the exact text to clipboard.writeText', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    await copyToClipboard('specific text value')
    expect(writeText).toHaveBeenCalledWith('specific text value')
  })

  it('copies an empty string successfully via clipboard API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    const result = await copyToClipboard('')
    expect(result).toBe(true)
    expect(writeText).toHaveBeenCalledWith('')
  })

  it('copies multiline text with special characters', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    const multiline = 'line1\nline2\ttab\r\nwindows-line'
    const result = await copyToClipboard(multiline)
    expect(result).toBe(true)
    expect(writeText).toHaveBeenCalledWith(multiline)
  })

  it('copies text containing unicode and emoji characters', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    const unicode = '日本語テスト 🎉 café résumé'
    const result = await copyToClipboard(unicode)
    expect(result).toBe(true)
    expect(writeText).toHaveBeenCalledWith(unicode)
  })

  it('creates and removes a textarea element in fallback path', async () => {
    // No clipboard API — forces fallback
    const appendSpy = vi.spyOn(document.body, 'appendChild')
    const removeSpy = vi.spyOn(document.body, 'removeChild')
    document.execCommand = vi.fn().mockReturnValue(true)

    await copyToClipboard('fallback text')

    // Should have appended and then removed a textarea
    expect(appendSpy).toHaveBeenCalledTimes(1)
    const appended = appendSpy.mock.calls[0][0] as HTMLTextAreaElement
    expect(appended.tagName).toBe('TEXTAREA')
    expect(appended.value).toBe('fallback text')
    expect(removeSpy).toHaveBeenCalledTimes(1)

    appendSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('positions the fallback textarea off-screen', async () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild')
    document.execCommand = vi.fn().mockReturnValue(true)

    await copyToClipboard('hidden text')

    const textarea = appendSpy.mock.calls[0][0] as HTMLTextAreaElement
    expect(textarea.style.position).toBe('fixed')
    expect(textarea.style.left).toBe('-9999px')
    expect(textarea.style.top).toBe('-9999px')
    expect(textarea.style.opacity).toBe('0')

    appendSpy.mockRestore()
  })

  it('returns false when execCommand returns false (copy not supported)', async () => {
    document.execCommand = vi.fn().mockReturnValue(false)

    const result = await copyToClipboard('will fail')
    expect(result).toBe(false)
  })

  it('handles clipboard API where writeText exists but is not a function', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: 'not-a-function',
      },
      writable: true,
      configurable: true,
    })
    document.execCommand = vi.fn().mockReturnValue(true)

    const result = await copyToClipboard('fallback needed')
    expect(result).toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('handles clipboard object existing but writeText being undefined', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {},
      writable: true,
      configurable: true,
    })
    document.execCommand = vi.fn().mockReturnValue(true)

    const result = await copyToClipboard('no writeText')
    expect(result).toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('copies very long text via clipboard API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    const longText = 'a'.repeat(100_000)
    const result = await copyToClipboard(longText)
    expect(result).toBe(true)
    expect(writeText).toHaveBeenCalledWith(longText)
  })
})

// ── copyBlobToClipboard ──

describe('copyBlobToClipboard', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    // Reset ClipboardItem
    ;(globalThis as Record<string, unknown>).ClipboardItem = undefined
  })

  it('returns false when clipboard.write is not available', async () => {
    const result = await copyBlobToClipboard(new Blob(['data'], { type: 'text/plain' }))
    expect(result).toBe(false)
  })

  it('returns false when ClipboardItem is not a function', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { write: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
    ;(globalThis as Record<string, unknown>).ClipboardItem = 'not-a-function'
    const result = await copyBlobToClipboard(new Blob(['data'], { type: 'image/png' }))
    expect(result).toBe(false)
  })

  it('returns true when clipboard.write and ClipboardItem both work', async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { write: writeMock },
      writable: true,
      configurable: true,
    })
    ;(globalThis as Record<string, unknown>).ClipboardItem = class {
      constructor(public data: Record<string, Blob>) {}
    }
    const blob = new Blob(['img'], { type: 'image/png' })
    const result = await copyBlobToClipboard(blob)
    expect(result).toBe(true)
    expect(writeMock).toHaveBeenCalledTimes(1)
  })

  it('returns false when clipboard.write throws', async () => {
    const writeMock = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', {
      value: { write: writeMock },
      writable: true,
      configurable: true,
    })
    ;(globalThis as Record<string, unknown>).ClipboardItem = class {
      constructor(public data: Record<string, Blob>) {}
    }
    const blob = new Blob(['img'], { type: 'image/png' })
    const result = await copyBlobToClipboard(blob)
    expect(result).toBe(false)
  })

  it('handles null navigator gracefully', async () => {
    const result = await copyBlobToClipboard(new Blob(['data']))
    expect(result).toBe(false)
  })
})
