/**
 * Tests for DashboardContext — covers DashboardProvider state management.
 * useDashboardHealth is mocked; all state interactions tested via renderHook.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'

vi.mock('../../hooks/useDashboardHealth', () => ({
  useDashboardHealth: () => ({
    status: 'healthy',
    message: 'All systems operational',
    details: [],
    criticalCount: 0,
    warningCount: 0,
  }),
}))

import {
  DashboardProvider,
  useDashboardContext,
  useDashboardContextOptional,
} from '../DashboardContext'

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DashboardProvider, null, children)

// ── add card modal ────────────────────────────────────────────────────────────

describe('DashboardProvider — add card modal', () => {
  it('starts with modal closed', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    expect(result.current.isAddCardModalOpen).toBe(false)
  })

  it('openAddCardModal opens the modal', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    act(() => { result.current.openAddCardModal() })
    expect(result.current.isAddCardModalOpen).toBe(true)
  })

  it('openAddCardModal sets studioInitialSection', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    act(() => { result.current.openAddCardModal('cards') })
    expect(result.current.studioInitialSection).toBe('cards')
  })

  it('openAddCardModal sets studioWidgetCardType', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    act(() => { result.current.openAddCardModal('widgets', 'my-widget') })
    expect(result.current.studioWidgetCardType).toBe('my-widget')
  })

  it('openAddCardModal with no args leaves section and widgetCardType undefined', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    act(() => { result.current.openAddCardModal() })
    expect(result.current.studioInitialSection).toBeUndefined()
    expect(result.current.studioWidgetCardType).toBeUndefined()
  })

  it('closeAddCardModal closes the modal', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    act(() => { result.current.openAddCardModal('dashboards') })
    act(() => { result.current.closeAddCardModal() })
    expect(result.current.isAddCardModalOpen).toBe(false)
  })

  it('closeAddCardModal clears studioInitialSection', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    act(() => { result.current.openAddCardModal('collections') })
    act(() => { result.current.closeAddCardModal() })
    expect(result.current.studioInitialSection).toBeUndefined()
  })

  it('closeAddCardModal clears studioWidgetCardType', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    act(() => { result.current.openAddCardModal('widgets', 'wgt') })
    act(() => { result.current.closeAddCardModal() })
    expect(result.current.studioWidgetCardType).toBeUndefined()
  })

  it('can be opened and closed multiple times', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    act(() => { result.current.openAddCardModal() })
    expect(result.current.isAddCardModalOpen).toBe(true)
    act(() => { result.current.closeAddCardModal() })
    expect(result.current.isAddCardModalOpen).toBe(false)
    act(() => { result.current.openAddCardModal('cards') })
    expect(result.current.isAddCardModalOpen).toBe(true)
    expect(result.current.studioInitialSection).toBe('cards')
  })
})

// ── templates modal ───────────────────────────────────────────────────────────

describe('DashboardProvider — templates modal', () => {
  it('starts with templates modal closed', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    expect(result.current.isTemplatesModalOpen).toBe(false)
  })

  it('openTemplatesModal opens the modal', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    act(() => { result.current.openTemplatesModal() })
    expect(result.current.isTemplatesModalOpen).toBe(true)
  })

  it('closeTemplatesModal closes the modal', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    act(() => { result.current.openTemplatesModal() })
    act(() => { result.current.closeTemplatesModal() })
    expect(result.current.isTemplatesModalOpen).toBe(false)
  })
})

// ── pending restore card ──────────────────────────────────────────────────────

describe('DashboardProvider — pending restore card', () => {
  it('starts with no pending restore card', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    expect(result.current.pendingRestoreCard).toBeNull()
  })

  it('setPendingRestoreCard stores a card', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    const card = { cardType: 'my-card', config: { key: 'value' } }
    act(() => { result.current.setPendingRestoreCard(card) })
    expect(result.current.pendingRestoreCard).toEqual(card)
  })

  it('setPendingRestoreCard stores all optional fields', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    const card = { cardType: 'x', cardTitle: 'My Card', config: {}, dashboardId: 'dash-1' }
    act(() => { result.current.setPendingRestoreCard(card) })
    expect(result.current.pendingRestoreCard).toEqual(card)
  })

  it('clearPendingRestoreCard resets to null', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    act(() => { result.current.setPendingRestoreCard({ cardType: 'x', config: {} }) })
    act(() => { result.current.clearPendingRestoreCard() })
    expect(result.current.pendingRestoreCard).toBeNull()
  })

  it('setPendingRestoreCard(null) explicitly clears the card', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    act(() => { result.current.setPendingRestoreCard({ cardType: 'x', config: {} }) })
    act(() => { result.current.setPendingRestoreCard(null) })
    expect(result.current.pendingRestoreCard).toBeNull()
  })
})

// ── pending open add card modal flag ──────────────────────────────────────────

describe('DashboardProvider — pendingOpenAddCardModal flag', () => {
  it('starts false', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    expect(result.current.pendingOpenAddCardModal).toBe(false)
  })

  it('setPendingOpenAddCardModal(true) sets flag to true', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    act(() => { result.current.setPendingOpenAddCardModal(true) })
    expect(result.current.pendingOpenAddCardModal).toBe(true)
  })

  it('setPendingOpenAddCardModal(false) resets flag', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    act(() => { result.current.setPendingOpenAddCardModal(true) })
    act(() => { result.current.setPendingOpenAddCardModal(false) })
    expect(result.current.pendingOpenAddCardModal).toBe(false)
  })
})

// ── health ────────────────────────────────────────────────────────────────────

describe('DashboardProvider — health', () => {
  it('exposes health info from useDashboardHealth mock', () => {
    const { result } = renderHook(() => useDashboardContext(), { wrapper })
    expect(result.current.health.status).toBe('healthy')
    expect(result.current.health.criticalCount).toBe(0)
    expect(result.current.health.warningCount).toBe(0)
  })
})

// ── context errors outside provider ──────────────────────────────────────────

describe('useDashboardContext outside provider', () => {
  it('throws when called without a DashboardProvider', () => {
    expect(() => renderHook(() => useDashboardContext())).toThrow()
  })
})

describe('useDashboardContextOptional outside provider', () => {
  it('returns null when called without a DashboardProvider', () => {
    const { result } = renderHook(() => useDashboardContextOptional())
    expect(result.current).toBeNull()
  })
})
