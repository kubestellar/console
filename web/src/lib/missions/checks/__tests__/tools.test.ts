import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../i18n', () => ({
  default: {
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key
      const parts = Object.entries(opts).map(([k, v]) => `${k}=${String(v)}`).join(',')
      return `${key}(${parts})`
    },
  },
}))

import { resolveRequiredTools, runToolPreflightCheck } from '../tools'
import type { ToolCheckResult } from '../types'

describe('resolveRequiredTools', () => {
  it('returns explicit tools when provided (non-empty)', () => {
    expect(resolveRequiredTools('deploy', ['foo', 'bar'])).toEqual(['foo', 'bar'])
  })

  it('falls back to defaults when explicit tools is an empty array', () => {
    expect(resolveRequiredTools('deploy', [])).toEqual(['kubectl', 'helm'])
  })

  it('returns default + missionType-specific tools for known types', () => {
    expect(resolveRequiredTools('deploy')).toEqual(['kubectl', 'helm'])
    expect(resolveRequiredTools('upgrade')).toEqual(['kubectl', 'helm'])
    expect(resolveRequiredTools('maintain')).toEqual(['kubectl', 'helm'])
    expect(resolveRequiredTools('repair')).toEqual(['kubectl'])
    expect(resolveRequiredTools('troubleshoot')).toEqual(['kubectl'])
    expect(resolveRequiredTools('analyze')).toEqual(['kubectl'])
    expect(resolveRequiredTools('custom')).toEqual(['kubectl'])
  })

  it('returns just defaults for unknown mission types', () => {
    expect(resolveRequiredTools('mystery')).toEqual(['kubectl'])
  })

  it('returns defaults when no mission type is given', () => {
    expect(resolveRequiredTools()).toEqual(['kubectl'])
  })

  it('deduplicates default and mission-specific tools', () => {
    const result = resolveRequiredTools('deploy')
    expect(result.filter(t => t === 'kubectl')).toHaveLength(1)
  })
})

