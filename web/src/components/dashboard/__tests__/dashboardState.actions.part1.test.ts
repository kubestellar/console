import { describe, it, expect, vi } from 'vitest'
import {
  mockApiGet,
  mockApiPost,
  mockEmitCardAdded,
  mockSetDashboardCache,
  mockPatchDashboardCache,
  mockSaveDashboardCardsToStorage,
  tPass,
  makeCard,
  makeDashboard,
  applyUpdater,
} from './dashboardState.actions.setup'
import type { Card, DashboardData } from './dashboardState.actions.setup'
import { BackendUnavailableError } from '../../../lib/api'
import {
  loadDashboardData,
  persistLocalCards,
  addCardsToBoard,
} from '../dashboardState.actions'

describe('persistLocalCards', () => {
  it('is a no-op for an empty list (no cache/storage writes)', () => {
    persistLocalCards('main', [])
    expect(mockPatchDashboardCache).not.toHaveBeenCalled()
    expect(mockSaveDashboardCardsToStorage).not.toHaveBeenCalled()
  })

  it('patches cache and writes storage when cards are present', () => {
    const cards = [makeCard({ id: 'x' })]
    persistLocalCards('main', cards)
    expect(mockPatchDashboardCache).toHaveBeenCalledTimes(1)
    const patch = mockPatchDashboardCache.mock.calls[0][0]
    expect(patch.cards).toBe(cards)
    expect(typeof patch.timestamp).toBe('number')
    expect(mockSaveDashboardCardsToStorage).toHaveBeenCalledWith('main', cards)
  })
})

// ─── loadDashboardData ─────────────────────────────────────────────────────

describe('loadDashboardData', () => {
  const makeDeps = () => ({
    setIsLoading: vi.fn(),
    setDashboard: vi.fn(),
    setLocalCards: vi.fn(),
    showToast: vi.fn(),
    t: tPass,
  })

  it('picks is_default dashboard, hydrates cards, and caches', async () => {
    const d1 = makeDashboard({ id: 'd1', name: 'Alt' })
    const d2 = makeDashboard({ id: 'd2', name: 'Default', is_default: true })
    const full = makeDashboard({ id: 'd2', name: 'Default', cards: [makeCard({ id: 'api-card' })] })
    mockApiGet
      .mockResolvedValueOnce({ data: [d1, d2] })
      .mockResolvedValueOnce({ data: full })

    const deps = makeDeps()
    await loadDashboardData(false, deps)

    expect(deps.setIsLoading).toHaveBeenNthCalledWith(1, true)
    expect(mockApiGet).toHaveBeenNthCalledWith(1, '/api/dashboards')
    expect(mockApiGet).toHaveBeenNthCalledWith(2, '/api/dashboards/d2')
    expect(deps.setDashboard).toHaveBeenCalledWith(full)
    const nextCards = applyUpdater(deps.setLocalCards.mock.calls[0][0], [])
    expect(nextCards.map(c => c.id)).toEqual(['api-card'])
    expect(mockSetDashboardCache).toHaveBeenCalledTimes(1)
    // finally block clears loading
    expect(deps.setIsLoading).toHaveBeenLastCalledWith(false)
  })

  it('falls back to first dashboard when none marked is_default', async () => {
    const d1 = makeDashboard({ id: 'first' })
    const d2 = makeDashboard({ id: 'second' })
    const full = makeDashboard({ id: 'first', cards: [makeCard()] })
    mockApiGet.mockResolvedValueOnce({ data: [d1, d2] }).mockResolvedValueOnce({ data: full })
    await loadDashboardData(false, makeDeps())
    expect(mockApiGet).toHaveBeenNthCalledWith(2, '/api/dashboards/first')
  })

  it('merges local-only cards ahead of api cards on subsequent load', async () => {
    const full = makeDashboard({ id: 'd1', cards: [makeCard({ id: 'api-a' })] })
    mockApiGet
      .mockResolvedValueOnce({ data: [makeDashboard({ id: 'd1' })] })
      .mockResolvedValueOnce({ data: full })
    const deps = makeDeps()
    await loadDashboardData(false, deps)
    // prev contains a local-only "new-*" plus a stale "api-a"
    const prev = [makeCard({ id: 'new-local' }), makeCard({ id: 'api-a' })]
    const next = applyUpdater(deps.setLocalCards.mock.calls[0][0], prev)
    expect(next.map(c => c.id)).toEqual(['new-local', 'api-a'])
  })

  it('falls back to demo cards when foreground call returns empty list', async () => {
    mockApiGet.mockResolvedValueOnce({ data: [] })
    const deps = makeDeps()
    await loadDashboardData(false, deps)
    const cards = applyUpdater(deps.setLocalCards.mock.calls[0][0], [])
    expect(cards.map(c => c.id)).toEqual(['demo-1'])
    expect(mockSetDashboardCache).toHaveBeenCalledWith(
      expect.objectContaining({ dashboard: null }),
    )
  })

  it('returns silently on empty list when background=true', async () => {
    mockApiGet.mockResolvedValueOnce({ data: [] })
    const deps = makeDeps()
    await loadDashboardData(true, deps)
    expect(deps.setLocalCards).not.toHaveBeenCalled()
    expect(deps.setIsLoading).not.toHaveBeenCalledWith(true) // background skips loading spinner
  })

  it('suppresses toast for known-benign errors (BackendUnavailableError)', async () => {
    mockApiGet.mockRejectedValueOnce(new (BackendUnavailableError as new () => Error)())
    const deps = makeDeps()
    await loadDashboardData(false, deps)
    expect(deps.showToast).not.toHaveBeenCalled()
    // fallback to demo cards since prev is empty
    const updater = deps.setLocalCards.mock.calls[0][0]
    const cards = applyUpdater(updater, [])
    expect(cards.map(c => c.id)).toEqual(['demo-1'])
  })

  it('preserves existing localCards on error path (does not overwrite)', async () => {
    mockApiGet.mockRejectedValueOnce(new (BackendUnavailableError as new () => Error)())
    const deps = makeDeps()
    await loadDashboardData(false, deps)
    const updater = deps.setLocalCards.mock.calls[0][0]
    const existing = [makeCard({ id: 'keep-me' })]
    expect(applyUpdater(updater, existing)).toBe(existing)
  })

  it('shows toast for unexpected errors', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('kaboom'))
    const deps = makeDeps()
    await loadDashboardData(false, deps)
    expect(deps.showToast).toHaveBeenCalledWith('Failed to load dashboard', 'error')
  })
})

