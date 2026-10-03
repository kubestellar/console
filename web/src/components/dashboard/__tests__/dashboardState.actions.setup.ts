import { beforeEach, vi } from 'vitest'
export const mockApiGet = vi.fn()
export const mockApiPost = vi.fn()
export const mockApiPut = vi.fn()
export const mockApiDelete = vi.fn()

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

export const mockEmitCardAdded = vi.fn()
export const mockEmitCardRemoved = vi.fn()
export const mockEmitCardConfigured = vi.fn()
vi.mock('../../../lib/analytics', () => ({
  emitCardAdded: (...a: unknown[]) => mockEmitCardAdded(...a),
  emitCardRemoved: (...a: unknown[]) => mockEmitCardRemoved(...a),
  emitCardConfigured: (...a: unknown[]) => mockEmitCardConfigured(...a),
}))

export const mockSafeRevokeObjectURL = vi.fn()
vi.mock('../../../lib/download', () => ({
  safeRevokeObjectURL: (...a: unknown[]) => mockSafeRevokeObjectURL(...a),
}))

export const mockSetDashboardCache = vi.fn()
export const mockPatchDashboardCache = vi.fn()
vi.mock('../persistence', () => ({
  setDashboardCache: (...a: unknown[]) => mockSetDashboardCache(...a),
  patchDashboardCache: (...a: unknown[]) => mockPatchDashboardCache(...a),
}))

export const mockSaveDashboardCardsToStorage = vi.fn()
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
import type { Card, DashboardData } from '../dashboardUtils'
export type { Card, DashboardData } from '../dashboardUtils'
export type { DashboardTemplate } from '../templates'
import type { TFunction } from 'i18next'

// ─── Test helpers ──────────────────────────────────────────────────────────

export const tPass: TFunction = ((key: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
  // Support both (key, fallback, opts) and (key, opts) signatures.
  let template: string
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

export function makeCard(over: Partial<Card> = {}): Card {
  return {
    id: over.id ?? 'c1',
    card_type: over.card_type ?? 'cluster_health',
    config: over.config ?? {},
    position: over.position ?? { x: 0, y: 0, w: 4, h: 2 },
    title: over.title,
  }
}

export function makeDashboard(over: Partial<DashboardData> = {}): DashboardData {
  return {
    id: over.id ?? 'd1',
    name: over.name ?? 'Main',
    is_default: over.is_default,
    cards: over.cards ?? [],
  }
}

/** Apply a setLocalCards reducer given the current array. */
export function applyUpdater(fn: unknown, prev: Card[]): Card[] {
  if (typeof fn === 'function') return (fn as (p: Card[]) => Card[])(prev)
  return fn as Card[]
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── persistLocalCards ─────────────────────────────────────────────────────
