import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Page } from '@playwright/test'
import { isTransientLiveRead, readLiveApiWithBackoff } from '../../e2e/visual-login/helpers/liveApiRead'
import { assertNoUnexpectedLiveNetworkErrors, collectLiveApiFacts } from '../../e2e/visual-login/helpers/liveApiFacts'
import type { EvidenceCollectors } from '../evidence/evidenceTypes'

vi.mock('../../e2e/visual-login/helpers/liveReporting', () => ({
  markLiveRateLimitDataLoss: vi.fn(),
  writeLiveRouteEvidence: vi.fn(),
}))

const origin = 'https://console-live.example.test'
const endpoint = `${origin}/api/mcp/replicasets?cluster=ci-1`
const fetchMock = vi.fn()
const page = { evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg) } as unknown as Page
const collectors = (method = 'GET', status = 503): EvidenceCollectors => ({
  consoleErrors: [], consoleWarnings: [], pageErrors: [], failedRequests: [],
  errorResponses: [{ method, status, url: endpoint }],
  requestCountsByEndpoint: {}, rateLimitEvents: [],
})
const response = (status: number, retryAfter?: string, body = '{}') => new Response(body, {
  status, headers: retryAfter ? { 'retry-after': retryAfter } : {},
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('window', { location: { origin } })
  fetchMock.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function finish<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync()
  return promise
}

describe('bounded live API reads', () => {
  it('records 429/503 recovery and retains credentials', async () => {
    fetchMock.mockResolvedValueOnce(response(429, '1')).mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(200))
    const result = await finish(readLiveApiWithBackoff('/api/mcp/pods'))
    expect(result.attempts.map(attempt => attempt.status)).toEqual([429, 503, 200])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' })
  })

  it.each([401, 403, 404, 500])('does not retry HTTP %s', async status => {
    fetchMock.mockResolvedValue(response(status))
    expect((await readLiveApiWithBackoff('/api/mcp/pods')).status).toBe(status)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stops persistent failures after three attempts', async () => {
    fetchMock.mockImplementation(async () => response(503))
    expect((await finish(readLiveApiWithBackoff('/api/mcp/pods'))).status).toBe(503)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it.each(['60', new Date(Date.now() + 60_000).toUTCString()])('does not retry ahead of a long Retry-After: %s', async header => {
    fetchMock.mockResolvedValue(response(429, header))
    expect((await readLiveApiWithBackoff('/api/mcp/pods')).status).toBe(429)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('bounds a recovery batch by the remaining budget', async () => {
    fetchMock.mockResolvedValue(response(503))
    await readLiveApiWithBackoff({ endpoint: '/api/mcp/pods', budgetMs: 500 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves facts and attempt history after recovery', async () => {
    fetchMock.mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(200, undefined, '{"pods":[{"status":"Running"}]}'))
    const facts = await finish(collectLiveApiFacts(page, 'pods'))
    expect(facts.pods.total).toBe(1)
    expect(facts.endpoints['/api/mcp/pods'].attempts?.map(attempt => attempt.status)).toEqual([503, 200])
  })
})

describe('network gate recovery', () => {
  it('deduplicates reads, retains the original errors, and reports recovery', async () => {
    const evidence = collectors()
    evidence.errorResponses.push({ ...evidence.errorResponses[0] })
    fetchMock.mockResolvedValue(response(200))
    await finish(assertNoUnexpectedLiveNetworkErrors(page, evidence, origin))
    expect(evidence.errorResponses).toHaveLength(2)
    expect(evidence.liveUiFailures?.liveApiRecovery).toHaveLength(1)
    expect(evidence.liveUiFailures?.unexpectedNetworkResponses).toEqual([])
  })

  it('keeps a persistent 503 fatal', async () => {
    fetchMock.mockImplementation(async (url: string) => response(url === '/api/me' ? 200 : 503))
    await finish(expect(assertNoUnexpectedLiveNetworkErrors(page, collectors(), origin)).rejects.toThrow())
  })

  it('never probes a mutation even if an API read would succeed', async () => {
    fetchMock.mockResolvedValue(response(200))
    await finish(expect(assertNoUnexpectedLiveNetworkErrors(page, collectors('PUT'), origin)).rejects.toThrow())
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/api/me'])
  })

  it('requires recovery independently for every cluster query', async () => {
    const evidence = collectors()
    evidence.errorResponses.push({ method: 'GET', status: 503, url: endpoint.replace('ci-1', 'ci-2') })
    fetchMock.mockImplementation(async (url: string) => response(url.includes('ci-2') ? 503 : 200))
    await finish(expect(assertNoUnexpectedLiveNetworkErrors(page, evidence, origin)).rejects.toThrow())
    expect(evidence.liveUiFailures?.unexpectedNetworkResponses).toEqual([
      `GET 503 ${endpoint.replace('ci-1', 'ci-2')}`,
    ])
  })

  it('does not accept an HTML login fallback as recovery', async () => {
    fetchMock.mockResolvedValue(response(200, undefined, '<html>Login</html>'))
    await finish(expect(assertNoUnexpectedLiveNetworkErrors(page, collectors(), origin)).rejects.toThrow())
  })

  it.each([
    { method: 'PUT', status: 503, url: endpoint },
    { method: 'GET', status: 500, url: endpoint },
    { method: 'GET', status: 429, url: 'https://other.example/api/pods' },
    { method: 'GET', status: 503, url: `${origin}/settings` },
  ])('never replays an unsafe or unrelated response: %o', entry => {
    expect(isTransientLiveRead(entry, origin)).toBe(false)
  })
})
