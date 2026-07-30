// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  readCappedRequestBuffer,
  readCappedRequestText,
  readCappedRequestJson,
  RequestBodyTooLargeError,
} from '../_shared/read-capped-request'

function makeRequest(body: string | null): Request {
  return new Request('http://localhost/test', {
    method: 'POST',
    body,
  })
}

function makeLargeRequest(size: number): Request {
  const data = 'x'.repeat(size)
  return makeRequest(data)
}

describe('readCappedRequestBuffer', () => {
  it('returns empty Uint8Array for request with no body', async () => {
    const req = new Request('http://localhost/test', { method: 'GET' })
    const result = await readCappedRequestBuffer(req, 1024)
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.byteLength).toBe(0)
  })

  it('reads body within size limit', async () => {
    const req = makeRequest('hello')
    const result = await readCappedRequestBuffer(req, 1024)
    expect(new TextDecoder().decode(result)).toBe('hello')
  })

  it('reads body at exact size limit', async () => {
    const body = 'x'.repeat(10)
    const req = makeRequest(body)
    const result = await readCappedRequestBuffer(req, 10)
    expect(result.byteLength).toBe(10)
  })

  it('throws RequestBodyTooLargeError when body exceeds limit', async () => {
    const req = makeLargeRequest(100)
    await expect(readCappedRequestBuffer(req, 50, 'test-label')).rejects.toThrow(
      RequestBodyTooLargeError,
    )
  })

  it('includes label in error message', async () => {
    const req = makeLargeRequest(100)
    await expect(readCappedRequestBuffer(req, 50, 'my-endpoint')).rejects.toThrow(
      /my-endpoint/,
    )
  })

  it('includes actual byte count in error', async () => {
    const req = makeLargeRequest(200)
    try {
      await readCappedRequestBuffer(req, 10, 'test')
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(RequestBodyTooLargeError)
      expect((err as Error).message).toContain('limit 10')
    }
  })

  it('returns empty Uint8Array for empty string body', async () => {
    const req = makeRequest('')
    const result = await readCappedRequestBuffer(req, 1024)
    expect(result.byteLength).toBe(0)
  })
})

describe('readCappedRequestText', () => {
  it('reads text body within limit', async () => {
    const req = makeRequest('hello world')
    const result = await readCappedRequestText(req, 1024)
    expect(result).toBe('hello world')
  })

  it('throws on oversized body', async () => {
    const req = makeLargeRequest(100)
    await expect(readCappedRequestText(req, 50)).rejects.toThrow(RequestBodyTooLargeError)
  })

  it('handles UTF-8 content', async () => {
    const req = makeRequest('héllo wörld 🌍')
    const result = await readCappedRequestText(req, 1024)
    expect(result).toBe('héllo wörld 🌍')
  })
})

describe('readCappedRequestJson', () => {
  it('parses valid JSON within limit', async () => {
    const data = { user: 'alice', role: 'admin' }
    const req = makeRequest(JSON.stringify(data))
    const result = await readCappedRequestJson<typeof data>(req, 1024)
    expect(result).toEqual(data)
  })

  it('throws on oversized JSON body', async () => {
    const bigObj = { data: 'x'.repeat(200) }
    const req = makeRequest(JSON.stringify(bigObj))
    await expect(readCappedRequestJson(req, 50)).rejects.toThrow(RequestBodyTooLargeError)
  })

  it('throws on invalid JSON', async () => {
    const req = makeRequest('not valid json {{{')
    await expect(readCappedRequestJson(req, 1024)).rejects.toThrow()
  })

  it('parses JSON arrays', async () => {
    const data = [1, 2, 3]
    const req = makeRequest(JSON.stringify(data))
    const result = await readCappedRequestJson<number[]>(req, 1024)
    expect(result).toEqual([1, 2, 3])
  })
})

describe('RequestBodyTooLargeError', () => {
  it('has correct name', () => {
    const err = new RequestBodyTooLargeError('test', 100, 200)
    expect(err.name).toBe('RequestBodyTooLargeError')
  })

  it('is an instance of Error', () => {
    const err = new RequestBodyTooLargeError('test', 100, 200)
    expect(err).toBeInstanceOf(Error)
  })

  it('includes all details in message', () => {
    const err = new RequestBodyTooLargeError('upload', 1024, 2048)
    expect(err.message).toContain('upload')
    expect(err.message).toContain('1024')
    expect(err.message).toContain('2048')
  })
})
