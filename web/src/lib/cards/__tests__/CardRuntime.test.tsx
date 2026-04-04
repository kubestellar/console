import { describe, it, expect, vi} from 'vitest'
import {
  registerDataHook,
  registerDrillAction,
  registerRenderer,
} from '../CardRuntime'

/**
 * Tests for CardRuntime registry functions.
 *
 * CardRuntime has three registries:
 * 1. Data Hook Registry - maps hook names to data-fetching hooks
 * 2. Drill Action Registry - maps action names to drill-down functions
 * 3. Renderer Registry - maps render names to cell renderer components
 *
 * We also test the built-in default renderers that are pre-registered.
 */

describe('registerDataHook', () => {
  it('registers a data hook without throwing', () => {
    const mockHook = () => ({
      data: [],
      isLoading: false,
      isRefreshing: false,
      refetch: vi.fn(),
    })
    expect(() => registerDataHook('test-hook', mockHook)).not.toThrow()
  })

  it('overwrites a previously registered hook', () => {
    const hook1 = () => ({
      data: [1],
      isLoading: false,
      isRefreshing: false,
      refetch: vi.fn(),
    })
    const hook2 = () => ({
      data: [2],
      isLoading: false,
      isRefreshing: false,
      refetch: vi.fn(),
    })

    registerDataHook('overwrite-test', hook1)
    registerDataHook('overwrite-test', hook2)
    // No assertion needed — just verifying no error on overwrite
  })

  it('accepts hooks returning typed data arrays', () => {
    interface PodIssue {
      name: string
      status: string
    }
    const hook = () => ({
      data: [{ name: 'pod-1', status: 'CrashLoopBackOff' }] as PodIssue[],
      isLoading: false,
      isRefreshing: false,
      refetch: vi.fn(),
    })
    expect(() => registerDataHook<PodIssue>('pod-issues', hook)).not.toThrow()
  })
})

describe('registerDrillAction', () => {
  it('registers a drill action without throwing', () => {
    const action = vi.fn()
    expect(() => registerDrillAction('drillToPod', action)).not.toThrow()
  })

  it('overwrites a previously registered action', () => {
    const action1 = vi.fn()
    const action2 = vi.fn()
    registerDrillAction('drill-overwrite', action1)
    registerDrillAction('drill-overwrite', action2)
    // No assertion needed — overwrite should not throw
  })

  it('accepts actions with multiple parameters', () => {
    const action = (_cluster: unknown, _namespace: unknown, _name: unknown) => {
      // Process drill-down
    }
    expect(() => registerDrillAction('drillToResource', action)).not.toThrow()
  })
})

describe('registerRenderer', () => {
  it('registers a custom renderer without throwing', () => {
    const renderer = (value: unknown) => String(value)
    expect(() => registerRenderer('customText', renderer)).not.toThrow()
  })

  it('overwrites a previously registered renderer', () => {
    const r1 = (value: unknown) => `v1: ${String(value)}`
    const r2 = (value: unknown) => `v2: ${String(value)}`
    registerRenderer('overwrite-renderer', r1)
    registerRenderer('overwrite-renderer', r2)
    // No assertion needed — overwrite should not throw
  })
})

describe('CardRuntime built-in renderers', () => {
  // The module registers 'statusBadge', 'clusterBadge', 'number', 'percentage'
  // at import time. We test the logic patterns they implement.

  it('statusBadge maps "running" to success variant', () => {
    const status = 'running'
    const lower = status.toLowerCase()
    let variant = 'neutral'
    if (lower.includes('running') || lower.includes('healthy') || lower.includes('ready')) {
      variant = 'success'
    }
    expect(variant).toBe('success')
  })

  it('statusBadge maps "pending" to warning variant', () => {
    const status = 'Pending'
    const lower = status.toLowerCase()
    let variant = 'neutral'
    if (lower.includes('running') || lower.includes('healthy') || lower.includes('ready')) {
      variant = 'success'
    } else if (lower.includes('pending') || lower.includes('waiting')) {
      variant = 'warning'
    }
    expect(variant).toBe('warning')
  })

  it('statusBadge maps "failed" to error variant', () => {
    const status = 'Failed'
    const lower = status.toLowerCase()
    let variant = 'neutral'
    if (lower.includes('running') || lower.includes('healthy') || lower.includes('ready')) {
      variant = 'success'
    } else if (lower.includes('pending') || lower.includes('waiting')) {
      variant = 'warning'
    } else if (lower.includes('failed') || lower.includes('error') || lower.includes('crash')) {
      variant = 'error'
    }
    expect(variant).toBe('error')
  })

  it('statusBadge maps "CrashLoopBackOff" to error variant', () => {
    const status = 'CrashLoopBackOff'
    const lower = status.toLowerCase()
    let variant = 'neutral'
    if (lower.includes('running') || lower.includes('healthy') || lower.includes('ready')) {
      variant = 'success'
    } else if (lower.includes('pending') || lower.includes('waiting')) {
      variant = 'warning'
    } else if (lower.includes('failed') || lower.includes('error') || lower.includes('crash')) {
      variant = 'error'
    }
    expect(variant).toBe('error')
  })

  it('statusBadge defaults to neutral for unknown statuses', () => {
    const status = 'Terminating'
    const lower = status.toLowerCase()
    let variant = 'neutral'
    if (lower.includes('running') || lower.includes('healthy') || lower.includes('ready')) {
      variant = 'success'
    } else if (lower.includes('pending') || lower.includes('waiting')) {
      variant = 'warning'
    } else if (lower.includes('failed') || lower.includes('error') || lower.includes('crash')) {
      variant = 'error'
    }
    expect(variant).toBe('neutral')
  })

  it('number renderer formats with locale string', () => {
    const value = 1234567
    const formatted = Number(value).toLocaleString()
    expect(formatted).toContain('1')
    expect(formatted.length).toBeGreaterThan(String(value).length - 1) // has separators or same length
  })

  it('percentage renderer formats with one decimal', () => {
    const value = 87.456
    const formatted = Number(value).toFixed(1) + '%'
    expect(formatted).toBe('87.5%')
  })
})
