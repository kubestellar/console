import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../lib/api/dashboard-api', () => ({
  dashboardApi: {
    listDashboards: vi.fn(),
    createDashboard: vi.fn(),
    updateDashboard: vi.fn(),
    deleteDashboard: vi.fn(),
    moveCardToDashboard: vi.fn(),
    getDashboard: vi.fn(),
    exportDashboard: vi.fn(),
    importDashboard: vi.fn(),
  },
}))

vi.mock('../../lib/analytics', () => ({
  emitDashboardCreated: vi.fn(),
  emitDashboardDeleted: vi.fn(),
  emitDashboardImported: vi.fn(),
  emitDashboardExported: vi.fn(),
}))

import { useDashboards } from '../useDashboards'
import { dashboardApi } from '../../lib/api/dashboard-api'
import { emitDashboardCreated, emitDashboardDeleted } from '../../lib/analytics'

describe('useDashboards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue({ data: [] })
  })

  it('loads dashboards on mount', async () => {
    const mockDashboards = [
      { id: 'd1', name: 'Dashboard 1', is_default: true },
    ]
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue({ data: mockDashboards })

    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.dashboards).toHaveLength(1)
    expect(result.current.dashboards[0].name).toBe('Dashboard 1')
  })

  it('handles API failure gracefully (silent)', async () => {
    vi.mocked(dashboardApi.listDashboards).mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.dashboards).toEqual([])
  })

  it('createDashboard adds to state and emits analytics', async () => {
    const newDash = { id: 'd2', name: 'New Dashboard' }
    vi.mocked(dashboardApi.createDashboard).mockResolvedValue({ data: newDash })

    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.createDashboard('New Dashboard')
    })
    expect(result.current.dashboards).toHaveLength(1)
    expect(emitDashboardCreated).toHaveBeenCalledWith('New Dashboard')
  })

  it('updateDashboard updates state', async () => {
    const initial = { id: 'd1', name: 'Original' }
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue({ data: [initial] })
    const updated = { id: 'd1', name: 'Updated' }
    vi.mocked(dashboardApi.updateDashboard).mockResolvedValue({ data: updated })

    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.updateDashboard('d1', { name: 'Updated' })
    })
    expect(result.current.dashboards[0].name).toBe('Updated')
  })

  it('deleteDashboard removes from state and emits analytics', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue({ data: [{ id: 'd1', name: 'Test' }] })
    vi.mocked(dashboardApi.deleteDashboard).mockResolvedValue(undefined)

    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.deleteDashboard('d1')
    })
    expect(result.current.dashboards).toHaveLength(0)
    expect(emitDashboardDeleted).toHaveBeenCalled()
  })

  it('getDashboardWithCards returns null on error', async () => {
    vi.mocked(dashboardApi.listDashboards).mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let dashboard: unknown = undefined
    await act(async () => {
      dashboard = await result.current.getDashboardWithCards('d1')
    })
    expect(dashboard).toBeNull()
  })

  it('getAllDashboardsWithCards returns empty on error', async () => {
    vi.mocked(dashboardApi.listDashboards).mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let dashboards: unknown[] = []
    await act(async () => {
      dashboards = await result.current.getAllDashboardsWithCards()
    })
    expect(dashboards).toEqual([])
  })

  it('handles null data from API', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue({ data: null })
    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.dashboards).toEqual([])
  })

  it('moveCardToDashboard calls API with correct params', async () => {
    vi.mocked(dashboardApi.moveCardToDashboard).mockResolvedValue({ data: { success: true } })
    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.moveCardToDashboard('card-1', 'target-dash')
    })
    expect(dashboardApi.moveCardToDashboard).toHaveBeenCalledWith('card-1', 'target-dash')
  })

  it('getDashboardWithCards returns dashboard data on success', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue({ data: [] })
    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const dashData = { id: 'd1', name: 'Test', cards: [{ id: 'c1', card_type: 'health' }] }
    vi.mocked(dashboardApi.getDashboard).mockResolvedValueOnce({ data: dashData })

    let dashboard: unknown = undefined
    await act(async () => {
      dashboard = await result.current.getDashboardWithCards('d1')
    })
    expect(dashboard).toEqual(dashData)
  })

  it('getAllDashboardsWithCards returns dashboards with their cards', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue({ data: [] })
    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const dashList = [
      { id: 'd1', name: 'Dashboard 1' },
      { id: 'd2', name: 'Dashboard 2' },
    ]
    const d1Full = { id: 'd1', name: 'Dashboard 1', cards: [{ id: 'c1', card_type: 'health' }] }
    const d2Full = { id: 'd2', name: 'Dashboard 2', cards: [] }

    vi.mocked(dashboardApi.listDashboards).mockResolvedValueOnce({ data: dashList })
    vi.mocked(dashboardApi.getDashboard)
      .mockResolvedValueOnce({ data: d1Full })
      .mockResolvedValueOnce({ data: d2Full })

    let dashboards: unknown[] = []
    await act(async () => {
      dashboards = await result.current.getAllDashboardsWithCards()
    })
    expect(dashboards).toHaveLength(2)
  })

  it('getAllDashboardsWithCards returns empty when dashboardList is empty', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue({ data: [] })
    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    vi.mocked(dashboardApi.listDashboards).mockResolvedValueOnce({ data: [] })

    let dashboards: unknown[] = []
    await act(async () => {
      dashboards = await result.current.getAllDashboardsWithCards()
    })
    expect(dashboards).toEqual([])
  })

  it('getAllDashboardsWithCards falls back to dashboard when getDashboardWithCards fails', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue({ data: [] })
    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const dashList = [{ id: 'd1', name: 'Dash 1' }]
    vi.mocked(dashboardApi.listDashboards).mockResolvedValueOnce({ data: dashList })
    vi.mocked(dashboardApi.getDashboard).mockRejectedValueOnce(new Error('fail'))

    let dashboards: unknown[] = []
    await act(async () => {
      dashboards = await result.current.getAllDashboardsWithCards()
    })
    expect(dashboards).toHaveLength(1)
    expect((dashboards[0] as { name: string }).name).toBe('Dash 1')
  })

  it('exportDashboard calls API and emits analytics', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue({ data: [] })
    const { emitDashboardExported } = await import('../../lib/analytics')
    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const exportData = { name: 'Exported', cards: [] }
    vi.mocked(dashboardApi.exportDashboard).mockResolvedValueOnce({ data: exportData })

    let exportResult: unknown
    await act(async () => {
      exportResult = await result.current.exportDashboard('d1')
    })
    expect(exportResult).toEqual(exportData)
    expect(emitDashboardExported).toHaveBeenCalled()
  })

  it('importDashboard adds to state and emits analytics', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue({ data: [] })
    const { emitDashboardImported } = await import('../../lib/analytics')
    const newDash = { id: 'd-imported', name: 'Imported Dashboard' }
    vi.mocked(dashboardApi.importDashboard).mockResolvedValue({ data: newDash })
    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.importDashboard({ name: 'Imported Dashboard', cards: [] })
    })
    expect(result.current.dashboards).toHaveLength(1)
    expect(result.current.dashboards[0].name).toBe('Imported Dashboard')
    expect(emitDashboardImported).toHaveBeenCalled()
  })

  it('importDashboard handles null data response', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue({ data: [] })
    vi.mocked(dashboardApi.importDashboard).mockResolvedValue({ data: null })
    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.importDashboard({ name: 'Test' })
    })
    // Should not add null to the list
    expect(result.current.dashboards).toHaveLength(0)
  })

  it('loadDashboards can be called manually to refresh', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue({ data: [{ id: 'd1', name: 'Initial' }] })
    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.dashboards).toHaveLength(1)

    vi.mocked(dashboardApi.listDashboards).mockResolvedValue({ data: [{ id: 'd1', name: 'Initial' }, { id: 'd2', name: 'New' }] })
    await act(async () => {
      await result.current.loadDashboards()
    })
    expect(result.current.dashboards).toHaveLength(2)
  })

  it('keeps action references stable across rerenders', async () => {
    const { result, rerender } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const initialActions = {
      loadDashboards: result.current.loadDashboards,
      createDashboard: result.current.createDashboard,
      updateDashboard: result.current.updateDashboard,
      deleteDashboard: result.current.deleteDashboard,
      moveCardToDashboard: result.current.moveCardToDashboard,
      getDashboardWithCards: result.current.getDashboardWithCards,
      getAllDashboardsWithCards: result.current.getAllDashboardsWithCards,
      exportDashboard: result.current.exportDashboard,
      importDashboard: result.current.importDashboard,
    }

    rerender()

    expect(result.current.loadDashboards).toBe(initialActions.loadDashboards)
    expect(result.current.createDashboard).toBe(initialActions.createDashboard)
    expect(result.current.updateDashboard).toBe(initialActions.updateDashboard)
    expect(result.current.deleteDashboard).toBe(initialActions.deleteDashboard)
    expect(result.current.moveCardToDashboard).toBe(initialActions.moveCardToDashboard)
    expect(result.current.getDashboardWithCards).toBe(initialActions.getDashboardWithCards)
    expect(result.current.getAllDashboardsWithCards).toBe(initialActions.getAllDashboardsWithCards)
    expect(result.current.exportDashboard).toBe(initialActions.exportDashboard)
    expect(result.current.importDashboard).toBe(initialActions.importDashboard)
  })
})
