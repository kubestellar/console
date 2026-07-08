import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEPPRoutingData } from '../useEPPRoutingData'
import type { MetricType } from '../useEPPRoutingData'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../../contexts/StackContext', () => ({
  useOptionalStack: vi.fn(() => null),
}))

const mockUseCardDemoState = vi.fn(() => ({ shouldUseDemoData: true, showDemoBadge: true }))
const mockUseReportCardDataState = vi.fn()

vi.mock('../../../CardDataContext', () => ({
  useCardDemoState: mockUseCardDemoState,
  useReportCardDataState: mockUseReportCardDataState,
}))

vi.mock('../../../../../hooks/usePrometheusMetrics', () => ({
  usePrometheusMetrics: vi.fn(() => ({ metrics: null, isRefreshing: false })),
}))

vi.mock('../../../CardWrapper', () => ({
  useCardExpanded: vi.fn(() => ({ isExpanded: false })),
}))

vi.mock('../../../../../lib/constants/network', () => ({
  POLL_INTERVAL_FAST_MS: 10_000,
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEPPRoutingData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Restore default demo-mode mock for each test
    mockUseCardDemoState.mockReturnValue({ shouldUseDemoData: true, showDemoBadge: true })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the expected interface shape', () => {
    const { result } = renderHook(() => useEPPRoutingData())
    const data = result.current

    expect(Array.isArray(data.dynamicNodes)).toBe(true)
    expect(Array.isArray(data.links)).toBe(true)
    expect(typeof data.generatePath).toBe('function')
    expect(typeof data.getNodeWithMetrics).toBe('function')
    expect(typeof data.toggleMetric).toBe('function')
    expect(typeof data.toggleShowParticles).toBe('function')
    expect(typeof data.toggleViewMode).toBe('function')
    expect(typeof data.onHoveredLinkChange).toBe('function')
    expect(typeof data.onSelectedNodeChange).toBe('function')
    expect(typeof data.isDemoMode).toBe('boolean')
    expect(typeof data.isExpanded).toBe('boolean')
    expect(typeof data.showEmptyState).toBe('boolean')
    expect(typeof data.showParticles).toBe('boolean')
    expect(typeof data.uniqueId).toBe('string')
    expect(typeof data.viewMode).toBe('string')
  })

  it('uses demo nodes when isDemoMode=true and no stack is selected', () => {
    const { result } = renderHook(() => useEPPRoutingData())
    // In demo mode with no stack, NODES constant is used
    expect(result.current.dynamicNodes.length).toBeGreaterThan(0)
    expect(result.current.isDemoMode).toBe(true)
  })

  it('showEmptyState is false in demo mode', () => {
    const { result } = renderHook(() => useEPPRoutingData())
    expect(result.current.showEmptyState).toBe(false)
  })

  it('showEmptyState is true when no stack and not demo mode', () => {
    mockUseCardDemoState.mockReturnValue({ shouldUseDemoData: false, showDemoBadge: false })
    const { result } = renderHook(() => useEPPRoutingData())
    expect(result.current.showEmptyState).toBe(true)
  })

  it('metrics object contains totalRps, prefillRps, decodeRps', () => {
    const { result } = renderHook(() => useEPPRoutingData())
    const { metrics } = result.current
    expect(typeof metrics.totalRps).toBe('number')
    expect(typeof metrics.prefillRps).toBe('number')
    expect(typeof metrics.decodeRps).toBe('number')
    expect(typeof metrics.prefillPercent).toBe('number')
    expect(typeof metrics.decodePercent).toBe('number')
  })

  it('generatePath returns a valid SVG path string', () => {
    const { result } = renderHook(() => useEPPRoutingData())
    const src = { id: 'a', label: 'A', x: 10, y: 50, type: 'source' as const, color: '#fff' }
    const tgt = { id: 'b', label: 'B', x: 80, y: 50, type: 'router' as const, color: '#fff' }
    const path = result.current.generatePath(src, tgt)
    expect(typeof path).toBe('string')
    expect(path).toMatch(/^M \d/)
    expect(path).toContain('Q')
  })

  it('getNodeWithMetrics returns the node unchanged when no metric exists', () => {
    const { result } = renderHook(() => useEPPRoutingData())
    const node = { id: 'no-metric', label: 'X', x: 0, y: 0, type: 'prefill' as const, color: '#fff', load: 42 }
    const out = result.current.getNodeWithMetrics(node)
    expect(out).toEqual(node)
  })

  it('toggleMetric adds a new metric type', () => {
    const { result } = renderHook(() => useEPPRoutingData())
    // Default selection is ['load']
    expect(result.current.selectedMetricTypes).toContain('load')
    act(() => {
      result.current.toggleMetric('rps' as MetricType)
    })
    expect(result.current.selectedMetricTypes).toContain('rps')
  })

  it('toggleMetric does not remove the last remaining metric type', () => {
    const { result } = renderHook(() => useEPPRoutingData())
    // ['load'] — toggling the only selected type should keep it
    act(() => {
      result.current.toggleMetric('load' as MetricType)
    })
    expect(result.current.selectedMetricTypes).toContain('load')
  })

  it('toggleShowParticles toggles the showParticles flag', () => {
    const { result } = renderHook(() => useEPPRoutingData())
    expect(result.current.showParticles).toBe(true)
    act(() => {
      result.current.toggleShowParticles()
    })
    expect(result.current.showParticles).toBe(false)
    act(() => {
      result.current.toggleShowParticles()
    })
    expect(result.current.showParticles).toBe(true)
  })

  it('toggleViewMode cycles between default and horseshoe', () => {
    const { result } = renderHook(() => useEPPRoutingData())
    expect(result.current.viewMode).toBe('default')
    act(() => {
      result.current.toggleViewMode()
    })
    expect(result.current.viewMode).toBe('horseshoe')
    act(() => {
      result.current.toggleViewMode()
    })
    expect(result.current.viewMode).toBe('default')
  })

  it('onHoveredLinkChange sets hoveredLink', () => {
    const { result } = renderHook(() => useEPPRoutingData())
    expect(result.current.hoveredLink).toBeNull()
    act(() => {
      result.current.onHoveredLinkChange('link-1')
    })
    expect(result.current.hoveredLink).toBe('link-1')
  })

  it('onSelectedNodeChange sets selectedNode', () => {
    const { result } = renderHook(() => useEPPRoutingData())
    expect(result.current.selectedNode).toBeNull()
    act(() => {
      result.current.onSelectedNodeChange('node-1')
    })
    expect(result.current.selectedNode).toBe('node-1')
  })

  it('uniqueId is a non-empty string matching the expected prefix', () => {
    const { result } = renderHook(() => useEPPRoutingData())
    expect(result.current.uniqueId).toMatch(/^epp-/)
  })
})
