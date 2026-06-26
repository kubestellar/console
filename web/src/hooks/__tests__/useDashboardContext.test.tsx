import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { DashboardProvider, useDashboardContext, useDashboardContextOptional } from '../useDashboardContext'

vi.mock('../useDashboardHealth', () => ({
  useDashboardHealth: vi.fn(() => ({
    status: 'healthy',
    message: 'All systems healthy',
    details: [],
    criticalCount: 0,
    warningCount: 0,
  })),
}))

vi.mock('../useAlerts', () => ({
  useAlerts: vi.fn(() => ({ activeAlerts: [] })),
}))

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({ deduplicatedClusters: [], isLoading: false })),
  usePodIssues: vi.fn(() => ({ issues: [], isLoading: false })),
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <DashboardProvider>{children}</DashboardProvider>
)

describe('useDashboardContext', () => {
  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useDashboardContext())
    }).toThrow('useDashboardContext must be used within a DashboardProvider')
  })

  it('returns context when inside provider', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    expect(result.current).toHaveProperty('isAddCardModalOpen')
    expect(result.current).toHaveProperty('health')
    expect(result.current.isAddCardModalOpen).toBe(false)
  })

  it('openAddCardModal and closeAddCardModal toggle state', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    expect(result.current.isAddCardModalOpen).toBe(false)
    act(() => { result.current.openAddCardModal() })
    expect(result.current.isAddCardModalOpen).toBe(true)
    act(() => { result.current.closeAddCardModal() })
    expect(result.current.isAddCardModalOpen).toBe(false)
  })

  it('pendingOpenAddCardModal can be set and read', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    expect(result.current.pendingOpenAddCardModal).toBe(false)
    act(() => { result.current.setPendingOpenAddCardModal(true) })
    expect(result.current.pendingOpenAddCardModal).toBe(true)
  })

  it('templates modal can be opened and closed', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    act(() => { result.current.openTemplatesModal() })
    expect(result.current.isTemplatesModalOpen).toBe(true)
    act(() => { result.current.closeTemplatesModal() })
    expect(result.current.isTemplatesModalOpen).toBe(false)
  })

  it('pendingRestoreCard can be set and cleared', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    expect(result.current.pendingRestoreCard).toBeNull()

    const card = { cardType: 'cluster', config: {} }
    act(() => { result.current.setPendingRestoreCard(card) })
    expect(result.current.pendingRestoreCard).toEqual(card)

    act(() => { result.current.clearPendingRestoreCard() })
    expect(result.current.pendingRestoreCard).toBeNull()
  })

  it('health info is provided', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    expect(result.current.health).toHaveProperty('status')
    expect(result.current.health.status).toBe('healthy')
  })
})

describe('useDashboardContextOptional', () => {
  it('returns null outside provider', () => {
    const { result } = renderHook(() => useDashboardContextOptional())
    expect(result.current).toBeNull()
  })

  it('returns context inside provider', () => {
    const { result } = renderHook(() => useDashboardContextOptional(), { wrapper })
    expect(result.current).not.toBeNull()
    expect(result.current?.isAddCardModalOpen).toBe(false)
  })
})
