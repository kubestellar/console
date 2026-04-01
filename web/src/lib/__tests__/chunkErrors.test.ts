import { describe, it, expect } from 'vitest'
import { isChunkLoadError, isChunkLoadMessage, CHUNK_RELOAD_TS_KEY } from '../chunkErrors'

describe('CHUNK_RELOAD_TS_KEY', () => {
  it('is a non-empty string constant', () => {
    expect(typeof CHUNK_RELOAD_TS_KEY).toBe('string')
    expect(CHUNK_RELOAD_TS_KEY.length).toBeGreaterThan(0)
  })
})

describe('isChunkLoadMessage', () => {
  it('detects "Failed to fetch dynamically imported module"', () => {
    expect(isChunkLoadMessage('Failed to fetch dynamically imported module /assets/foo.js')).toBe(true)
  })

  it('detects "Loading chunk"', () => {
    expect(isChunkLoadMessage('Loading chunk 42 failed')).toBe(true)
  })

  it('detects "Loading CSS chunk"', () => {
    expect(isChunkLoadMessage('Loading CSS chunk foo failed')).toBe(true)
  })

  it('detects "dynamically imported module"', () => {
    expect(isChunkLoadMessage('error loading dynamically imported module')).toBe(true)
  })

  it('detects "Unable to preload CSS"', () => {
    expect(isChunkLoadMessage('Unable to preload CSS for /assets/style.css')).toBe(true)
  })

  it('detects "is not a valid JavaScript MIME type"', () => {
    expect(isChunkLoadMessage('text/html is not a valid JavaScript MIME type')).toBe(true)
  })

  it('detects Safari dynamic import failure', () => {
    expect(isChunkLoadMessage('Importing a module script failed')).toBe(true)
  })

  it('detects safeLazy stale chunk', () => {
    expect(isChunkLoadMessage('Export "Foo" not found in module — chunk may be stale')).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isChunkLoadMessage('TypeError: Cannot read properties of null')).toBe(false)
    expect(isChunkLoadMessage('')).toBe(false)
    expect(isChunkLoadMessage('Network error')).toBe(false)
  })
})

describe('isChunkLoadError', () => {
  it('detects chunk load errors from Error objects', () => {
    const error = new Error('Failed to fetch dynamically imported module /assets/foo.js')
    expect(isChunkLoadError(error)).toBe(true)
  })

  it('returns false for non-chunk errors', () => {
    const error = new Error('Something went wrong')
    expect(isChunkLoadError(error)).toBe(false)
  })

  it('handles error with empty message', () => {
    const error = new Error('')
    expect(isChunkLoadError(error)).toBe(false)
  })
})
