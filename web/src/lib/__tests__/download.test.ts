/**
 * Tests for download utility.
 *
 * Covers:
 * - safeRevokeObjectURL schedules URL.revokeObjectURL after a delay
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { safeRevokeObjectURL } from '../download'

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
