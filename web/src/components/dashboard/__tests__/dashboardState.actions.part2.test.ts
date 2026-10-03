import { describe, it, expect, vi } from 'vitest'
import {
  mockApiPut,
  mockApiDelete,
  mockEmitCardAdded,
  mockEmitCardRemoved,
  mockEmitCardConfigured,
  tPass,
  makeCard,
  makeDashboard,
  applyUpdater,
} from './dashboardState.actions.setup'
import type { Card, DashboardTemplate } from './dashboardState.actions.setup'
import {
  removeCardFromBoard,
  updateCardWidth,
  updateCardHeight,
  updateCardConfig,
  addRecommendedCard,
  addCardFromAI,
  applyDashboardTemplate,
  addSingleCard,
  confirmDeployAction,
} from '../dashboardState.actions'

describe('removeCardFromBoard', () => {
  const baseDeps = () => ({
    localCards: [makeCard({ id: 'a' }), makeCard({ id: 'b' })],
    dashboard: makeDashboard({ id: 'dash' }),
    snapshot: vi.fn(),
    setLocalCards: vi.fn(),
    recordCardRemoved: vi.fn(),
  })

  it('emits analytics, snapshots, filters card out, and calls api.delete', async () => {
    const deps = baseDeps()
    mockApiDelete.mockResolvedValueOnce(undefined)
    await removeCardFromBoard('a', deps)
    expect(mockEmitCardRemoved).toHaveBeenCalledWith('cluster_health')
    expect(deps.recordCardRemoved).toHaveBeenCalledTimes(1)
    expect(deps.snapshot).toHaveBeenCalledWith(deps.localCards)
    const result = applyUpdater(deps.setLocalCards.mock.calls[0][0], deps.localCards)
    expect(result.map(c => c.id)).toEqual(['b'])
    expect(mockApiDelete).toHaveBeenCalledWith('/api/cards/a')
  })

  it('does not emit analytics when card id is unknown', async () => {
    const deps = baseDeps()
    mockApiDelete.mockResolvedValueOnce(undefined)
    await removeCardFromBoard('unknown', deps)
    expect(mockEmitCardRemoved).not.toHaveBeenCalled()
    expect(deps.recordCardRemoved).not.toHaveBeenCalled()
  })

  it('swallows api.delete failures (already-removed cards)', async () => {
    const deps = baseDeps()
    mockApiDelete.mockRejectedValueOnce(new Error('gone'))
    await expect(removeCardFromBoard('a', deps)).resolves.toBeUndefined()
  })

  it('skips api.delete when no dashboard is loaded', async () => {
    const deps = { ...baseDeps(), dashboard: null }
    await removeCardFromBoard('a', deps)
    expect(mockApiDelete).not.toHaveBeenCalled()
  })
})

// ─── updateCardWidth / updateCardHeight ────────────────────────────────────

describe('updateCardWidth', () => {
  const baseDeps = () => ({
    localCards: [makeCard({ id: 'a', position: { x: 1, y: 2, w: 4, h: 3 } })],
    dashboard: makeDashboard(),
    snapshot: vi.fn(),
    setLocalCards: vi.fn(),
    showToast: vi.fn(),
    t: tPass,
  })

  it('updates only the width and persists via api.put', async () => {
    const deps = baseDeps()
    mockApiPut.mockResolvedValueOnce({ data: {} })
    await updateCardWidth('a', 8, deps)
    const result = applyUpdater(deps.setLocalCards.mock.calls[0][0], deps.localCards)
    expect(result[0].position).toEqual({ x: 1, y: 2, w: 8, h: 3 })
    expect(mockApiPut).toHaveBeenCalledWith('/api/cards/a', {
      position: { x: 1, y: 2, w: 8, h: 3 },
    })
  })

  it('skips api.put for local-only card ids', async () => {
    const deps = baseDeps()
    deps.localCards = [makeCard({ id: 'new-1' })]
    await updateCardWidth('new-1', 6, deps)
    expect(mockApiPut).not.toHaveBeenCalled()
  })

  it('toasts on api.put failure', async () => {
    const deps = baseDeps()
    mockApiPut.mockRejectedValueOnce(new Error('boom'))
    await updateCardWidth('a', 8, deps)
    expect(deps.showToast).toHaveBeenCalledWith('Failed to update card width', 'error')
  })
})

