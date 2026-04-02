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

  it('handles error with undefined message property', () => {
    const error = new Error()
    ;(error as unknown as Record<string, unknown>).message = undefined as unknown as string
    expect(isChunkLoadError(error)).toBe(false)
  })

  it('detects chunk load error with extra context in message', () => {
    const error = new Error(
      'Uncaught (in promise): Failed to fetch dynamically imported module https://example.com/assets/Card-abc123.js'
    )
    expect(isChunkLoadError(error)).toBe(true)
  })

  it('detects Loading CSS chunk error from Error object', () => {
    const error = new Error('Loading CSS chunk dashboard-xyz failed')
    expect(isChunkLoadError(error)).toBe(true)
  })

  it('detects Unable to preload CSS from Error object', () => {
    const error = new Error('Unable to preload CSS for /assets/theme-dark.css')
    expect(isChunkLoadError(error)).toBe(true)
  })

  it('detects MIME type error from Error object', () => {
    const error = new Error('text/html is not a valid JavaScript MIME type')
    expect(isChunkLoadError(error)).toBe(true)
  })

  it('detects Safari import failure from Error object', () => {
    const error = new Error('Importing a module script failed.')
    expect(isChunkLoadError(error)).toBe(true)
  })

  it('detects stale chunk error from Error object', () => {
    const error = new Error('Export "default" not found in module -- chunk may be stale')
    expect(isChunkLoadError(error)).toBe(true)
  })
})

describe('isChunkLoadMessage edge cases', () => {
  it('matches substrings regardless of surrounding case', () => {
    // includes() is case-sensitive, but the full known substring appears in the message
    expect(isChunkLoadMessage('failed to fetch dynamically imported module')).toBe(true)
    // 'dynamically imported module' is a checked substring
    expect(isChunkLoadMessage('loading chunk 42 failed')).toBe(false)
    // 'Loading chunk' starts uppercase; lowercase 'loading' does not match
  })

  it('detects message embedded in longer string', () => {
    expect(isChunkLoadMessage('Error: Loading chunk abc123 failed (https://...)')).toBe(true)
  })

  it('returns false for partial keyword matches that do not form a known phrase', () => {
    expect(isChunkLoadMessage('Loading')).toBe(false)
    expect(isChunkLoadMessage('chunk')).toBe(false)
    expect(isChunkLoadMessage('dynamically')).toBe(false)
    expect(isChunkLoadMessage('imported')).toBe(false)
  })

  it('returns false for similar but non-matching phrases', () => {
    expect(isChunkLoadMessage('Failed to fetch static module')).toBe(false)
    expect(isChunkLoadMessage('Unable to preload JS')).toBe(false)
    expect(isChunkLoadMessage('is not a valid JSON MIME type')).toBe(false)
  })
})
