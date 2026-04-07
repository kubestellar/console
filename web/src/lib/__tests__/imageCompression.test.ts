/**
 * Tests for imageCompression utility.
 *
 * Note: Canvas/Image operations don't work in jsdom, so we test
 * the module exports and types rather than the actual compression.
 * The actual Image-based compression is exercised in E2E tests.
 */
import { describe, it, expect } from 'vitest'
import { compressScreenshot } from '../imageCompression'

describe('compressScreenshot', () => {
  it('is an async function', () => {
    expect(typeof compressScreenshot).toBe('function')
  })

  it('returns a Promise', () => {
    // Don't await — jsdom Image doesn't fire events
    const result = compressScreenshot('data:image/png;base64,abc')
    expect(result).toBeInstanceOf(Promise)
  })
})
