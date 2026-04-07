import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const {
  mockCreateDashboard,
  mockUpdateDashboard,
  mockEmitDashboardCreated,
  store,
} = vi.hoisted(() => ({
  mockCreateDashboard: vi.fn().mockResolvedValue({ id: 'dash-123', name: 'Test' }),
  mockUpdateDashboard: vi.fn().mockResolvedValue({}),
  mockEmitDashboardCreated: vi.fn(),
  store: new Map<string, string>(),
}))

vi.mock('../useDashboards', () => ({
  useDashboards: () => ({
    createDashboard: mockCreateDashboard,
    updateDashboard: mockUpdateDashboard,
  }),
}))

vi.mock('../../lib/analytics', () => ({
  emitGroundControlDashboardCreated: mockEmitDashboardCreated,
}))

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetJSON: <T,>(key: string): T | null => {
    const raw = store.get(key)
    if (!raw) return null
    try { return JSON.parse(raw) as T } catch { return null }
  },
  safeSetJSON: <T,>(key: string, value: T) => { store.set(key, JSON.stringify(value)); return true },
}))

import { useGroundControlDashboard } from '../useGroundControlDashboard'

describe('useGroundControlDashboard', () => {
  beforeEach(() => {
    store.clear()
    mockCreateDashboard.mockClear()
    mockUpdateDashboard.mockClear()
    mockEmitDashboardCreated.mockClear()
  })

  it('creates a dashboard with cards for known projects', async () => {
    const { result } = renderHook(() => useGroundControlDashboard())

    let output: Awaited<ReturnType<typeof result.current.generateGroundControlDashboard>> | undefined
    await act(async () => {
      output = await result.current.generateGroundControlDashboard({
        missionTitle: 'Deploy Prometheus',
        projects: [{ name: 'Prometheus', cncfProject: 'prometheus', category: 'Observability' }],
      })
    })

    expect(mockCreateDashboard).toHaveBeenCalledWith(expect.stringContaining('Prometheus'))
    expect(mockUpdateDashboard).toHaveBeenCalledWith('dash-123', expect.objectContaining({
      cards: expect.arrayContaining([
        expect.objectContaining({ card_type: 'cluster_health' }),
      ]),
    }))
    expect(output!.dashboardId).toBe('dash-123')
    expect(output!.cardCount).toBeGreaterThan(3) // baseline + prometheus cards
    expect(mockEmitDashboardCreated).toHaveBeenCalled()
  })

  it('reports missing card projects for unknown projects', async () => {
    const { result } = renderHook(() => useGroundControlDashboard())

    let output: Awaited<ReturnType<typeof result.current.generateGroundControlDashboard>> | undefined
    await act(async () => {
      output = await result.current.generateGroundControlDashboard({
        missionTitle: 'Deploy Unknown',
        projects: [{ name: 'UnknownProject', cncfProject: 'unknown', category: 'Alien' }],
      })
    })

    expect(output!.missingCardProjects).toContain('UnknownProject')
  })

  it('stores dashboard in Ground Control mapping', async () => {
    const { result } = renderHook(() => useGroundControlDashboard())

    await act(async () => {
      await result.current.generateGroundControlDashboard({
        missionTitle: 'Test',
        projects: [{ name: 'test', category: 'Runtime' }],
      })
    })

    const mapping = JSON.parse(store.get('kc-ground-control-dashboards') || '{}')
    expect(mapping['dash-123']).toBeDefined()
    expect(mapping['dash-123'].projects).toContain('test')
  })

  it('isGroundControlDashboard returns true for tracked dashboards', async () => {
    const { result } = renderHook(() => useGroundControlDashboard())

    await act(async () => {
      await result.current.generateGroundControlDashboard({
        missionTitle: 'Test',
        projects: [{ name: 'test' }],
      })
    })

    expect(result.current.isGroundControlDashboard('dash-123')).toBe(true)
    expect(result.current.isGroundControlDashboard('other-id')).toBe(false)
  })

  it('merges cards from multiple projects without duplicates', async () => {
    const { result } = renderHook(() => useGroundControlDashboard())

    await act(async () => {
      await result.current.generateGroundControlDashboard({
        missionTitle: 'Multi-project',
        projects: [
          { name: 'Prometheus', cncfProject: 'prometheus' },
          { name: 'ArgoCD', cncfProject: 'argocd' },
        ],
      })
    })

    const cardsArg = mockUpdateDashboard.mock.calls[0][1].cards
    const cardTypes = cardsArg.map((c: { card_type: string }) => c.card_type)
    // No duplicates
    expect(new Set(cardTypes).size).toBe(cardTypes.length)
    // Has cards from both projects
    expect(cardTypes).toContain('active_alerts') // prometheus
    expect(cardTypes).toContain('argocd_applications') // argocd
    expect(cardTypes).toContain('cluster_health') // baseline
  })
})
