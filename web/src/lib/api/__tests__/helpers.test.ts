/**
 * Unit tests for web/src/lib/api/helpers.ts (Refs #21526).
 *
 * Covers the pure utilities extracted from lib/api.ts as part of the
 * scanner-refactor split (#21384 / #21375):
 *   - createErrorWithCause
 *   - isAbortError
 *   - safeReadTextOrEmpty
 *   - safeParseJsonOrNull
 *   - safeJson
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createErrorWithCause,
  isAbortError,
  safeReadTextOrEmpty,
  safeParseJsonOrNull,
  safeJson,
} from '../helpers'

function makeResponse(init: {
  status?: number
  contentType?: string | null
  contentLength?: string | null
  textImpl?: () => Promise<string>
  jsonImpl?: () => Promise<unknown>
}): Response {
  const headers = new Map<string, string>()
  if (init.contentType !== null && init.contentType !== undefined) headers.set('content-type', init.contentType)
  if (init.contentLength !== null && init.contentLength !== undefined) headers.set('content-length', init.contentLength)
  return {
    status: init.status ?? 200,
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    },
    text: init.textImpl ?? (async () => ''),
    json: init.jsonImpl ?? (async () => ({})),
  } as unknown as Response
}

describe('createErrorWithCause', () => {
  it('returns an Error with the given message', () => {
    const err = createErrorWithCause('boom', new Error('root'))
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('boom')
  })

  it('attaches the cause property', () => {
    const cause = new Error('root cause')
    const err = createErrorWithCause('outer', cause) as Error & { cause?: unknown }
    expect(err.cause).toBe(cause)
  })

  it('accepts non-Error cause values (string, number, object, null)', () => {
    const cases: unknown[] = ['bad', 42, { code: 'X' }, null]
    for (const c of cases) {
      const err = createErrorWithCause('m', c) as Error & { cause?: unknown }
      expect(err.cause).toBe(c)
    }
  })
})

describe('isAbortError', () => {
  it('returns true for objects with name === "AbortError"', () => {
    expect(isAbortError({ name: 'AbortError' })).toBe(true)
  })

  it('returns true for real DOMException AbortError', () => {
    const err = new DOMException('aborted', 'AbortError')
    expect(isAbortError(err)).toBe(true)
  })

  it('returns true for Error whose name is set to AbortError', () => {
    const err = new Error('x')
    err.name = 'AbortError'
    expect(isAbortError(err)).toBe(true)
  })

  it('returns false for other Error types', () => {
    expect(isAbortError(new Error('other'))).toBe(false)
    expect(isAbortError(new TypeError('t'))).toBe(false)
  })

  it('returns false for null / undefined / primitives', () => {
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
    expect(isAbortError('AbortError')).toBe(false)
    expect(isAbortError(42)).toBe(false)
    expect(isAbortError(true)).toBe(false)
  })

  it('returns false when name field is missing or wrong', () => {
    expect(isAbortError({})).toBe(false)
    expect(isAbortError({ name: 'Other' })).toBe(false)
    expect(isAbortError({ name: 123 })).toBe(false)
  })
})

describe('safeReadTextOrEmpty', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('returns the response body text on success', async () => {
    const res = makeResponse({ textImpl: async () => 'hello world' })
    await expect(safeReadTextOrEmpty(res, 'ctx')).resolves.toBe('hello world')
  })

  it('returns empty string when text() rejects and logs a warning', async () => {
    const res = makeResponse({
      textImpl: async () => {
        throw new Error('stream drained')
      },
    })
    await expect(safeReadTextOrEmpty(res, 'ctx-a')).resolves.toBe('')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0][0])).toContain('ctx-a')
    expect(String(warnSpy.mock.calls[0][0])).toContain('stream drained')
  })

  it('returns empty string when text() returns empty', async () => {
    const res = makeResponse({ textImpl: async () => '' })
    await expect(safeReadTextOrEmpty(res, 'ctx')).resolves.toBe('')
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

describe('safeParseJsonOrNull', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('returns empty object for HTTP 204 No Content', async () => {
    const res = makeResponse({ status: 204 })
    await expect(safeParseJsonOrNull(res, 'ctx')).resolves.toEqual({})
  })

  it('returns empty object when content-length is "0"', async () => {
    const res = makeResponse({ status: 200, contentLength: '0' })
    await expect(safeParseJsonOrNull(res, 'ctx')).resolves.toEqual({})
  })

  it('returns empty object when body text is empty', async () => {
    const res = makeResponse({ status: 200, textImpl: async () => '' })
    await expect(safeParseJsonOrNull(res, 'ctx')).resolves.toEqual({})
  })

  it('returns empty object when body text is only whitespace', async () => {
    const res = makeResponse({ status: 200, textImpl: async () => '   \n  ' })
    await expect(safeParseJsonOrNull(res, 'ctx')).resolves.toEqual({})
  })

  it('returns parsed object for valid JSON', async () => {
    const res = makeResponse({ status: 200, textImpl: async () => '{"foo":42,"bar":"baz"}' })
    await expect(safeParseJsonOrNull(res, 'ctx')).resolves.toEqual({ foo: 42, bar: 'baz' })
  })

  it('returns parsed array for valid JSON array', async () => {
    const res = makeResponse({ status: 200, textImpl: async () => '[1,2,3]' })
    await expect(safeParseJsonOrNull<number[]>(res, 'ctx')).resolves.toEqual([1, 2, 3])
  })

  it('returns null and warns when JSON is malformed', async () => {
    const res = makeResponse({ status: 200, textImpl: async () => '{not-json' })
    await expect(safeParseJsonOrNull(res, 'bad-json')).resolves.toBeNull()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0][0])).toContain('bad-json')
  })

  it('returns null and warns when text() rejects', async () => {
    const res = makeResponse({
      status: 200,
      textImpl: async () => {
        throw new Error('drained')
      },
    })
    await expect(safeParseJsonOrNull(res, 'ctx-x')).resolves.toBeNull()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0][0])).toContain('ctx-x')
  })

  it('short-circuits 204 before touching text()', async () => {
    const textImpl = vi.fn(async () => 'should-not-be-called')
    const res = makeResponse({ status: 204, textImpl })
    await safeParseJsonOrNull(res, 'ctx')
    expect(textImpl).not.toHaveBeenCalled()
  })

  it('short-circuits content-length 0 before touching text()', async () => {
    const textImpl = vi.fn(async () => 'should-not-be-called')
    const res = makeResponse({ status: 200, contentLength: '0', textImpl })
    await safeParseJsonOrNull(res, 'ctx')
    expect(textImpl).not.toHaveBeenCalled()
  })
})

describe('safeJson', () => {
  it('parses JSON when content-type is application/json', async () => {
    const payload = { hello: 'world' }
    const res = makeResponse({
      status: 200,
      contentType: 'application/json',
      jsonImpl: async () => payload,
    })
    await expect(safeJson(res)).resolves.toEqual(payload)
  })

  it('parses JSON when content-type has charset suffix', async () => {
    const res = makeResponse({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      jsonImpl: async () => ({ ok: true }),
    })
    await expect(safeJson(res)).resolves.toEqual({ ok: true })
  })

  it('throws a descriptive error when content-type is text/html (SPA catch-all)', async () => {
    const res = makeResponse({ status: 200, contentType: 'text/html; charset=utf-8' })
    await expect(safeJson(res)).rejects.toThrow(/Expected JSON response/)
    await expect(safeJson(res)).rejects.toThrow(/text\/html/)
    await expect(safeJson(res)).rejects.toThrow(/status 200/)
  })

  it('throws when content-type header is missing', async () => {
    const res = makeResponse({ status: 500, contentType: null })
    await expect(safeJson(res)).rejects.toThrow(/unknown content-type/)
    await expect(safeJson(res)).rejects.toThrow(/status 500/)
  })

  it('throws when content-type is empty string', async () => {
    const res = makeResponse({ status: 502, contentType: '' })
    await expect(safeJson(res)).rejects.toThrow(/unknown content-type/)
    await expect(safeJson(res)).rejects.toThrow(/status 502/)
  })

  it('does not swallow errors from json() itself', async () => {
    const res = makeResponse({
      status: 200,
      contentType: 'application/json',
      jsonImpl: async () => {
        throw new SyntaxError('unexpected end of JSON')
      },
    })
    await expect(safeJson(res)).rejects.toThrow(SyntaxError)
  })
})