describe('updateCardHeight', () => {
  const baseDeps = () => ({
    localCards: [makeCard({ id: 'a', position: { x: 0, y: 0, w: 4, h: 2 } })],
    dashboard: makeDashboard(),
    snapshot: vi.fn(),
    setLocalCards: vi.fn(),
    showToast: vi.fn(),
    t: tPass,
  })

  it('updates only the height and persists via api.put', async () => {
    const deps = baseDeps()
    mockApiPut.mockResolvedValueOnce({ data: {} })
    await updateCardHeight('a', 5, deps)
    const result = applyUpdater(deps.setLocalCards.mock.calls[0][0], deps.localCards)
    expect(result[0].position).toEqual({ x: 0, y: 0, w: 4, h: 5 })
    expect(mockApiPut).toHaveBeenCalledWith('/api/cards/a', {
      position: { x: 0, y: 0, w: 4, h: 5 },
    })
  })

  it('toasts on api.put failure', async () => {
    const deps = baseDeps()
    mockApiPut.mockRejectedValueOnce(new Error('boom'))
    await updateCardHeight('a', 5, deps)
    expect(deps.showToast).toHaveBeenCalledWith('Failed to update card height', 'error')
  })
})

// ─── updateCardConfig ──────────────────────────────────────────────────────

describe('updateCardConfig', () => {
  const baseDeps = () => ({
    localCards: [makeCard({ id: 'a', title: 'Old' })],
    dashboard: makeDashboard(),
    snapshot: vi.fn(),
    setLocalCards: vi.fn(),
    showToast: vi.fn(),
    t: tPass,
    recordCardConfigured: vi.fn(),
    closeConfigureCard: vi.fn(),
  })

  it('emits analytics, updates config+title, and persists to api', async () => {
    const deps = baseDeps()
    mockApiPut.mockResolvedValueOnce({ data: {} })
    await updateCardConfig('a', { refresh: 30 }, 'New Title', deps)
    expect(mockEmitCardConfigured).toHaveBeenCalledWith('cluster_health')
    expect(deps.recordCardConfigured).toHaveBeenCalledWith(
      'a', 'cluster_health', 'New Title', { refresh: 30 }, 'd1', 'Main',
    )
    const result = applyUpdater(deps.setLocalCards.mock.calls[0][0], deps.localCards)
    expect(result[0]).toMatchObject({ config: { refresh: 30 }, title: 'New Title' })
    expect(deps.closeConfigureCard).toHaveBeenCalled()
    expect(mockApiPut).toHaveBeenCalledWith('/api/cards/a', { config: { refresh: 30 }, title: 'New Title' })
  })

  it('retains previous title when newTitle is undefined', async () => {
    const deps = baseDeps()
    mockApiPut.mockResolvedValueOnce({ data: {} })
    await updateCardConfig('a', { x: 1 }, undefined, deps)
    const result = applyUpdater(deps.setLocalCards.mock.calls[0][0], deps.localCards)
    expect(result[0].title).toBe('Old')
  })

  it('toasts on api.put failure', async () => {
    const deps = baseDeps()
    mockApiPut.mockRejectedValueOnce(new Error('boom'))
    await updateCardConfig('a', {}, 't', deps)
    expect(deps.showToast).toHaveBeenCalledWith('Failed to update card configuration', 'error')
  })
})

// ─── addRecommendedCard ────────────────────────────────────────────────────

