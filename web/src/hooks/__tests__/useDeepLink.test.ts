/**
 * Tests for useDeepLink hook and utility functions.
 *
 * Tests buildDeepLinkURL (pure utility) and the useDeepLink hook with
 * mocked react-router-dom and drilldown actions.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { buildDeepLinkURL } from '../useDeepLink'

// ── Mocks ──────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
const mockSetSearchParams = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
  useNavigate: () => mockNavigate,
}))

const mockDrillToNode = vi.fn()
const mockDrillToPod = vi.fn()
const mockDrillToCluster = vi.fn()
const mockDrillToDeployment = vi.fn()
const mockDrillToNamespace = vi.fn()

vi.mock('../useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToNode: mockDrillToNode,
    drillToPod: mockDrillToPod,
    drillToCluster: mockDrillToCluster,
    drillToDeployment: mockDrillToDeployment,
    drillToNamespace: mockDrillToNamespace,
  }),
}))

vi.mock('../../lib/scrollToCard', () => ({
  scrollToCard: vi.fn(),
}))

vi.mock('../../config/routes', () => ({
  ROUTES: {
    HOME: '/',
    SECURITY: '/security',
    ALERTS: '/alerts',
  },
}))

// ── Tests ──────────────────────────────────────────────────────────────

describe('buildDeepLinkURL', () => {
  it('should build URL with drilldown and cluster params', () => {
    const url = buildDeepLinkURL({ drilldown: 'cluster', cluster: 'prod-east' })
    expect(url).toContain('drilldown=cluster')
    expect(url).toContain('cluster=prod-east')
  })

  it('should build URL with node drilldown params', () => {
    const url = buildDeepLinkURL({ drilldown: 'node', cluster: 'c1', node: 'n1' })
    expect(url).toContain('drilldown=node')
    expect(url).toContain('cluster=c1')
    expect(url).toContain('node=n1')
  })

  it('should build URL with pod drilldown params', () => {
    const url = buildDeepLinkURL({
      drilldown: 'pod',
      cluster: 'c1',
      namespace: 'default',
      pod: 'nginx-abc',
    })
    expect(url).toContain('drilldown=pod')
    expect(url).toContain('cluster=c1')
    expect(url).toContain('namespace=default')
    expect(url).toContain('pod=nginx-abc')
  })

  it('should build URL with deployment drilldown params', () => {
    const url = buildDeepLinkURL({
      drilldown: 'deployment',
      cluster: 'c1',
      namespace: 'kube-system',
      deployment: 'coredns',
    })
    expect(url).toContain('drilldown=deployment')
    expect(url).toContain('deployment=coredns')
  })

  it('should build URL with action param', () => {
    const url = buildDeepLinkURL({ action: 'offline-detection' })
    expect(url).toContain('action=offline-detection')
    expect(url).not.toContain('drilldown')
  })

  it('should build URL with card param', () => {
    const url = buildDeepLinkURL({ card: 'cluster_health' })
    expect(url).toContain('card=cluster_health')
  })

  it('should build URL with issue param', () => {
    const url = buildDeepLinkURL({
      drilldown: 'node',
      cluster: 'c1',
      node: 'n1',
      issue: 'high-cpu',
    })
    expect(url).toContain('issue=high-cpu')
  })

  it('should omit undefined params', () => {
    const url = buildDeepLinkURL({ cluster: 'c1' })
    expect(url).not.toContain('drilldown=')
    expect(url).not.toContain('action=')
    expect(url).not.toContain('node=')
    expect(url).not.toContain('pod=')
    expect(url).not.toContain('namespace=')
    expect(url).not.toContain('deployment=')
    expect(url).not.toContain('issue=')
    expect(url).toContain('cluster=c1')
  })

  it('should return a valid URL string', () => {
    const url = buildDeepLinkURL({ drilldown: 'cluster', cluster: 'test' })
    expect(url).toContain('?')
    // Should start with the origin
    expect(url.startsWith('http')).toBe(true)
  })

  it('should handle empty params object', () => {
    const url = buildDeepLinkURL({})
    // Should still return a URL, just with empty (or no meaningful) search params
    expect(url).toContain('?')
  })

  it('should encode special characters in param values', () => {
    const url = buildDeepLinkURL({ cluster: 'my cluster/name' })
    // URLSearchParams encodes spaces and slashes
    expect(url).not.toContain(' ')
  })
})

describe('useDeepLink hook', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockSearchParams = new URLSearchParams()
    mockNavigate.mockClear()
    mockSetSearchParams.mockClear()
    mockDrillToNode.mockClear()
    mockDrillToPod.mockClear()
    mockDrillToCluster.mockClear()
    mockDrillToDeployment.mockClear()
    mockDrillToNamespace.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Lazy import so mocks are applied
  async function importHook() {
    const mod = await import('../useDeepLink')
    return mod.useDeepLink
  }

  // ── Action-based navigation ─────────────────────────────────────────

  describe('action-based navigation', () => {
    it('should navigate to HOME for offline-detection action', async () => {
      mockSearchParams = new URLSearchParams('action=offline-detection')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())

      expect(mockNavigate).toHaveBeenCalledWith('/')
      expect(mockSetSearchParams).toHaveBeenCalled()
    })

    it('should navigate to HOME for hardware-health action', async () => {
      mockSearchParams = new URLSearchParams('action=hardware-health')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())

      expect(mockNavigate).toHaveBeenCalledWith('/')
    })

    it('should navigate to SECURITY for security action', async () => {
      mockSearchParams = new URLSearchParams('action=security')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())

      expect(mockNavigate).toHaveBeenCalledWith('/security')
    })

    it('should navigate to ALERTS for alerts action', async () => {
      mockSearchParams = new URLSearchParams('action=alerts')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())

      expect(mockNavigate).toHaveBeenCalledWith('/alerts')
    })

    it('should clear params after handling action', async () => {
      mockSearchParams = new URLSearchParams('action=offline-detection')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())

      expect(mockSetSearchParams).toHaveBeenCalled()
      const setCall = mockSetSearchParams.mock.calls[0]
      const newParams = setCall[0] as URLSearchParams
      expect(newParams.has('action')).toBe(false)
      expect(setCall[1]).toEqual({ replace: true })
    })
  })

  // ── Drilldown navigation ────────────────────────────────────────────

  describe('drilldown navigation', () => {
    it('should call drillToCluster for cluster drilldown', async () => {
      mockSearchParams = new URLSearchParams('drilldown=cluster&cluster=prod-east')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())

      // The drilldown is on a 500ms timer
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockDrillToCluster).toHaveBeenCalledWith('prod-east', undefined)
    })

    it('should call drillToNode for node drilldown', async () => {
      mockSearchParams = new URLSearchParams('drilldown=node&cluster=c1&node=worker-1')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockDrillToNode).toHaveBeenCalledWith('c1', 'worker-1', undefined)
    })

    it('should call drillToPod for pod drilldown with all params', async () => {
      mockSearchParams = new URLSearchParams('drilldown=pod&cluster=c1&namespace=default&pod=nginx-abc')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockDrillToPod).toHaveBeenCalledWith('c1', 'default', 'nginx-abc', undefined)
    })

    it('should call drillToDeployment for deployment drilldown', async () => {
      mockSearchParams = new URLSearchParams(
        'drilldown=deployment&cluster=c1&namespace=kube-system&deployment=coredns'
      )
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockDrillToDeployment).toHaveBeenCalledWith('c1', 'kube-system', 'coredns', undefined)
    })

    it('should call drillToNamespace for namespace drilldown', async () => {
      mockSearchParams = new URLSearchParams('drilldown=namespace&cluster=c1&namespace=prod')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockDrillToNamespace).toHaveBeenCalledWith('c1', 'prod')
    })

    it('should pass issue data when issue param is present', async () => {
      mockSearchParams = new URLSearchParams('drilldown=cluster&cluster=c1&issue=high-cpu')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockDrillToCluster).toHaveBeenCalledWith('c1', { issue: 'high-cpu' })
    })

    it('should pass issue data to node drilldown', async () => {
      mockSearchParams = new URLSearchParams('drilldown=node&cluster=c1&node=n1&issue=disk-pressure')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockDrillToNode).toHaveBeenCalledWith('c1', 'n1', { issue: 'disk-pressure' })
    })

    it('should clear params after drilldown processing', async () => {
      mockSearchParams = new URLSearchParams('drilldown=cluster&cluster=c1')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockSetSearchParams).toHaveBeenCalled()
      const setCall = mockSetSearchParams.mock.calls[0]
      const newParams = setCall[0] as URLSearchParams
      expect(newParams.has('drilldown')).toBe(false)
      expect(newParams.has('cluster')).toBe(false)
    })
  })

  // ── Edge cases: missing required params ─────────────────────────────

  describe('missing required params', () => {
    it('should not call drillToNode when node param is missing', async () => {
      mockSearchParams = new URLSearchParams('drilldown=node&cluster=c1')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockDrillToNode).not.toHaveBeenCalled()
    })

    it('should not call drillToPod when namespace is missing', async () => {
      mockSearchParams = new URLSearchParams('drilldown=pod&cluster=c1&pod=nginx')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockDrillToPod).not.toHaveBeenCalled()
    })

    it('should not call drillToPod when pod param is missing', async () => {
      mockSearchParams = new URLSearchParams('drilldown=pod&cluster=c1&namespace=default')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockDrillToPod).not.toHaveBeenCalled()
    })

    it('should not call drillToDeployment when namespace is missing', async () => {
      mockSearchParams = new URLSearchParams('drilldown=deployment&cluster=c1&deployment=nginx')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockDrillToDeployment).not.toHaveBeenCalled()
    })

    it('should not call drillToDeployment when deployment param is missing', async () => {
      mockSearchParams = new URLSearchParams('drilldown=deployment&cluster=c1&namespace=default')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockDrillToDeployment).not.toHaveBeenCalled()
    })

    it('should not call drillToNamespace when namespace is missing', async () => {
      mockSearchParams = new URLSearchParams('drilldown=namespace&cluster=c1')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockDrillToNamespace).not.toHaveBeenCalled()
    })

    it('should not trigger any drilldown when cluster is missing', async () => {
      mockSearchParams = new URLSearchParams('drilldown=cluster')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockDrillToCluster).not.toHaveBeenCalled()
      expect(mockDrillToNode).not.toHaveBeenCalled()
      expect(mockDrillToPod).not.toHaveBeenCalled()
      expect(mockDrillToDeployment).not.toHaveBeenCalled()
      expect(mockDrillToNamespace).not.toHaveBeenCalled()
    })

    it('should not trigger any drilldown when drilldown param is missing', async () => {
      mockSearchParams = new URLSearchParams('cluster=c1&node=n1')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockDrillToNode).not.toHaveBeenCalled()
      expect(mockDrillToCluster).not.toHaveBeenCalled()
    })
  })

  // ── Card scrolling ──────────────────────────────────────────────────

  describe('card deep linking', () => {
    it('should call scrollToCard for card param', async () => {
      const { scrollToCard } = await import('../../lib/scrollToCard')
      mockSearchParams = new URLSearchParams('card=cluster_health')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())

      expect(scrollToCard).toHaveBeenCalledWith('cluster_health')
    })

    it('should clear card param after processing', async () => {
      mockSearchParams = new URLSearchParams('card=node_status')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())

      expect(mockSetSearchParams).toHaveBeenCalled()
      const setCall = mockSetSearchParams.mock.calls[0]
      const newParams = setCall[0] as URLSearchParams
      expect(newParams.has('card')).toBe(false)
    })
  })

  // ── No-op when no deep link params ──────────────────────────────────

  describe('no deep link params', () => {
    it('should not navigate or drill down when URL has no deep link params', async () => {
      mockSearchParams = new URLSearchParams()
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockNavigate).not.toHaveBeenCalled()
      expect(mockDrillToCluster).not.toHaveBeenCalled()
      expect(mockDrillToNode).not.toHaveBeenCalled()
      expect(mockDrillToPod).not.toHaveBeenCalled()
      expect(mockDrillToDeployment).not.toHaveBeenCalled()
      expect(mockDrillToNamespace).not.toHaveBeenCalled()
      expect(mockSetSearchParams).not.toHaveBeenCalled()
    })

    it('should not clear unrelated URL params', async () => {
      mockSearchParams = new URLSearchParams('unrelated=value')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockSetSearchParams).not.toHaveBeenCalled()
    })
  })

  // ── Return values ───────────────────────────────────────────────────

  describe('return values', () => {
    it('should return buildURL and sendNotification functions', async () => {
      mockSearchParams = new URLSearchParams()
      const useDeepLink = await importHook()

      const { result } = renderHook(() => useDeepLink())

      expect(typeof result.current.buildURL).toBe('function')
      expect(typeof result.current.sendNotification).toBe('function')
    })

    it('buildURL should delegate to buildDeepLinkURL', async () => {
      mockSearchParams = new URLSearchParams()
      const useDeepLink = await importHook()

      const { result } = renderHook(() => useDeepLink())
      const url = result.current.buildURL({ drilldown: 'cluster', cluster: 'test' })

      expect(url).toContain('drilldown=cluster')
      expect(url).toContain('cluster=test')
    })
  })

  // ── Invalid / unknown drilldown types ───────────────────────────────

  describe('invalid drilldown types', () => {
    it('should not call any drill function for unknown drilldown type', async () => {
      mockSearchParams = new URLSearchParams('drilldown=unknown&cluster=c1')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      expect(mockDrillToCluster).not.toHaveBeenCalled()
      expect(mockDrillToNode).not.toHaveBeenCalled()
      expect(mockDrillToPod).not.toHaveBeenCalled()
      expect(mockDrillToDeployment).not.toHaveBeenCalled()
      expect(mockDrillToNamespace).not.toHaveBeenCalled()
    })
  })

  // ── Priority: action takes precedence over drilldown ────────────────

  describe('param priority', () => {
    it('action should take precedence over drilldown', async () => {
      mockSearchParams = new URLSearchParams('action=security&drilldown=cluster&cluster=c1')
      const useDeepLink = await importHook()

      renderHook(() => useDeepLink())
      act(() => { vi.advanceTimersByTime(500) })

      // Action is processed first, then early return
      expect(mockNavigate).toHaveBeenCalledWith('/security')
      expect(mockDrillToCluster).not.toHaveBeenCalled()
    })
  })
})
