import { beforeEach, afterEach, vi } from 'vitest'
import { useDashboardCards, type DashboardCard } from '../useDashboardCards'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TEST_STORAGE_KEY = 'test-dashboard-cards'
export const TEST_STORAGE_SCHEMA_KEY = `${TEST_STORAGE_KEY}:schema-version`
export const TEST_COLLAPSED_KEY = `${TEST_STORAGE_KEY}:collapsed`

export const makeCard = (id: string, cardType = 'generic', config: Record<string, unknown> = {}): DashboardCard => ({
  id,
  card_type: cardType,
  config,
})

export const DEFAULT_CARDS: DashboardCard[] = [
  makeCard('card-1', 'cluster_status', { cluster: 'prod' }),
  makeCard('card-2', 'pod_status', { namespace: 'default' }),
]

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

/** Read the cards array that the hook persisted. */
export const readStoredCards = (): DashboardCard[] => {
  const raw = localStorage.getItem(TEST_STORAGE_KEY)
  return raw ? JSON.parse(raw) : []
}

/** Read the collapsed boolean that the hook persisted. */
export const readStoredCollapsed = (): boolean | null => {
  const raw = localStorage.getItem(TEST_COLLAPSED_KEY)
  return raw !== null ? JSON.parse(raw) : null
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  // Provide a stable Date.now for deterministic card IDs.
  vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------

export { useDashboardCards }
export type { DashboardCard }

