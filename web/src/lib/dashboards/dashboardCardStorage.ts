import { safeGetItem, safeRemoveItem, safeSetItem, safeSetJSON } from '../utils/localStorage'

const DASHBOARD_CARD_STORAGE_SCHEMA_VERSION = '1'
const DASHBOARD_CARD_STORAGE_VERSION_SUFFIX = ':schema-version'
const MIN_GRID_SPAN = 1
const MIN_GRID_COORDINATE = 0

interface DashboardCardStoragePosition {
  x?: number
  y?: number
  w?: number
  h?: number
}

export interface DashboardCardStorageEntry {
  id: string
  card_type: string
  config: Record<string, unknown>
  title?: string
  position?: DashboardCardStoragePosition
}

interface LoadDashboardCardStorageOptions {
  requirePosition?: boolean
  requireGridCoordinates?: boolean
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidGridSpan(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_GRID_SPAN
}

function isValidGridCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_GRID_COORDINATE
}

function isValidPosition(
  value: unknown,
  { requireGridCoordinates = false }: Pick<LoadDashboardCardStorageOptions, 'requireGridCoordinates'>,
): value is DashboardCardStoragePosition {
  if (!isPlainObject(value)) return false
  if (!isValidGridSpan(value.w) || !isValidGridSpan(value.h)) return false
  if (!requireGridCoordinates) return true
  return isValidGridCoordinate(value.x) && isValidGridCoordinate(value.y)
}

function isValidDashboardCard(
  value: unknown,
  { requirePosition = false, requireGridCoordinates = false }: LoadDashboardCardStorageOptions,
): value is DashboardCardStorageEntry {
  if (!isPlainObject(value)) return false
  if (typeof value.id !== 'string' || value.id.length === 0) return false
  if (typeof value.card_type !== 'string' || value.card_type.length === 0) return false
  if (!isPlainObject(value.config)) return false
  if (value.title !== undefined && typeof value.title !== 'string') return false
  if (value.position === undefined) return !requirePosition
  return isValidPosition(value.position, { requireGridCoordinates })
}

export function getDashboardCardStorageVersionKey(storageKey: string): string {
  return `${storageKey}${DASHBOARD_CARD_STORAGE_VERSION_SUFFIX}`
}

export function clearDashboardCardStorage(storageKey: string): void {
  safeRemoveItem(storageKey)
  safeRemoveItem(getDashboardCardStorageVersionKey(storageKey))
}

export function loadDashboardCardsFromStorage<T extends DashboardCardStorageEntry>(
  storageKey: string,
  fallbackCards: T[],
  options: LoadDashboardCardStorageOptions = {},
): T[] {
  const storedValue = safeGetItem(storageKey)
  if (storedValue === null) return fallbackCards

  let storedCards: unknown
  try {
    storedCards = JSON.parse(storedValue)
  } catch {
    clearDashboardCardStorage(storageKey)
    return fallbackCards
  }

  const storedVersion = safeGetItem(getDashboardCardStorageVersionKey(storageKey))
  if (storedVersion !== null && storedVersion !== DASHBOARD_CARD_STORAGE_SCHEMA_VERSION) {
    clearDashboardCardStorage(storageKey)
    return fallbackCards
  }

  if (!Array.isArray(storedCards)) {
    clearDashboardCardStorage(storageKey)
    return fallbackCards
  }

  const isValid = storedCards.every(card => isValidDashboardCard(card, options))
  if (!isValid) {
    clearDashboardCardStorage(storageKey)
    return fallbackCards
  }

  return storedCards as T[]
}

export function saveDashboardCardsToStorage<T extends DashboardCardStorageEntry>(storageKey: string, cards: T[]): void {
  const didSaveCards = safeSetJSON(storageKey, cards)
  if (didSaveCards) {
    safeSetItem(getDashboardCardStorageVersionKey(storageKey), DASHBOARD_CARD_STORAGE_SCHEMA_VERSION)
  }
}
