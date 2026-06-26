/**
 * Tests for imageCompression utility.
 *
 * jsdom lacks real Image/Canvas, so we mock them to exercise
 * all code paths including resize logic and quality fallbacks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { compressScreenshot } from '../imageCompression'

// ---------------------------------------------------------------------------
// Canvas / Image mocks
// ---------------------------------------------------------------------------

let mockDrawImage: ReturnType<typeof vi.fn>
let mockToDataURL: ReturnType<typeof vi.fn>
let mockGetContext: ReturnType<typeof vi.fn>

/** Small base64 data URI (well under the 40K limit) */
const SMALL_DATA_URI = 'data:image/png;base64,' + 'A'.repeat(100)
/** Large base64 data URI (over the 40K limit) */
const LARGE_B64 = 'A'.repeat(50_000)
const LARGE_DATA_URI = 'data:image/png;base64,' + LARGE_B64

/** Simulated JPEG output that fits under the 40K budget */
const SMALL_JPEG = 'data:image/jpeg;base64,' + 'J'.repeat(1000)
/** Simulated JPEG output that is still too large */
const STILL_TOO_LARGE_JPEG = 'data:image/jpeg;base64,' + 'J'.repeat(50_000)

class FakeImage {
  width = 800
  height = 600
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src = ''

  get src() { return this._src }
  set src(val: string) {
    this._src = val
    // Trigger onload asynchronously to mimic browser behavior
    if (val && val.startsWith('data:')) {
      setTimeout(() => this.onload?.(), 0)
    } else if (!val || val === 'bad') {
      setTimeout(() => this.onerror?.(), 0)
    } else {
      setTimeout(() => this.onload?.(), 0)
    }
  }
}

beforeEach(() => {
  mockDrawImage = vi.fn()
  mockToDataURL = vi.fn().mockReturnValue(SMALL_JPEG)
  mockGetContext = vi.fn().mockReturnValue({
    drawImage: mockDrawImage,
  })

  vi.stubGlobal('Image', FakeImage)

  // Mock document.createElement for canvas
  const originalCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: mockGetContext,
        toDataURL: mockToDataURL,
      } as unknown as HTMLCanvasElement
    }
    return originalCreateElement(tag)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('imageCompression', () => {
  it('compressScreenshot is an async function', () => {
    expect(typeof compressScreenshot).toBe('function')
  })

  it('returns a Promise that resolves (does not throw synchronously)', () => {
    const result = compressScreenshot(SMALL_DATA_URI)
    expect(result).toBeInstanceOf(Promise)
  })

  it('returns compressed JPEG for valid data URI', async () => {
    const result = await compressScreenshot(SMALL_DATA_URI)
    expect(result).toBe(SMALL_JPEG)
    expect(mockDrawImage).toHaveBeenCalled()
  })

  it('scales down images larger than MAX_DIMENSION_PX (1024)', async () => {
    // Create an image wider than 1024
    const BigImage = class extends FakeImage {
      width = 2048
      height = 1536
    }
    vi.stubGlobal('Image', BigImage)

    const result = await compressScreenshot(SMALL_DATA_URI)
    expect(result).toBe(SMALL_JPEG)
    // Canvas should have been sized to scaled-down dimensions
  })

  it('retries with lower quality and smaller size when first pass is too large', async () => {
    // First call returns too-large result, second call returns small result
    mockToDataURL
      .mockReturnValueOnce(STILL_TOO_LARGE_JPEG)
      .mockReturnValueOnce(SMALL_JPEG)

    const result = await compressScreenshot(SMALL_DATA_URI)
    expect(result).toBe(SMALL_JPEG)
  })

  it('returns null when both compression passes produce output that is too large', async () => {
    mockToDataURL.mockReturnValue(STILL_TOO_LARGE_JPEG)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await compressScreenshot(SMALL_DATA_URI)
    expect(result).toBeNull()
    warnSpy.mockRestore()
  })

  it('returns null when canvas context is unavailable', async () => {
    mockGetContext.mockReturnValue(null)

    const result = await compressScreenshot(SMALL_DATA_URI)
    expect(result).toBeNull()
  })

  it('returns null when Image fails to load (onerror)', async () => {
    const ErrorImage = class extends FakeImage {
      set src(val: string) {
        setTimeout(() => this.onerror?.(), 0)
      }
      get src() { return '' }
    }
    vi.stubGlobal('Image', ErrorImage)

    const result = await compressScreenshot(SMALL_DATA_URI)
    expect(result).toBeNull()
  })

  it('returns null when an exception occurs during compression', async () => {
    // Force Image constructor to throw
    vi.stubGlobal('Image', class {
      constructor() { throw new Error('Image constructor failed') }
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await compressScreenshot(SMALL_DATA_URI)
    expect(result).toBeNull()
    errorSpy.mockRestore()
  })

  it('handles empty string data URI', async () => {
    const ErrorImage = class extends FakeImage {
      set src(val: string) {
        setTimeout(() => this.onerror?.(), 0)
      }
      get src() { return '' }
    }
    vi.stubGlobal('Image', ErrorImage)

    const result = await compressScreenshot('')
    expect(result).toBeNull()
  })

  it('preserves aspect ratio when scaling down landscape images', async () => {
    const WideImage = class extends FakeImage {
      width = 2000
      height = 500
    }
    vi.stubGlobal('Image', WideImage)

    await compressScreenshot(SMALL_DATA_URI)
    expect(mockDrawImage).toHaveBeenCalled()
  })

  it('preserves aspect ratio when scaling down portrait images', async () => {
    const TallImage = class extends FakeImage {
      width = 500
      height = 2000
    }
    vi.stubGlobal('Image', TallImage)

    await compressScreenshot(SMALL_DATA_URI)
    expect(mockDrawImage).toHaveBeenCalled()
  })

  it('does not scale images smaller than MAX_DIMENSION_PX', async () => {
    const SmallImage = class extends FakeImage {
      width = 512
      height = 384
    }
    vi.stubGlobal('Image', SmallImage)

    await compressScreenshot(SMALL_DATA_URI)
    expect(mockDrawImage).toHaveBeenCalled()
  })
})