// ─── addCardsToBoard ───────────────────────────────────────────────────────

describe('addCardsToBoard', () => {
  const baseDeps = () => ({
    localCards: [] as Card[],
    dashboard: null as DashboardData | null,
    snapshot: vi.fn(),
    setLocalCards: vi.fn(),
    showToast: vi.fn(),
    t: tPass,
    recordCardAdded: vi.fn(),
  })

  it('prepends new cards when insertAtIndex is null (no dashboard → no POST)', async () => {
    const deps = baseDeps()
    deps.localCards = [makeCard({ id: 'existing' })]
    await addCardsToBoard(
      [{ type: 'app_status', title: 'App', visualization: 'donut', config: { foo: 1 } }],
      null,
      deps,
    )
    expect(deps.snapshot).toHaveBeenCalledWith(deps.localCards)
    expect(deps.recordCardAdded).toHaveBeenCalledTimes(1)
    expect(mockEmitCardAdded).toHaveBeenCalledWith('app_status', 'add_modal')
    const result = applyUpdater(deps.setLocalCards.mock.calls[0][0], deps.localCards)
    expect(result[0].card_type).toBe('app_status')
    expect(result[1].id).toBe('existing')
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it('inserts at index when insertAtIndex is provided', async () => {
    const deps = baseDeps()
    const existing = [makeCard({ id: 'a' }), makeCard({ id: 'b' })]
    deps.localCards = existing
    await addCardsToBoard(
      [{ type: 'app_status', title: 't', visualization: 'donut', config: {} }],
      1,
      deps,
    )
    const result = applyUpdater(deps.setLocalCards.mock.calls[0][0], existing)
    expect(result.map(c => c.id)).toEqual(['a', expect.stringMatching(/^new-/), 'b'])
  })

  it('POSTs each new card when a dashboard is set and toasts on failure', async () => {
    const deps = baseDeps()
    deps.dashboard = makeDashboard({ id: 'dash1' })
    mockApiPost.mockRejectedValueOnce(new Error('boom'))
    await addCardsToBoard(
      [{ type: 't1', title: 'X', visualization: 'v', config: {} }],
      null,
      deps,
    )
    expect(mockApiPost).toHaveBeenCalledTimes(1)
    expect(mockApiPost.mock.calls[0][0]).toBe('/api/dashboards/dash1/cards')
    expect(deps.showToast).toHaveBeenCalledWith('Failed to persist card to backend', 'error')
  })
})

// ─── removeCardFromBoard ───────────────────────────────────────────────────