describe('addRecommendedCard', () => {
  const baseDeps = () => ({
    localCards: [] as Card[],
    dashboard: makeDashboard(),
    snapshot: vi.fn(),
    setLocalCards: vi.fn(),
    recordCardAdded: vi.fn(),
  })

  it('prepends a fresh card when the type is not already present', () => {
    const deps = baseDeps()
    addRecommendedCard('gpu_health', { region: 'us' }, 'GPU', deps)
    const result = applyUpdater(deps.setLocalCards.mock.calls[0][0], [makeCard({ id: 'x', card_type: 'other' })])
    expect(result[0].card_type).toBe('gpu_health')
    expect(result[0].id).toMatch(/^rec-/)
    expect(deps.recordCardAdded).toHaveBeenCalledTimes(1)
  })

  it('bumps an existing card of the same type to the front (no new id)', () => {
    const deps = baseDeps()
    const prev = [
      makeCard({ id: 'a', card_type: 'other' }),
      makeCard({ id: 'b', card_type: 'gpu_health' }),
    ]
    addRecommendedCard('gpu_health', undefined, undefined, deps)
    const result = applyUpdater(deps.setLocalCards.mock.calls[0][0], prev)
    expect(result.map(c => c.id)).toEqual(['b', 'a'])
    // recordCardAdded is only called on the "new card" branch, not the bump
    expect(deps.recordCardAdded).not.toHaveBeenCalled()
  })
})

// ─── addCardFromAI ─────────────────────────────────────────────────────────

describe('addCardFromAI', () => {
  it('prepends a new ai-* card, records analytics, and closes the configure modal', () => {
    const deps = {
      localCards: [makeCard({ id: 'x' })],
      dashboard: makeDashboard(),
      snapshot: vi.fn(),
      setLocalCards: vi.fn(),
      recordCardAdded: vi.fn(),
      closeConfigureCard: vi.fn(),
    }
    addCardFromAI('ai_card', { p: 1 }, 'AI Title', deps)
    const result = applyUpdater(deps.setLocalCards.mock.calls[0][0], deps.localCards)
    expect(result[0].id).toMatch(/^ai-/)
    expect(result[0].title).toBe('AI Title')
    expect(result[0].config).toEqual({ p: 1 })
    expect(deps.recordCardAdded).toHaveBeenCalled()
    expect(deps.closeConfigureCard).toHaveBeenCalled()
  })
})

// ─── applyDashboardTemplate ────────────────────────────────────────────────

describe('applyDashboardTemplate', () => {
  it('prepends all template cards and shows a success toast', () => {
    const deps = {
      localCards: [makeCard({ id: 'existing' })],
      dashboard: makeDashboard(),
      snapshot: vi.fn(),
      setLocalCards: vi.fn(),
      showToast: vi.fn(),
      t: tPass,
      recordCardAdded: vi.fn(),
    }
    const template: DashboardTemplate = {
      id: 'tpl1',
      name: 'Cluster Overview',
      description: '',
      icon: '',
      category: 'cluster',
      cards: [
        { card_type: 'a', position: { w: 6, h: 2 } },
        { card_type: 'b', title: 'B', config: { k: 'v' }, position: { w: 4, h: 3 } },
      ],
    }
    applyDashboardTemplate(template, deps)
    const result = applyUpdater(deps.setLocalCards.mock.calls[0][0], deps.localCards)
    expect(result.map(c => c.card_type)).toEqual(['a', 'b', 'cluster_health'])
    expect(result[0].position).toMatchObject({ w: 6, h: 2 })
    expect(result[1].config).toEqual({ k: 'v' })
    expect(deps.recordCardAdded).toHaveBeenCalledTimes(2)
    // success toast fired with template + count args
    expect(deps.showToast).toHaveBeenCalledWith(expect.any(String), 'success')
  })
})

// ─── addSingleCard ─────────────────────────────────────────────────────────

describe('addSingleCard', () => {
  it('prepends a rec-* card, emits smart_suggestion analytics', () => {
    const deps = {
      localCards: [] as Card[],
      dashboard: makeDashboard(),
      snapshot: vi.fn(),
      setLocalCards: vi.fn(),
      recordCardAdded: vi.fn(),
    }
    addSingleCard('bird_watch', deps)
    const result = applyUpdater(deps.setLocalCards.mock.calls[0][0], deps.localCards)
    expect(result[0].card_type).toBe('bird_watch')
    expect(result[0].id).toMatch(/^rec-/)
    expect(mockEmitCardAdded).toHaveBeenCalledWith('bird_watch', 'smart_suggestion')
  })
})

// ─── confirmDeployAction ───────────────────────────────────────────────────
