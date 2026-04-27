/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedContainerd.ts.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
  isDemoModeForced: false,
}))

vi.mock('../../lib/cache', () => ({
  useCache: vi.fn(() => ({
    data: null,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
  })),
}))

import { __testables } from '../useCachedContainerd'

const { isContainerdRuntime, normalizeContainerId, mapContainerState, formatUptime, buildContainerdData } = __testables

// ---------------------------------------------------------------------------
// isContainerdRuntime
// ---------------------------------------------------------------------------

describe('isContainerdRuntime', () => {
  it('returns true for containerd runtime string', () => {
    expect(isContainerdRuntime('containerd://1.6.20')).toBe(true)
  })

  it('returns true case-insensitively', () => {
    expect(isContainerdRuntime('Containerd')).toBe(true)
    expect(isContainerdRuntime('CONTAINERD')).toBe(true)
  })

  it('returns false for non-containerd runtimes', () => {
    expect(isContainerdRuntime('cri-o://1.27.0')).toBe(false)
    expect(isContainerdRuntime('docker://20.10.0')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isContainerdRuntime(undefined)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isContainerdRuntime('')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// normalizeContainerId
// ---------------------------------------------------------------------------

describe('normalizeContainerId', () => {
  it('strips scheme and truncates to 12 chars', () => {
    const raw = 'containerd://3f9a1c4b2e7d8a0b1c2d3e4f5a6b7c8d'
    expect(normalizeContainerId(raw)).toBe('3f9a1c4b2e7d')
  })

  it('truncates plain ID without scheme', () => {
    expect(normalizeContainerId('abcdef123456789')).toBe('abcdef123456')
  })

  it('returns empty string for undefined', () => {
    expect(normalizeContainerId(undefined)).toBe('')
  })

  it('returns empty string for empty input', () => {
    expect(normalizeContainerId('')).toBe('')
  })

  it('handles short IDs without padding', () => {
    expect(normalizeContainerId('abc')).toBe('abc')
  })
})

// ---------------------------------------------------------------------------
// mapContainerState
// ---------------------------------------------------------------------------

describe('mapContainerState', () => {
  it('maps running to running', () => {
    expect(mapContainerState('running')).toBe('running')
  })

  it('maps waiting to paused', () => {
    expect(mapContainerState('waiting')).toBe('paused')
  })

  it('maps terminated to stopped', () => {
    expect(mapContainerState('terminated')).toBe('stopped')
  })

  it('maps undefined to stopped', () => {
    expect(mapContainerState(undefined)).toBe('stopped')
  })
})

// ---------------------------------------------------------------------------
// formatUptime
// ---------------------------------------------------------------------------

describe('formatUptime', () => {
  it('returns 0s for non-running state', () => {
    expect(formatUptime('2024-01-01T00:00:00Z', 'stopped')).toBe('0s')
    expect(formatUptime('2024-01-01T00:00:00Z', 'paused')).toBe('0s')
  })

  it('returns unknown for running with no startedAt', () => {
    expect(formatUptime(undefined, 'running')).toBe('unknown')
  })

  it('returns unknown for invalid date', () => {
    expect(formatUptime('not-a-date', 'running')).toBe('unknown')
  })

  it('returns seconds format for recent start', () => {
    const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString()
    const result = formatUptime(fiveSecondsAgo, 'running')
    expect(result).toMatch(/^\d+s$/)
  })

  it('returns minutes format for moderate uptime', () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const result = formatUptime(tenMinutesAgo, 'running')
    expect(result).toMatch(/^\d+m$/)
  })

  it('returns hours+minutes for longer uptime', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    const result = formatUptime(threeHoursAgo, 'running')
    expect(result).toMatch(/^\d+h \d+m$/)
  })

  it('returns days+hours for multi-day uptime', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const result = formatUptime(twoDaysAgo, 'running')
    expect(result).toMatch(/^\d+d \d+h$/)
  })
})

// ---------------------------------------------------------------------------
// buildContainerdData
// ---------------------------------------------------------------------------

describe('buildContainerdData', () => {
  it('returns not-installed when no containerd nodes', () => {
    const nodes = [{ name: 'node1', containerRuntime: 'cri-o://1.27' }]
    const result = buildContainerdData(nodes, [])
    expect(result.health).toBe('not-installed')
    expect(result.containers).toEqual([])
  })

  it('returns not-installed for empty nodes array', () => {
    const result = buildContainerdData([], [])
    expect(result.health).toBe('not-installed')
  })

  it('builds containers from pods on containerd nodes', () => {
    const nodes = [{ name: 'worker-1', containerRuntime: 'containerd://1.6.20' }]
    const pods = [
      {
        name: 'nginx-abc',
        namespace: 'default',
        node: 'worker-1',
        containers: [
          { name: 'nginx', image: 'nginx:1.25', state: 'running' as const, containerID: 'containerd://abc123def456789', startedAt: new Date(Date.now() - 60000).toISOString() },
        ],
      },
    ]
    const result = buildContainerdData(nodes, pods)
    expect(result.health).toBe('healthy')
    expect(result.containers).toHaveLength(1)
    expect(result.containers[0].id).toBe('abc123def456')
    expect(result.containers[0].image).toBe('nginx:1.25')
    expect(result.containers[0].state).toBe('running')
    expect(result.summary.running).toBe(1)
    expect(result.summary.totalContainers).toBe(1)
  })

  it('returns degraded when stopped containers exist', () => {
    const nodes = [{ name: 'worker-1', containerRuntime: 'containerd://1.6' }]
    const pods = [
      {
        name: 'pod1',
        namespace: 'ns',
        node: 'worker-1',
        containers: [
          { name: 'c1', image: 'img:1', state: 'terminated' as const },
        ],
      },
    ]
    const result = buildContainerdData(nodes, pods)
    expect(result.health).toBe('degraded')
    expect(result.summary.stopped).toBe(1)
  })

  it('skips pods on non-containerd nodes', () => {
    const nodes = [
      { name: 'worker-1', containerRuntime: 'containerd://1.6' },
      { name: 'worker-2', containerRuntime: 'cri-o://1.27' },
    ]
    const pods = [
      { name: 'pod-crio', namespace: 'ns', node: 'worker-2', containers: [{ name: 'c', image: 'img', state: 'running' as const }] },
    ]
    const result = buildContainerdData(nodes, pods)
    expect(result.containers).toHaveLength(0)
  })

  it('matches node by short name (FQDN split)', () => {
    const nodes = [{ name: 'worker-1.cluster.local', containerRuntime: 'containerd://1.7' }]
    const pods = [
      { name: 'pod1', namespace: 'ns', node: 'worker-1', containers: [{ name: 'c', image: 'img', state: 'running' as const }] },
    ]
    const result = buildContainerdData(nodes, pods)
    expect(result.containers).toHaveLength(1)
  })
})
