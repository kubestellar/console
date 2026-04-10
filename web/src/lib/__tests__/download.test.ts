/**
 * Tests for download utility.
 *
 * Covers:
 * - safeRevokeObjectURL schedules URL.revokeObjectURL after a delay
 * - downloadBlob success path (#6226)
 * - downloadBlob failure path (#6226 — captures the exception)
 * - downloadText convenience wrapper
 * - downloadDataUrl for data: URL strings (chart exports)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { safeRevokeObjectURL, downloadBlob, downloadText, downloadDataUrl } from '../download'

describe('safeRevokeObjectURL', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not revoke immediately', () => {
    safeRevokeObjectURL('blob:http://localhost:3000/abc-123')
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })

  it('revokes after the delay', () => {
    const blobUrl = 'blob:http://localhost:3000/abc-123'
    safeRevokeObjectURL(blobUrl)

    vi.advanceTimersByTime(200)

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(blobUrl)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('handles multiple URLs independently', () => {
    const url1 = 'blob:http://localhost:3000/url-1'
    const url2 = 'blob:http://localhost:3000/url-2'

    safeRevokeObjectURL(url1)
    safeRevokeObjectURL(url2)

    vi.advanceTimersByTime(200)

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url2)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })
})

// #6226: downloadBlob should never throw — even when the underlying
// browser API fails. The whole point of the helper is that callers can
// surface a user-visible toast on failure instead of getting a white
// screen from an unhandled exception.
describe('downloadBlob (#6226)', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    // Stub anchor.click() so jsdom doesn't try to actually navigate.
    HTMLAnchorElement.prototype.click = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns ok=true on the success path', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' })
    const result = downloadBlob('hello.txt', blob)
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
  })

  it('returns ok=false with the error when createObjectURL throws', () => {
    vi.mocked(URL.createObjectURL).mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    const result = downloadBlob('hello.txt', new Blob(['hello']))
    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe('quota exceeded')
  })

  it('returns ok=false with the error when click() throws', () => {
    HTMLAnchorElement.prototype.click = vi.fn(() => {
      throw new Error('blocked by browser policy')
    })
    const result = downloadBlob('hello.txt', new Blob(['hello']))
    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe('blocked by browser policy')
  })

  it('removes the anchor from the DOM after the click (success path)', () => {
    const removeChildSpy = vi.spyOn(document.body, 'removeChild')
    downloadBlob('hello.txt', new Blob(['hello']))
    expect(removeChildSpy).toHaveBeenCalled()
  })

  it('removes the anchor from the DOM even on the failure path', () => {
    const removeChildSpy = vi.spyOn(document.body, 'removeChild')
    HTMLAnchorElement.prototype.click = vi.fn(() => {
      throw new Error('blocked')
    })
    downloadBlob('hello.txt', new Blob(['hello']))
    expect(removeChildSpy).toHaveBeenCalled()
  })
})

describe('downloadText (#6226)', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    HTMLAnchorElement.prototype.click = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('builds a Blob from the string and downloads it', () => {
    const result = downloadText('foo.yaml', 'apiVersion: v1', 'text/yaml')
    expect(result.ok).toBe(true)
    expect(URL.createObjectURL).toHaveBeenCalled()
    // The Blob the helper passed to createObjectURL should have our MIME
    const blobArg = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
    expect(blobArg.type).toBe('text/yaml')
  })

  it('uses text/plain as the default MIME type', () => {
    const result = downloadText('foo.txt', 'hello')
    expect(result.ok).toBe(true)
    const blobArg = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
    expect(blobArg.type).toContain('text/plain')
  })
})

describe('downloadDataUrl (#6226)', () => {
  beforeEach(() => {
    HTMLAnchorElement.prototype.click = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns ok=true and dispatches click on the success path', () => {
    const result = downloadDataUrl('chart.png', 'data:image/png;base64,iVBORw0K')
    expect(result.ok).toBe(true)
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
  })

  it('returns ok=false when click() throws', () => {
    HTMLAnchorElement.prototype.click = vi.fn(() => {
      throw new Error('blocked')
    })
    const result = downloadDataUrl('chart.png', 'data:image/png;base64,iVBORw0K')
    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe('blocked')
  })
})
