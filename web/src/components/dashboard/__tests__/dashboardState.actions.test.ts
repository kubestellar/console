import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ─── Mocks (hoisted; must sit above SUT import) ─────────────────────────────

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('../../../lib/api', () => {
  class MockBackendUnavailableError extends Error {
    constructor(msg = 'backend unavailable') { super(msg); this.name = 'BackendUnavailableError' }
  }
  class MockUnauthenticatedError extends Error {
    constructor(msg = 'unauthenticated') { super(msg); this.name = 'UnauthenticatedError' }
  }
  return {
    api: {
      get: (...a: unknown[]) => mockApiGet(...a),
      post: (...a: unknown[]) => mockApiPost(...a),
      put: (...a: unknown[]) => mockApiPut(...a),
      delete: (...a: unknown[]) => mockApiDelete(...a),
    },
    BackendUnavailableError: MockBackendUnavailableError,
    UnauthenticatedError: MockUnauthenticatedError,
  }
})

const mockEmitCardAdded = vi.fn()
const mockEmitCardRemoved = vi.fn()
const mockEmitCardConfigured = vi.fn()
vi.mock('../../../lib/analytics', () => ({
  emitCardAdded: (...a: unknown[]) => mockEmitCardAdded(...a),
  emitCardRemoved: (...a: unknown[]) => mockEmitCardRemoved(...a),
  emitCardConfigured: (...a: unknown[]) => mockEmitCardConfigured(...a),
}))

const mockSafeRevokeObjectURL = vi.fn()
vi.mock('../../../lib/download', () => ({
  safeRevokeObjectURL: (...a: unknown[]) => mockSafeRevokeObjectURL(...a),
}))

const mockSetDashboardCache = vi.fn()
const mockPatchDashboardCache = vi.fn()
vi.mock('../persistence', () => ({
  setDashboardCache: (...a: unknown[]) => mockSetDashboardCache(...a),
  patchDashboardCache: (...a: unknown[]) => mockPatchDashboardCache(...a),
}))

const mockSaveDashboardCardsToStorage = vi.fn()
vi.mock('../../../lib/dashboards/dashboardCardStorage', () => ({
  saveDashboardCardsToStorage: (...a: unknown[]) => mockSaveDashboardCardsToStorage(...a),
}))

// Utils used by actions (kept real for isLocalOnlyCard, getDefaultCardSize) —
// but we mock getDemoCards to a fixed fixture and mapVisualizationToCardType
// to a pass-through so the type map isn't exercised here.
vi.mock('../dashboardUtils', async () => {
  const actual = await vi.importActual<typeof import('../dashboardUtils')>('../dashboardUtils')
  return {
    ...actual,
    getDemoCards: () => [
      { id: 'demo-1', card_type: 'cluster_health', config: {}, position: { x: 0, y: 0, w: 4, h: 2 } },
    ],
    mapVisualizationToCardType: (visualization: string, type: string) => type || visualization,
    getDefaultCardSize: () => ({ w: 4, h: 2 }),
  }
})

// ─── SUT ────────────────────────────────────────────────────────────────────

import { BackendUnavailableError } from '../../../lib/api'
import {
  loadDashboardData,
  persistLocalCards,
  addCardsToBoard,
  removeCardFromBoard,
  updateCardWidth,
  updateCardHeight,
  updateCardConfig,
  addRecommendedCard,
  addCardFromAI,
  applyDashboardTemplate,
  addSingleCard,
  confirmDeployAction,
  exportDashboardAsFile,
  moveCardToDashboardAction,
  moveCardToNewDashboardAction,
} from '../dashboardState.actions'
import type { Card, DashboardData } from '../dashboardUtils'
import type { DashboardTemplate } from '../templates'
import type { TFunction } from 'i18next'

// ─── Test helpers ──────────────────────────────────────────────────────────

const tPass: TFunction = ((key: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
  // Support both (key, fallback, opts) and (key, opts) signatures.
  let template = ''
  let vars: Record<string, unknown> | undefined
  if (typeof fallback === 'string') {
    template = fallback
    vars = opts
  } else {
    template = key
    vars = fallback
  }
  if (vars) {
    return template.replace(/\{\{(\w+)\}\}/g, (_m, name) =>
      vars![name] !== undefined ? String(vars![name]) : `{{${name}}}`)
  }
  return template
}) as unknown as TFunction

