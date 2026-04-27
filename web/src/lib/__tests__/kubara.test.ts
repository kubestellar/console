import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseResourceRequests, fetchKubaraCatalog, fetchKubaraValues } from '../kubara'

// Reset module-level cache between tests
const resetCache = async () => {
  vi.resetModules()
}

vi.mock('../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

describe('parseResourceRequests', () => {
  it('returns null when no resources block', () => {
    const yaml = 'replicaCount: 1\nimage:\n  tag: latest\n'
    expect(parseResourceRequests(yaml)).toBeNull()
  })

  it('returns null when resources block has no requests', () => {
    const yaml = 'resources:\n  limits:\n    cpu: 500m\n'
    expect(parseResourceRequests(yaml)).toBeNull()
  })

  it('parses millicores CPU (100m)', () => {
    const yaml = 'resources:\n  requests:\n    cpu: 100m\n    memory: 128Mi\n'
    const result = parseResourceRequests(yaml)
    expect(result?.cpuMillicores).toBe(100)
  })

  it('parses whole-core CPU (1 → 1000m)', () => {
    const yaml = 'resources:\n  requests:\n    cpu: 1\n    memory: 256Mi\n'
    const result = parseResourceRequests(yaml)
    expect(result?.cpuMillicores).toBe(1000)
  })

  it('parses whole-core CPU (2 → 2000m)', () => {
    // Note: the regex alternation `\d+m?|\d+\.?\d*` matches whole numbers
    // correctly via the first alternative before fractional parsing kicks in.
    const yaml = 'resources:\n  requests:\n    cpu: 2\n    memory: 256Mi\n'
    const result = parseResourceRequests(yaml)
    expect(result?.cpuMillicores).toBe(2000)
  })

  it('parses MiB memory (128Mi)', () => {
    const yaml = 'resources:\n  requests:\n    cpu: 100m\n    memory: 128Mi\n'
    const result = parseResourceRequests(yaml)
    expect(result?.memoryMiB).toBe(128)
  })

  it('parses GiB memory (2Gi → 2048 MiB)', () => {
    const yaml = 'resources:\n  requests:\n    cpu: 100m\n    memory: 2Gi\n'
    const result = parseResourceRequests(yaml)
    expect(result?.memoryMiB).toBe(2048)
  })

  it('parses KiB memory', () => {
    const yaml = 'resources:\n  requests:\n    cpu: 100m\n    memory: 1024Ki\n'
    const result = parseResourceRequests(yaml)
    expect(result?.memoryMiB).toBe(1) // 1024 Ki = 1 MiB
  })

  it('parses cpu-only requests (memoryMiB defaults to 0)', () => {
    const yaml = 'resources:\n  requests:\n    cpu: 250m\n'
    const result = parseResourceRequests(yaml)
    expect(result?.cpuMillicores).toBe(250)
    expect(result?.memoryMiB).toBe(0)
  })

  it('parses memory-only requests (cpuMillicores defaults to 0)', () => {
    const yaml = 'resources:\n  requests:\n    memory: 512Mi\n'
    const result = parseResourceRequests(yaml)
    expect(result?.cpuMillicores).toBe(0)
    expect(result?.memoryMiB).toBe(512)
  })
})

describe('fetchKubaraCatalog', () => {
  // The module has a 5-minute in-memory cache. Use fake timers to advance
  // past the TTL between tests so each test calls fetch independently.
  const CACHE_TTL_MS = 5 * 60 * 1000
  let baseTime = Date.now()

  beforeEach(() => {
    baseTime += CACHE_TTL_MS + 1000 // advance past TTL each test
    vi.useFakeTimers({ now: baseTime })
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('returns static fallback on network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))
    const result = await fetchKubaraCatalog()
    expect(result.length).toBeGreaterThan(0)
    expect(result.some(e => e.name === 'cert-manager')).toBe(true)
  })

  it('returns static fallback when response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }))
    const result = await fetchKubaraCatalog()
    expect(result.some(e => e.name === 'kube-prometheus-stack')).toBe(true)
  })

  it('returns static fallback for empty array response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    )
    const result = await fetchKubaraCatalog()
    expect(result.some(e => e.name === 'argo-cd')).toBe(true)
  })

  it('returns static fallback for non-array response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'bad' }), { status: 200 })
    )
    const result = await fetchKubaraCatalog()
    expect(result.some(e => e.name === 'traefik')).toBe(true)
  })

  it('parses directory entries from successful response', async () => {
    const mockData = [
      { name: 'my-chart', path: 'go-binary/templates/helm/my-chart', type: 'dir' },
      { name: 'README.md', path: 'README.md', type: 'file' },
    ]
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), { status: 200 })
    )
    const result = await fetchKubaraCatalog()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('my-chart')
  })
})

describe('fetchKubaraValues', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns values yaml text on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('replicaCount: 1\n', { status: 200 })
    )
    const result = await fetchKubaraValues('cert-manager')
    expect(result).toBe('replicaCount: 1\n')
  })

  it('returns null when response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }))
    const result = await fetchKubaraValues('missing-chart')
    expect(result).toBeNull()
  })

  it('returns null on network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('timeout'))
    const result = await fetchKubaraValues('cert-manager')
    expect(result).toBeNull()
  })

  it('returns null for empty response text', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 200 }))
    const result = await fetchKubaraValues('cert-manager')
    expect(result).toBeNull()
  })

  it('uses custom valuesUrl when provided', async () => {
    const customUrl = 'https://custom.example.com/values.yaml'
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('custom: true\n', { status: 200 })
    )
    const result = await fetchKubaraValues('cert-manager', customUrl)
    expect(result).toBe('custom: true\n')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(customUrl, expect.any(Object))
  })
})