describe('runToolPreflightCheck', () => {
  const AGENT = 'http://127.0.0.1:8585'

  function makeResponse(data: unknown, init: { ok?: boolean; status?: number } = {}): Response {
    const ok = init.ok ?? true
    const status = init.status ?? 200
    return {
      ok,
      status,
      json: async () => data,
    } as unknown as Response
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('short-circuits with ok:true when agentBaseUrl is empty', async () => {
    const fetchFn = vi.fn()
    const result = await runToolPreflightCheck('   ', ['kubectl'], fetchFn as unknown as typeof fetch)
    expect(result).toEqual({ ok: true, tools: [] })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('returns ok:true and merged tool results when all required tools are installed', async () => {
    const detected: ToolCheckResult[] = [
      { name: 'kubectl', installed: true, version: '1.30.0' },
      { name: 'helm', installed: true, version: '3.15.0' },
    ]
    const fetchFn = vi.fn().mockResolvedValue(makeResponse(detected))
    const result = await runToolPreflightCheck(AGENT, ['kubectl', 'helm'], fetchFn as unknown as typeof fetch)

    expect(result.ok).toBe(true)
    expect(result.tools).toHaveLength(2)
    expect(result.tools[0]).toMatchObject({ name: 'kubectl', installed: true })

    const [urlArg] = fetchFn.mock.calls[0]
    const url = new URL(urlArg as string)
    expect(url.pathname).toBe('/local-cluster-tools')
    expect(url.searchParams.getAll('tool')).toEqual(['kubectl', 'helm'])
  })

  it('accepts the alternate { tools: [...] } response shape', async () => {
    const detected: ToolCheckResult[] = [{ name: 'kubectl', installed: true }]
    const fetchFn = vi.fn().mockResolvedValue(makeResponse({ tools: detected }))
    const result = await runToolPreflightCheck(AGENT, ['kubectl'], fetchFn as unknown as typeof fetch)
    expect(result.ok).toBe(true)
    expect(result.tools[0]).toMatchObject({ name: 'kubectl', installed: true })
  })

  it('reports MISSING_TOOLS when a required tool is not installed', async () => {
    const detected: ToolCheckResult[] = [{ name: 'kubectl', installed: true }]
    const fetchFn = vi.fn().mockResolvedValue(makeResponse(detected))
    const result = await runToolPreflightCheck(AGENT, ['kubectl', 'helm'], fetchFn as unknown as typeof fetch)

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('MISSING_TOOLS')
    expect(result.error?.message).toContain('helm')
    expect((result.error?.details as { missingTools: string[] }).missingTools).toEqual(['helm'])
    // Both required tools are present in the merged results (one installed, one not)
    expect(result.tools.map(t => t.name).sort()).toEqual(['helm', 'kubectl'])
  })

  it('matches installed tools case-insensitively', async () => {
    const detected: ToolCheckResult[] = [{ name: 'KUBECTL', installed: true }]
    const fetchFn = vi.fn().mockResolvedValue(makeResponse(detected))
    const result = await runToolPreflightCheck(AGENT, ['kubectl'], fetchFn as unknown as typeof fetch)
    expect(result.ok).toBe(true)
  })

  it('reports agentAuthFailed on HTTP 401', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse({}, { ok: false, status: 401 }))
    const result = await runToolPreflightCheck(AGENT, ['kubectl'], fetchFn as unknown as typeof fetch)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_EXECUTION_FAILURE')
    expect(result.error?.message).toBe('missions.preflight.toolCheck.agentAuthFailed')
  })

  it('reports agentAuthFailed on HTTP 403', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse({}, { ok: false, status: 403 }))
    const result = await runToolPreflightCheck(AGENT, ['kubectl'], fetchFn as unknown as typeof fetch)
    expect(result.error?.message).toBe('missions.preflight.toolCheck.agentAuthFailed')
  })

  it('reports agentUnreachable on HTTP 503', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse({}, { ok: false, status: 503 }))
    const result = await runToolPreflightCheck(AGENT, ['kubectl'], fetchFn as unknown as typeof fetch)
    expect(result.error?.message).toBe('missions.preflight.toolCheck.agentUnreachable')
  })

  it('reports requestFailedHttp with status for other non-ok responses', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse({}, { ok: false, status: 500 }))
    const result = await runToolPreflightCheck(AGENT, ['kubectl'], fetchFn as unknown as typeof fetch)
    expect(result.error?.message).toContain('requestFailedHttp')
    expect(result.error?.message).toContain('status=500')
  })

  it('classifies fetch-thrown network errors as agentUnreachable', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Failed to fetch'))
    const result = await runToolPreflightCheck(AGENT, ['kubectl'], fetchFn as unknown as typeof fetch)
    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe('missions.preflight.toolCheck.agentUnreachable')
    expect(result.tools).toEqual([])
  })

  it('classifies timeout errors as agentUnreachable', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('operation timed out'))
    const result = await runToolPreflightCheck(AGENT, ['kubectl'], fetchFn as unknown as typeof fetch)
    expect(result.error?.message).toBe('missions.preflight.toolCheck.agentUnreachable')
  })

  it('classifies unrelated errors as requestFailedGeneric with message', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('boom'))
    const result = await runToolPreflightCheck(AGENT, ['kubectl'], fetchFn as unknown as typeof fetch)
    expect(result.error?.message).toContain('requestFailedGeneric')
    expect(result.error?.message).toContain('message=boom')
  })

  it('handles non-Error throws (string) via String(err)', async () => {
    const fetchFn = vi.fn().mockRejectedValue('plain string')
    const result = await runToolPreflightCheck(AGENT, ['kubectl'], fetchFn as unknown as typeof fetch)
    expect(result.error?.message).toContain('message=plain string')
  })

  it('deduplicates repeated required tools in the query string', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse([{ name: 'kubectl', installed: true }]))
    await runToolPreflightCheck(AGENT, ['kubectl', 'KUBECTL', 'kubectl'], fetchFn as unknown as typeof fetch)
    const url = new URL(fetchFn.mock.calls[0][0] as string)
    expect(url.searchParams.getAll('tool')).toEqual(['kubectl'])
  })
})