function makeCard(over: Partial<Card> = {}): Card {
  return {
    id: over.id ?? 'c1',
    card_type: over.card_type ?? 'cluster_health',
    config: over.config ?? {},
    position: over.position ?? { x: 0, y: 0, w: 4, h: 2 },
    title: over.title,
  }
}

function makeDashboard(over: Partial<DashboardData> = {}): DashboardData {
  return {
    id: over.id ?? 'd1',
    name: over.name ?? 'Main',
    is_default: over.is_default,
    cards: over.cards ?? [],
  }
}

/** Apply a setLocalCards reducer given the current array. */
function applyUpdater(fn: unknown, prev: Card[]): Card[] {
  if (typeof fn === 'function') return (fn as (p: Card[]) => Card[])(prev)
  return fn as Card[]
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── persistLocalCards ─────────────────────────────────────────────────────

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

describe('confirmDeployAction', () => {
  const basePending = {
    workloadName: 'nginx',
    namespace: 'default',
    sourceCluster: 'src',
    targetClusters: ['t1', 't2'],
    groupName: 'g1',
  }

  it('publishes deploy:started then deploy:result on success', async () => {
    const publish = vi.fn()
    const deployWorkload = vi.fn(async (_args, cb) => {
      cb.onSuccess({
        success: true,
        message: 'ok',
        deployedTo: ['t1', 't2'],
      })
    })
    await confirmDeployAction({
      pendingDeploy: basePending,
      deployWorkload,
      publishCardEvent: publish,
      showToast: vi.fn(),
      t: tPass,
    })
    expect(publish).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'deploy:started' }))
    expect(publish).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'deploy:result',
      payload: expect.objectContaining({ success: true, message: 'ok', deployedTo: ['t1', 't2'] }),
    }))
    // Both events share the same deploy id
    expect(publish.mock.calls[0][0].payload.id).toBe(publish.mock.calls[1][0].payload.id)
  })

  it('defaults success=true when onSuccess payload omits it', async () => {
    const publish = vi.fn()
    const deployWorkload = vi.fn(async (_args, cb) => { cb.onSuccess({}) })
    await confirmDeployAction({
      pendingDeploy: basePending,
      deployWorkload,
      publishCardEvent: publish,
      showToast: vi.fn(),
      t: tPass,
    })
    expect(publish.mock.calls[1][0].payload).toMatchObject({ success: true, message: '' })
  })

  it('shows an error toast when deployWorkload throws', async () => {
    const publish = vi.fn()
    const showToast = vi.fn()
    const deployWorkload = vi.fn(async () => { throw new Error('unreachable') })
    await confirmDeployAction({
      pendingDeploy: basePending,
      deployWorkload,
      publishCardEvent: publish,
      showToast,
      t: tPass,
    })
    // deploy:started still fired before the throw
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'deploy:started' }))
    // deploy:result never fired
    expect(publish).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'deploy:result' }))
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('unreachable'), 'error')
  })
})

// ─── exportDashboardAsFile ─────────────────────────────────────────────────

