/**
 * Tests for pure fetch functions in useCachedQuantum.ts
 *
 * Covers: fetchQuantumStatus, fetchQuantumAuthStatus,
 * fetchQuantumCircuitAscii, fetchQuantumQubitGrid
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __testables } from '../useCachedQuantum'

const {
  fetchQuantumStatus,
  fetchQuantumAuthStatus,
  fetchQuantumCircuitAscii,
  fetchQuantumQubitGrid,
} = __testables

// ---------- Setup ----------

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
    text: async () => '',
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── fetchQuantumStatus ──

describe('fetchQuantumStatus', () => {
  it('fetches from correct endpoint', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'idle', running: false }),
    })
    await fetchQuantumStatus()
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/quantum/status',
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    )
  })

  it('returns parsed status data', async () => {
    const mockData = { status: 'running', running: true, qasm_file: 'bell.qasm', message: 'ok' }
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    })
    const result = await fetchQuantumStatus()
    expect(result).toEqual(mockData)
  })

  it('throws on non-ok response with body', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    })
    await expect(fetchQuantumStatus()).rejects.toThrow('Internal Server Error')
  })

  it('throws with status code when body is empty', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => '',
    })
    await expect(fetchQuantumStatus()).rejects.toThrow('503')
  })
})

// ── fetchQuantumAuthStatus ──

describe('fetchQuantumAuthStatus', () => {
  it('fetches from correct endpoint', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authenticated: true }),
    })
    await fetchQuantumAuthStatus()
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/quantum/auth/status',
      expect.objectContaining({ credentials: 'include' })
    )
  })

  it('returns authenticated true when response says true', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authenticated: true }),
    })
    const result = await fetchQuantumAuthStatus()
    // Pre-v0.4 workload — only `authenticated` is set; new fields coerce to safe defaults.
    expect(result).toEqual({
      authenticated: true,
      tokenStored: false,
      lastIbmError: null,
    })
  })

  it('returns authenticated false when response says false', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authenticated: false }),
    })
    const result = await fetchQuantumAuthStatus()
    expect(result).toEqual({
      authenticated: false,
      tokenStored: false,
      lastIbmError: null,
    })
  })

  it('returns authenticated false when field is missing', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    })
    const result = await fetchQuantumAuthStatus()
    expect(result).toEqual({
      authenticated: false,
      tokenStored: false,
      lastIbmError: null,
    })
  })

  it('passes through tokenStored and lastIbmError from a v0.4.0+ workload response', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authenticated: false,
        tokenStored: true,
        lastIbmError: {
          code: 'rate_limited',
          message: 'rate limit exceeded',
          retryable: true,
        },
      }),
    })
    const result = await fetchQuantumAuthStatus()
    expect(result).toEqual({
      authenticated: false,
      tokenStored: true,
      lastIbmError: {
        code: 'rate_limited',
        message: 'rate limit exceeded',
        retryable: true,
      },
    })
  })

  it('coerces missing tokenStored field to false (older workload compat)', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authenticated: true }),
    })
    const result = await fetchQuantumAuthStatus()
    expect(result.tokenStored).toBe(false)
    expect(result.lastIbmError).toBeNull()
  })

  describe('lastIbmError boundary validation', () => {
    // The fetcher must coerce malformed `lastIbmError` payloads to null so
    // downstream UI doesn't suppress the message-text classifier fallback
    // while having no usable structured payload to render.
    const malformedCases: Array<[string, unknown]> = [
      ['missing retryable field', { code: 'rate_limited', message: 'foo' }],
      ['missing message field', { code: 'rate_limited', retryable: true }],
      ['missing code field', { message: 'foo', retryable: true }],
      ['retryable not a boolean', { code: 'rate_limited', message: 'foo', retryable: 'true' }],
      ['code not a string', { code: 429, message: 'foo', retryable: true }],
      ['message not a string', { code: 'rate_limited', message: 42, retryable: true }],
      ['payload is a string', 'service unavailable'],
      ['payload is a number', 503],
      ['payload is an array', ['rate_limited']],
    ]

    for (const [label, malformed] of malformedCases) {
      it(`coerces to null when payload is malformed: ${label}`, async () => {
        ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            authenticated: false,
            tokenStored: true,
            lastIbmError: malformed,
          }),
        })
        const result = await fetchQuantumAuthStatus()
        expect(result.lastIbmError).toBeNull()
      })
    }

    it('accepts an unrecognized code value (forward-compat with future workload codes)', async () => {
      // If a future workload adds a new error code we don't know about,
      // we should still surface its message + retryable flag rather than
      // silently dropping the structured payload.
      ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authenticated: false,
          tokenStored: true,
          lastIbmError: {
            code: 'future_code_we_do_not_know_about',
            message: 'something happened',
            retryable: true,
          },
        }),
      })
      const result = await fetchQuantumAuthStatus()
      expect(result.lastIbmError).not.toBeNull()
      expect(result.lastIbmError?.message).toBe('something happened')
      expect(result.lastIbmError?.retryable).toBe(true)
    })

    it('accepts explicit null (workload says "no error")', async () => {
      ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authenticated: true,
          tokenStored: true,
          lastIbmError: null,
        }),
      })
      const result = await fetchQuantumAuthStatus()
      expect(result.lastIbmError).toBeNull()
    })
  })

  it('throws on non-ok response', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    })
    await expect(fetchQuantumAuthStatus()).rejects.toThrow('Unauthorized')
  })
})

// ── fetchQuantumCircuitAscii ──

describe('fetchQuantumCircuitAscii', () => {
  it('fetches from correct endpoint', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => '<pre>circuit</pre>',
    })
    await fetchQuantumCircuitAscii()
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/quantum/qasm/circuit/ascii',
      expect.objectContaining({ credentials: 'include' })
    )
  })

  it('parses circuit from pre tag', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => '<pre>q_0: ┤ H ├</pre>',
    })
    const result = await fetchQuantumCircuitAscii()
    expect(result.circuitAscii).toBe('q_0: ┤ H ├')
  })

  it('throws when no pre tag found', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => '<div>no circuit here</div>',
    })
    await expect(fetchQuantumCircuitAscii()).rejects.toThrow('No circuit data found')
  })

  it('throws on non-ok response', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
    })
    await expect(fetchQuantumCircuitAscii()).rejects.toThrow('404')
  })
})

// ── fetchQuantumQubitGrid ──

describe('fetchQuantumQubitGrid', () => {
  it('returns qubit data and version info on success', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ num_qubits: 2, pattern: '00' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'idle',
          running: false,
          version_info: { version: 'v1.0', commit: 'abc', timestamp: '2026' },
        }),
      })
    const result = await fetchQuantumQubitGrid()
    expect(result.qubits).toEqual({ num_qubits: 2, pattern: '00' })
    expect(result.versionInfo?.version).toBe('v1.0')
  })

  it('returns null versionInfo when status fetch fails', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ num_qubits: 2, pattern: '00' }),
      })
      .mockRejectedValueOnce(new Error('status fetch failed'))
    const result = await fetchQuantumQubitGrid()
    expect(result.qubits).toEqual({ num_qubits: 2, pattern: '00' })
    expect(result.versionInfo).toBeNull()
  })

  it('returns null qubits when response has error field', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 'no qubits available' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'idle', running: false }),
      })
    const result = await fetchQuantumQubitGrid()
    expect(result.qubits).toBeNull()
  })

  it('throws when qubit fetch fails', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Server Error',
    })
    await expect(fetchQuantumQubitGrid()).rejects.toThrow('Server Error')
  })
})