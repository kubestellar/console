import { beforeEach, afterEach, vi } from 'vitest'
export const mockFullSync = vi.fn<(key: string) => Promise<import('../types').DashboardCard[] | null>>()
export const mockSaveCards = vi.fn()
export const mockIsAuthenticated = vi.fn(() => false)
export const mockClearCache = vi.fn()

vi.mock('../dashboardSync', () => ({
  dashboardSync: {
    fullSync: (...args: unknown[]) => mockFullSync(args[0] as string),
    saveCards: (...args: unknown[]) => mockSaveCards(...args),
    isAuthenticated: () => mockIsAuthenticated(),
    clearCache: () => mockClearCache(),
  },
}))

export const mockSetAutoRefreshPaused = vi.fn()
vi.mock('../../cache', () => ({
  setAutoRefreshPaused: (...args: unknown[]) => mockSetAutoRefreshPaused(...args),
}))

// Allow all card types through the prune filter so synthetic test types
// (card_a, saved_card, x, etc.) are not filtered out during localStorage restore.
vi.mock('../../../config/cards', () => ({
  hasUnifiedConfig: () => true,
}))
vi.mock('../../../components/cards/cardRegistry', () => ({
  isCardTypeRegistered: () => true,
}))

// Mock requestAnimationFrame for undo/redo
vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return 0 })

// ---------------------------------------------------------------------------
// Imports (AFTER mocks)
// ---------------------------------------------------------------------------
import type { DashboardCard, DashboardCardPlacement } from '../types'
export type { DashboardCard, DashboardCardPlacement, NewCardInput } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const STORAGE_KEY = 'test-dashboard-cards'

export const DEFAULT_PLACEMENTS: DashboardCardPlacement[] = [
  { type: 'card_a', position: { w: 4, h: 2 } },
  { type: 'card_b', config: { filter: 'active' }, position: { w: 6, h: 3 } },
  { type: 'card_c', title: 'Custom Title', position: { w: 4, h: 2 } },
]

/** Build a minimal DashboardCard from type and index */
export function makeCard(type: string, index: number): DashboardCard {
  return {
    id: `default-${type}-${index}`,
    card_type: type,
    config: {},
    position: { w: 4, h: 2 },
  }
}

export function expectedDefaultCards(): DashboardCard[] {
  return [
    { id: 'default-card_a-0', card_type: 'card_a', config: {}, title: undefined, position: { w: 4, h: 2 } },
    { id: 'default-card_b-1', card_type: 'card_b', config: { filter: 'active' }, title: undefined, position: { w: 6, h: 3 } },
    { id: 'default-card_c-2', card_type: 'card_c', config: {}, title: 'Custom Title', position: { w: 4, h: 2 } },
  ]
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

// ============================================================================
// useDashboardCards — CRUD, persistence, undo/redo