describe('exportDashboardAsFile', () => {
  let clickSpy: ReturnType<typeof vi.fn>
  let origCreateObjectURL: typeof URL.createObjectURL
  let origCreateElement: typeof document.createElement
  let capturedDownload: string

  beforeEach(() => {
    clickSpy = vi.fn()
    capturedDownload = ''
    origCreateObjectURL = URL.createObjectURL
    origCreateElement = document.createElement.bind(document)
    URL.createObjectURL = vi.fn(() => 'blob:mock-url') as unknown as typeof URL.createObjectURL
    document.createElement = ((tag: string) => {
      if (tag === 'a') {
        const anchor = { href: '', click: clickSpy } as unknown as HTMLAnchorElement & { download: string }
        Object.defineProperty(anchor, 'download', {
          set(v: string) { capturedDownload = v },
          get() { return capturedDownload },
          configurable: true,
        })
        return anchor
      }
      return origCreateElement(tag)
    }) as typeof document.createElement
  })

  afterEach(() => {
    URL.createObjectURL = origCreateObjectURL
    document.createElement = origCreateElement
  })

  it('serialises data, clicks download link, and shows success toast', async () => {
    const showToast = vi.fn()
    const exportDashboard = vi.fn(async () => ({ id: 'd1', name: 'My Dash' }))
    await exportDashboardAsFile('d1', 'My Cool Dashboard', exportDashboard, showToast, tPass)
    expect(exportDashboard).toHaveBeenCalledWith('d1')
    expect(clickSpy).toHaveBeenCalled()
    expect(mockSafeRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    expect(showToast).toHaveBeenCalledWith('Dashboard exported', 'success')
  })

  it('sanitises the filename (spaces → dashes, lowercased)', async () => {
    const showToast = vi.fn()
    const exportDashboard = vi.fn(async () => ({ ok: true }))
    await exportDashboardAsFile('d1', 'My  Cool DASH', exportDashboard, showToast, tPass)
    expect(capturedDownload).toBe('my-cool-dash.json')
  })

  it('falls back to "dashboard" when name is empty', async () => {
    const showToast = vi.fn()
    const exportDashboard = vi.fn(async () => ({}))
    await exportDashboardAsFile('d1', '', exportDashboard, showToast, tPass)
    expect(capturedDownload).toBe('dashboard.json')
  })

  it('shows error toast when exportDashboard throws', async () => {
    const showToast = vi.fn()
    const exportDashboard = vi.fn(async () => { throw new Error('boom') })
    await exportDashboardAsFile('d1', 'X', exportDashboard, showToast, tPass)
    expect(showToast).toHaveBeenCalledWith('Failed to export dashboard', 'error')
  })
})

// ─── moveCardToDashboardAction / moveCardToNewDashboardAction ─────────────

describe('moveCardToDashboardAction', () => {
  const baseDeps = () => ({
    moveCardToDashboard: vi.fn(async () => {}),
    createDashboard: vi.fn(async () => ({ id: 'new1', name: 'New' })),
    snapshot: vi.fn(),
    localCards: [makeCard({ id: 'a' }), makeCard({ id: 'b' })],
    setLocalCards: vi.fn(),
    showToast: vi.fn(),
    t: tPass,
  })

  it('moves the card, removes it locally, and shows success toast', async () => {
    const deps = baseDeps()
    await moveCardToDashboardAction('a', 'target-dash', 'Target', deps)
    expect(deps.moveCardToDashboard).toHaveBeenCalledWith('a', 'target-dash')
    expect(deps.snapshot).toHaveBeenCalledWith(deps.localCards)
    const result = applyUpdater(deps.setLocalCards.mock.calls[0][0], deps.localCards)
    expect(result.map(c => c.id)).toEqual(['b'])
    expect(deps.showToast).toHaveBeenCalledWith('Card moved to "Target"', 'success')
  })

  it('shows failure toast and does not mutate on error', async () => {
    const deps = baseDeps()
    deps.moveCardToDashboard = vi.fn(async () => { throw new Error('nope') })
    await moveCardToDashboardAction('a', 'target-dash', 'Target', deps)
    expect(deps.setLocalCards).not.toHaveBeenCalled()
    expect(deps.showToast).toHaveBeenCalledWith('Failed to move card', 'error')
  })
})

describe('moveCardToNewDashboardAction', () => {
  const baseDeps = () => ({
    moveCardToDashboard: vi.fn(async () => {}),
    createDashboard: vi.fn(async () => ({ id: 'new1', name: 'Shiny' })),
    snapshot: vi.fn(),
    localCards: [makeCard({ id: 'a' })],
    setLocalCards: vi.fn(),
    showToast: vi.fn(),
    t: tPass,
  })

  it('creates a new dashboard, moves card, removes locally, toasts', async () => {
    const deps = baseDeps()
    await moveCardToNewDashboardAction('a', deps)
    expect(deps.createDashboard).toHaveBeenCalledWith('New Dashboard')
    expect(deps.moveCardToDashboard).toHaveBeenCalledWith('a', 'new1')
    const result = applyUpdater(deps.setLocalCards.mock.calls[0][0], deps.localCards)
    expect(result).toEqual([])
    expect(deps.showToast).toHaveBeenCalledWith('Card moved to "Shiny"', 'success')
  })

  it('no-ops when createDashboard returns no id', async () => {
    const deps = baseDeps()
    deps.createDashboard = vi.fn(async () => undefined)
    await moveCardToNewDashboardAction('a', deps)
    expect(deps.moveCardToDashboard).not.toHaveBeenCalled()
    expect(deps.setLocalCards).not.toHaveBeenCalled()
    expect(deps.showToast).not.toHaveBeenCalled()
  })

  it('toasts failure when createDashboard throws', async () => {
    const deps = baseDeps()
    deps.createDashboard = vi.fn(async () => { throw new Error('nope') })
    await moveCardToNewDashboardAction('a', deps)
    expect(deps.showToast).toHaveBeenCalledWith('Failed to create dashboard', 'error')
  })
})
