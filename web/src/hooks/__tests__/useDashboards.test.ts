import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../../lib/analytics', () => ({
  emitDashboardCreated: vi.fn(),
  emitDashboardDeleted: vi.fn(),
  emitDashboardImported: vi.fn(),
  emitDashboardExported: vi.fn(),
}))

import { useDashboards } from '../useDashboards'
import { api } from '../../lib/api'
import { emitDashboardCreated, emitDashboardDeleted } from '../../lib/analytics'

describe('useDashboards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue({ data: [] })
  })

  it('loads dashboards on mount', async () => {
    const mockDashboards = [
      { id: 'd1', name: 'Dashboard 1', is_default: true },
    ]
    vi.mocked(api.get).mockResolvedValue({ data: mockDashboards })

    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.dashboards).toHaveLength(1)
    expect(result.current.dashboards[0].name).toBe('Dashboard 1')
  })

  it('handles API failure gracefully (silent)', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.dashboards).toEqual([])
  })

  it('createDashboard adds to state and emits analytics', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] })
    const newDash = { id: 'd2', name: 'New Dashboard' }
    vi.mocked(api.post).mockResolvedValue({ data: newDash })

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
    vi.mocked(api.get).mockResolvedValue({ data: [initial] })
    const updated = { id: 'd1', name: 'Updated' }
    vi.mocked(api.put).mockResolvedValue({ data: updated })

    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.updateDashboard('d1', { name: 'Updated' })
    })
    expect(result.current.dashboards[0].name).toBe('Updated')
  })

  it('deleteDashboard removes from state and emits analytics', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [{ id: 'd1', name: 'Test' }] })
    vi.mocked(api.delete).mockResolvedValue({})

    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.deleteDashboard('d1')
    })
    expect(result.current.dashboards).toHaveLength(0)
    expect(emitDashboardDeleted).toHaveBeenCalled()
  })

  it('getDashboardWithCards returns null on error', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let dashboard: unknown = undefined
    await act(async () => {
      dashboard = await result.current.getDashboardWithCards('d1')
    })
    expect(dashboard).toBeNull()
  })

  it('getAllDashboardsWithCards returns empty on error', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let dashboards: unknown[] = []
    await act(async () => {
      dashboards = await result.current.getAllDashboardsWithCards()
    })
    expect(dashboards).toEqual([])
  })

  it('handles null data from API', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: null })
    const { result } = renderHook(() => useDashboards())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.dashboards).toEqual([])
  })
})
