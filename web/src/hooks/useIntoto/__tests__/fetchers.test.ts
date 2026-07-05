/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: {
    exec: vi.fn(),
  },
}))

vi.mock('../transforms', () => ({
  applyLinkStatuses: vi.fn(),
  buildClusterStatus: vi.fn((_cluster: string, layouts: unknown[]) => ({
    cluster: _cluster,
    installed: true,
    loading: false,
    layouts,
    totalLayouts: layouts.length,
    totalSteps: 0,
    verifiedSteps: 0,
    failedSteps: 0,
    missingSteps: 0,
  })),
  emptyStatus: vi.fn((cluster: string, installed: boolean, error?: string) => ({
    cluster,
    installed,
    loading: false,
    error,
    layouts: [],
    totalLayouts: 0,
    totalSteps: 0,
    verifiedSteps: 0,
    failedSteps: 0,
    missingSteps: 0,
  })),
  markMissingSteps: vi.fn(),
  transformLayoutResources: vi.fn((_cluster: string, items: unknown[]) => items),
}))

import {
  loadFromCache,
  saveToCache,
  clearCache,
  fetchSingleCluster,
  INTOTO_CACHE_MAX_AGE_MS,
} from '../fetchers'
import { kubectlProxy } from '../../../lib/kubectlProxy'
import { emptyStatus, buildClusterStatus, transformLayoutResources, applyLinkStatuses, markMissingSteps } from '../transforms'

const CACHE_KEY = 'kc-intoto-cache'
const CACHE_TIME_KEY = 'kc-intoto-cache-time'

// ── loadFromCache ───────────────────────────────────────────────

describe('loadFromCache', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('returns null when no cache exists', () => {
    expect(loadFromCache()).toBeNull()
  })

  it('returns null when only cache data exists without timestamp', () => {
    localStorage.setItem(CACHE_KEY, '{"cluster-a":{}}')
    expect(loadFromCache()).toBeNull()
  })

  it('returns null when only timestamp exists without data', () => {
    localStorage.setItem(CACHE_TIME_KEY, '1700000000000')
    expect(loadFromCache()).toBeNull()
  })

  it('returns cached data and timestamp when both exist', () => {
    const statuses = { 'cluster-a': { cluster: 'cluster-a', installed: true, loading: false, layouts: [] } }
    localStorage.setItem(CACHE_KEY, JSON.stringify(statuses))
    localStorage.setItem(CACHE_TIME_KEY, '1700000000000')

    const result = loadFromCache()
    expect(result).not.toBeNull()
    expect(result!.statuses).toEqual(statuses)
    expect(result!.timestamp).toBe(1700000000000)
  })

  it('returns fallback empty object for malformed JSON in cache', () => {
    localStorage.setItem(CACHE_KEY, '{not valid json')
    localStorage.setItem(CACHE_TIME_KEY, '1700000000000')

    const result = loadFromCache()
    expect(result).not.toBeNull()
    expect(result!.statuses).toEqual({})
  })

  it('returns NaN timestamp for non-numeric cache time', () => {
    localStorage.setItem(CACHE_KEY, '{}')
    localStorage.setItem(CACHE_TIME_KEY, 'not-a-number')

    const result = loadFromCache()
    expect(result).not.toBeNull()
    expect(result!.timestamp).toBeNaN()
  })
})

// ── saveToCache ─────────────────────────────────────────────────

describe('saveToCache', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('saves completed statuses to localStorage', () => {
    const statuses = {
      'cluster-a': { cluster: 'cluster-a', installed: true, loading: false, layouts: [], totalLayouts: 0, totalSteps: 0, verifiedSteps: 0, failedSteps: 0, missingSteps: 0 },
    }
    saveToCache(statuses as any)

    const stored = localStorage.getItem(CACHE_KEY)
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!)).toEqual(statuses)
    expect(localStorage.getItem(CACHE_TIME_KEY)).toBeTruthy()
  })

  it('filters out loading statuses', () => {
    const statuses = {
      'loading-cluster': { cluster: 'loading-cluster', installed: true, loading: true, layouts: [] },
      'ready-cluster': { cluster: 'ready-cluster', installed: true, loading: false, layouts: [] },
    }
    saveToCache(statuses as any)

    const stored = JSON.parse(localStorage.getItem(CACHE_KEY)!)
    expect(stored['loading-cluster']).toBeUndefined()
    expect(stored['ready-cluster']).toBeDefined()
  })

  it('filters out error statuses', () => {
    const statuses = {
      'error-cluster': { cluster: 'error-cluster', installed: true, loading: false, error: 'timeout', layouts: [] },
      'ok-cluster': { cluster: 'ok-cluster', installed: true, loading: false, layouts: [] },
    }
    saveToCache(statuses as any)

    const stored = JSON.parse(localStorage.getItem(CACHE_KEY)!)
    expect(stored['error-cluster']).toBeUndefined()
    expect(stored['ok-cluster']).toBeDefined()
  })

  it('does not write to localStorage when all statuses are loading/error', () => {
    const statuses = {
      'err': { cluster: 'err', installed: true, loading: false, error: 'fail', layouts: [] },
    }
    saveToCache(statuses as any)

    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
  })

  it('does not throw when localStorage is full', () => {
    // Simulate quota exceeded by filling up storage
    const _originalSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    })

    expect(() => saveToCache({ 'c': { cluster: 'c', installed: true, loading: false, layouts: [] } } as any)).not.toThrow()

    vi.mocked(localStorage.setItem).mockRestore()
  })
})

// ── clearCache ──────────────────────────────────────────────────

