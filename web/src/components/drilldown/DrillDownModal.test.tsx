import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { DrillDownModal } from './DrillDownModal'
import { useDrillDown, DrillDownProvider } from '../../hooks/useDrillDown'
import type { DrillDownView } from '../../hooks/useDrillDown'

vi.mock('../../lib/analytics', () => ({
  emitDrillDownOpened: vi.fn(),
  emitDrillDownClosed: vi.fn(),
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <DrillDownProvider>{children}</DrillDownProvider>
)

function makeView(overrides: Partial<DrillDownView> = {}): DrillDownView {
  return {
    type: overrides.type ?? 'cluster',
    title: overrides.title ?? 'test-cluster',
    data: overrides.data ?? { cluster: 'ctx/test-cluster' },
  }
}

describe('DrillDownModal Component', () => {
  it('exports DrillDownModal component', () => {
    expect(DrillDownModal).toBeDefined()
    expect(typeof DrillDownModal).toBe('function')
  })

  it('DrillDownProvider and useDrillDown supply back navigation (pop) and close', () => {
    expect(DrillDownProvider).toBeDefined()
    expect(typeof DrillDownProvider).toBe('function')
    expect(useDrillDown).toBeDefined()
    expect(typeof useDrillDown).toBe('function')
  })

  it('pop navigates back through the drilldown stack', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })

    // Open first view
    act(() => result.current.open(makeView({ title: 'Cluster A', type: 'cluster' })))
    expect(result.current.state.stack).toHaveLength(1)

    // Push second view
    act(() => result.current.push(makeView({ title: 'Pod X', type: 'pod', data: { cluster: 'ctx/a', namespace: 'default', pod: 'pod-x' } })))
    expect(result.current.state.stack).toHaveLength(2)
    expect(result.current.state.currentView?.title).toBe('Pod X')

    // Pop should go back to first view
    act(() => result.current.pop())
    expect(result.current.state.stack).toHaveLength(1)
    expect(result.current.state.currentView?.title).toBe('Cluster A')
    expect(result.current.state.isOpen).toBe(true)
  })

  it('goTo navigates to a specific breadcrumb index', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })

    act(() => result.current.open(makeView({ title: 'Cluster', type: 'cluster' })))
    act(() => result.current.push(makeView({ title: 'Namespace', type: 'namespace', data: { cluster: 'ctx/a', namespace: 'default' } })))
    act(() => result.current.push(makeView({ title: 'Pod', type: 'pod', data: { cluster: 'ctx/a', namespace: 'default', pod: 'p1' } })))
    expect(result.current.state.stack).toHaveLength(3)

    // Jump back to first breadcrumb
    act(() => result.current.goTo(0))
    expect(result.current.state.stack).toHaveLength(1)
    expect(result.current.state.currentView?.title).toBe('Cluster')
  })

  it('close clears the entire stack', () => {
    const { result } = renderHook(() => useDrillDown(), { wrapper })

    act(() => result.current.open(makeView({ title: 'Cluster', type: 'cluster' })))
    act(() => result.current.push(makeView({ title: 'Pod', type: 'pod', data: { cluster: 'ctx/a', namespace: 'default', pod: 'p1' } })))

    act(() => result.current.close())
    expect(result.current.state.isOpen).toBe(false)
    expect(result.current.state.stack).toHaveLength(0)
    expect(result.current.state.currentView).toBeNull()
  })
})