describe('clearCache', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('removes both cache keys from localStorage', () => {
    localStorage.setItem(CACHE_KEY, '{"data":"here"}')
    localStorage.setItem(CACHE_TIME_KEY, '1700000000000')

    clearCache()

    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
    expect(localStorage.getItem(CACHE_TIME_KEY)).toBeNull()
  })

  it('does not throw when keys do not exist', () => {
    expect(() => clearCache()).not.toThrow()
  })

  it('does not throw when localStorage throws', () => {
    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    expect(() => clearCache()).not.toThrow()

    vi.mocked(localStorage.removeItem).mockRestore()
  })
})

// ── fetchSingleCluster ──────────────────────────────────────────

describe('fetchSingleCluster', () => {
  beforeEach(() => {
    vi.mocked(kubectlProxy.exec).mockReset()
    vi.mocked(emptyStatus).mockClear()
    vi.mocked(buildClusterStatus).mockClear()
    vi.mocked(transformLayoutResources).mockClear()
    vi.mocked(applyLinkStatuses).mockClear()
    vi.mocked(markMissingSteps).mockClear()
  })

  it('returns emptyStatus with installed=false when CRD check fails', async () => {
    vi.mocked(kubectlProxy.exec).mockResolvedValue({ exitCode: 1, output: '' })

    const result = await fetchSingleCluster('my-cluster')

    expect(emptyStatus).toHaveBeenCalledWith('my-cluster', false)
    expect(result.installed).toBe(false)
  })

  it('returns emptyStatus with error when layout fetch fails', async () => {
    vi.mocked(kubectlProxy.exec)
      .mockResolvedValueOnce({ exitCode: 0, output: 'crd/layouts.in-toto.io' }) // CRD check
      .mockResolvedValueOnce({ exitCode: 1, output: 'forbidden' }) // layout fetch

    const result = await fetchSingleCluster('my-cluster')

    expect(emptyStatus).toHaveBeenCalledWith('my-cluster', true, 'forbidden')
    expect(result.installed).toBe(true)
    expect(result.error).toBe('forbidden')
  })

  it('returns emptyStatus with default error when layout output is empty', async () => {
    vi.mocked(kubectlProxy.exec)
      .mockResolvedValueOnce({ exitCode: 0, output: 'crd/layouts.in-toto.io' })
      .mockResolvedValueOnce({ exitCode: 1, output: '' })

    await fetchSingleCluster('my-cluster')

    expect(emptyStatus).toHaveBeenCalledWith('my-cluster', true, 'intoto_supply_chain.fetchErrorLayouts')
  })

  it('fetches layouts and links successfully', async () => {
    const layoutItems = [{ metadata: { name: 'layout-1' } }]
    const linkItems = [{ metadata: { name: 'link-1' } }]

    vi.mocked(kubectlProxy.exec)
      .mockResolvedValueOnce({ exitCode: 0, output: 'crd/layouts.in-toto.io' })
      .mockResolvedValueOnce({ exitCode: 0, output: JSON.stringify({ items: layoutItems }) })
      .mockResolvedValueOnce({ exitCode: 0, output: JSON.stringify({ items: linkItems }) })

    await fetchSingleCluster('prod-cluster')

    expect(transformLayoutResources).toHaveBeenCalledWith('prod-cluster', layoutItems)
    expect(applyLinkStatuses).toHaveBeenCalled()
    expect(markMissingSteps).toHaveBeenCalled()
    expect(buildClusterStatus).toHaveBeenCalledWith('prod-cluster', expect.anything())
  })

  it('skips link application when links fetch fails', async () => {
    vi.mocked(kubectlProxy.exec)
      .mockResolvedValueOnce({ exitCode: 0, output: 'crd/layouts.in-toto.io' })
      .mockResolvedValueOnce({ exitCode: 0, output: '{"items":[]}' })
      .mockResolvedValueOnce({ exitCode: 1, output: '' })

    await fetchSingleCluster('staging')

    expect(applyLinkStatuses).not.toHaveBeenCalled()
    expect(markMissingSteps).toHaveBeenCalled()
    expect(buildClusterStatus).toHaveBeenCalled()
  })

  it('handles malformed JSON in layout output gracefully', async () => {
    vi.mocked(kubectlProxy.exec)
      .mockResolvedValueOnce({ exitCode: 0, output: 'crd/layouts.in-toto.io' })
      .mockResolvedValueOnce({ exitCode: 0, output: '{invalid json' })
      .mockResolvedValueOnce({ exitCode: 1, output: '' })

    await fetchSingleCluster('broken')

    // safeJsonParse returns { items: [] } fallback
    expect(transformLayoutResources).toHaveBeenCalledWith('broken', [])
  })

  it('returns emptyStatus on exception with error message', async () => {
    vi.mocked(kubectlProxy.exec).mockRejectedValue(new Error('network timeout'))

    const result = await fetchSingleCluster('unreachable')

    expect(emptyStatus).toHaveBeenCalledWith('unreachable', false, 'network timeout')
    expect(result.error).toBe('network timeout')
  })

  it('suppresses console.error for demo mode errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(kubectlProxy.exec).mockRejectedValue(new Error('demo mode is active'))

    await fetchSingleCluster('demo-cluster')

    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('logs console.error for non-demo errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(kubectlProxy.exec).mockRejectedValue(new Error('connection refused'))

    await fetchSingleCluster('real-cluster')

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})

// ── INTOTO_CACHE_MAX_AGE_MS constant ────────────────────────────

describe('INTOTO_CACHE_MAX_AGE_MS', () => {
  it('is exported and is a positive number', () => {
    expect(INTOTO_CACHE_MAX_AGE_MS).toBeGreaterThan(0)
    expect(typeof INTOTO_CACHE_MAX_AGE_MS).toBe('number')
  })
})
