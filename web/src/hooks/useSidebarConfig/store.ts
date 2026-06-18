import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants/network'
import { setQuantumWorkloadAvailable } from '../../lib/demoMode'
import { setActiveProject } from '../../lib/project/context'
import { safeGetItem, safeRemoveItem, safeSetItem } from '../../lib/utils/localStorage'
import {
  BUILTIN_NAV_ITEMS,
  BUILTIN_NAV_ITEMS_BY_HREF,
  BUILTIN_NAV_ITEMS_BY_ID,
  DEFAULT_CONFIG,
  DEFAULT_NAV_ITEM_IDS,
  DEFAULT_NAV_ITEM_ID_SET,
  DEFAULT_PRIMARY_NAV,
  DEFAULT_SECONDARY_NAV,
  DEPRECATED_ROUTES,
  DISCOVERABLE_DASHBOARDS,
  ENABLED_DASHBOARDS_STORAGE_KEY,
  OLD_STORAGE_KEY,
  STORAGE_KEY,
  type SidebarConfig,
  type SidebarItem,
} from './constants'

let sharedConfig: SidebarConfig | null = null
let enabledDashboardIds: string[] | null = null
let enabledDashboardsFetched = false
const listeners = new Set<() => void>()

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot(): SidebarConfig | null {
  return sharedConfig
}

function notifyListeners() {
  listeners.forEach(listener => listener())
}

export function getEnabledDashboardIds(): string[] | null {
  return enabledDashboardIds
}

function getRemovedBuiltinItemIds(config: Partial<SidebarConfig>): string[] {
  return Array.isArray(config.removedBuiltinItemIds)
    ? config.removedBuiltinItemIds.filter((id): id is string => typeof id === 'string')
    : []
}

function getBuiltinSidebarItem(item: Pick<SidebarItem, 'id' | 'href' | 'isCustom'>): SidebarItem | undefined {
  if (item.isCustom) return undefined
  return BUILTIN_NAV_ITEMS_BY_ID.get(item.id) ?? BUILTIN_NAV_ITEMS_BY_HREF.get(item.href)
}

function normalizeSidebarItems(items: SidebarItem[] | undefined): SidebarItem[] | undefined {
  return items?.map(item => {
    const builtinItem = getBuiltinSidebarItem(item)
    if (!builtinItem) return item
    return { ...item, id: builtinItem.id, name: builtinItem.name, icon: builtinItem.icon, href: builtinItem.href, type: builtinItem.type, isCustom: false }
  })
}

function getKnownDefaultItemIds(config: Partial<SidebarConfig>): string[] {
  if (Array.isArray(config.knownDefaultItemIds)) {
    return Array.from(new Set(config.knownDefaultItemIds.filter((id): id is string => typeof id === 'string' && DEFAULT_NAV_ITEM_ID_SET.has(id))))
  }

  const knownDefaultItemIds = new Set(getRemovedBuiltinItemIds(config))
  const configuredItems = [
    ...(normalizeSidebarItems(Array.isArray(config.primaryNav) ? config.primaryNav : undefined) ?? []),
    ...(normalizeSidebarItems(Array.isArray(config.secondaryNav) ? config.secondaryNav : undefined) ?? []),
  ]

  configuredItems.forEach(item => {
    const builtinItem = getBuiltinSidebarItem(item)
    if (builtinItem && DEFAULT_NAV_ITEM_ID_SET.has(builtinItem.id)) {
      knownDefaultItemIds.add(builtinItem.id)
    }
  })

  return DEFAULT_NAV_ITEM_IDS.filter(id => knownDefaultItemIds.has(id))
}

function normalizeConfig(config: Partial<SidebarConfig>): SidebarConfig {
  return {
    primaryNav: normalizeSidebarItems(Array.isArray(config.primaryNav) ? config.primaryNav : undefined) ?? DEFAULT_PRIMARY_NAV,
    secondaryNav: normalizeSidebarItems(Array.isArray(config.secondaryNav) ? config.secondaryNav : undefined) ?? DEFAULT_SECONDARY_NAV,
    sections: normalizeSidebarItems(Array.isArray(config.sections) ? config.sections : undefined) ?? [],
    showClusterStatus: config.showClusterStatus ?? true,
    collapsed: config.collapsed ?? false,
    isMobileOpen: config.isMobileOpen ?? false,
    removedBuiltinItemIds: getRemovedBuiltinItemIds(config),
    knownDefaultItemIds: getKnownDefaultItemIds(config),
    width: config.width,
  }
}

export function buildSidebarItem(item: Omit<SidebarItem, 'id' | 'order'>, order: number): SidebarItem {
  const builtinItem = BUILTIN_NAV_ITEMS_BY_HREF.get(item.href)
  if (builtinItem) {
    return { ...builtinItem, name: item.name, icon: item.icon, type: item.type, cardType: item.cardType, description: item.description, order }
  }
  return { ...item, id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, isCustom: true, order }
}

function getPersistedEnabledDashboardIds(): string[] | null {
  const stored = safeGetItem(ENABLED_DASHBOARDS_STORAGE_KEY)
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored)
    const persistedIds = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
    return persistedIds.length > 0 ? persistedIds : null
  } catch {
    safeRemoveItem(ENABLED_DASHBOARDS_STORAGE_KEY)
    return null
  }
}

function persistEnabledDashboardIds(ids: string[] | null) {
  if (!ids || ids.length === 0) {
    safeRemoveItem(ENABLED_DASHBOARDS_STORAGE_KEY)
    return
  }
  safeSetItem(ENABLED_DASHBOARDS_STORAGE_KEY, JSON.stringify(ids))
}

export function applyDashboardFilter(config: SidebarConfig): SidebarConfig {
  if (!enabledDashboardIds) return config
  const removedBuiltinItemIds = new Set(config.removedBuiltinItemIds)
  const enabledSet = new Set(enabledDashboardIds)
  const existingIds = new Set(config.primaryNav.map(item => item.id))
  const promoted = DISCOVERABLE_DASHBOARDS.filter(item => enabledSet.has(item.id) && !existingIds.has(item.id) && !removedBuiltinItemIds.has(item.id))
  const combined = [...config.primaryNav, ...promoted]
  const filtered = combined.filter(item => item.isCustom || enabledSet.has(item.id))
  filtered.sort((a, b) => {
    if (a.isCustom && b.isCustom) return a.order - b.order
    if (a.isCustom) return 1
    if (b.isCustom) return -1
    const idxA = enabledDashboardIds!.indexOf(a.id)
    const idxB = enabledDashboardIds!.indexOf(b.id)
    return idxA - idxB
  })
  return { ...config, primaryNav: filtered.map((item, idx) => ({ ...item, order: idx })) }
}

export async function fetchEnabledDashboards(): Promise<void> {
  if (enabledDashboardsFetched) return
  enabledDashboardsFetched = true
  try {
    const resp = await fetch('/health', { signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
    const data = await resp.json()
    if (data.project && typeof data.project === 'string') setActiveProject(data.project)
    if (data.workloads && typeof data.workloads.quantum_kc_demo_available === 'boolean') {
      setQuantumWorkloadAvailable(data.workloads.quantum_kc_demo_available)
    }
    enabledDashboardIds = Array.isArray(data.enabled_dashboards)
      ? data.enabled_dashboards.filter((id: unknown): id is string => typeof id === 'string')
      : null
    enabledDashboardIds = enabledDashboardIds && enabledDashboardIds.length > 0 ? enabledDashboardIds : null
    persistEnabledDashboardIds(enabledDashboardIds)

    if (sharedConfig) {
      sharedConfig = migrateConfig(sharedConfig)
      if (enabledDashboardIds) sharedConfig = applyDashboardFilter(sharedConfig)
      safeSetItem(STORAGE_KEY, JSON.stringify(sharedConfig))
      notifyListeners()
    }
  } catch {
    // Ignore — show all dashboards if health check fails
  }
}

export function migrateConfig(stored: SidebarConfig): SidebarConfig {
  const normalized = normalizeConfig(stored)
  const primaryNav = normalized.primaryNav.filter(item => !DEPRECATED_ROUTES.includes(item.href))
  const secondaryNav = normalized.secondaryNav.filter(item => !DEPRECATED_ROUTES.includes(item.href))
  const knownDefaultItemIds = new Set(normalized.knownDefaultItemIds)
  const removedBuiltinItemIds = new Set(normalized.removedBuiltinItemIds)
  const hasActiveDashboardFilter = enabledDashboardIds !== null
  const existingHrefs = new Set([...primaryNav.map(item => item.href), ...secondaryNav.map(item => item.href)])

  const missingPrimaryItems = DEFAULT_PRIMARY_NAV.filter(item => {
    if (existingHrefs.has(item.href)) return false
    if (hasActiveDashboardFilter) return !knownDefaultItemIds.has(item.id)
    return !removedBuiltinItemIds.has(item.id)
  })
  const missingSecondaryItems = DEFAULT_SECONDARY_NAV.filter(item => !existingHrefs.has(item.href) && !removedBuiltinItemIds.has(item.id))
  const deprecatedRemoved = primaryNav.length !== normalized.primaryNav.length || secondaryNav.length !== normalized.secondaryNav.length
  const configWasNormalized = normalized.removedBuiltinItemIds.length !== getRemovedBuiltinItemIds(stored).length
    || !Array.isArray(stored.removedBuiltinItemIds)
    || normalized.knownDefaultItemIds.length !== getKnownDefaultItemIds(stored).length
    || !Array.isArray(stored.knownDefaultItemIds)

  if (missingPrimaryItems.length > 0 || missingSecondaryItems.length > 0 || deprecatedRemoved || configWasNormalized) {
    return {
      ...normalized,
      primaryNav: [...primaryNav, ...missingPrimaryItems.map((item, idx) => ({ ...item, order: primaryNav.length + idx }))],
      secondaryNav: [...secondaryNav, ...missingSecondaryItems.map((item, idx) => ({ ...item, order: secondaryNav.length + idx }))],
      knownDefaultItemIds: DEFAULT_NAV_ITEM_IDS,
    }
  }

  return { ...normalized, knownDefaultItemIds: DEFAULT_NAV_ITEM_IDS }
}

export function initSharedConfig(): SidebarConfig {
  if (sharedConfig) return sharedConfig
  enabledDashboardIds = enabledDashboardIds ?? getPersistedEnabledDashboardIds()

  let stored = safeGetItem(STORAGE_KEY)
  if (!stored) {
    const oldStored = safeGetItem(OLD_STORAGE_KEY)
    if (oldStored) {
      stored = oldStored
      safeRemoveItem(OLD_STORAGE_KEY)
    }
  }

  if (stored) {
    try {
      sharedConfig = migrateConfig(JSON.parse(stored))
    } catch {
      sharedConfig = DEFAULT_CONFIG
    }
  } else {
    sharedConfig = DEFAULT_CONFIG
  }

  if (enabledDashboardIds) {
    sharedConfig = applyDashboardFilter(sharedConfig)
  }

  return sharedConfig
}

export function updateSharedConfig(newConfig: SidebarConfig) {
  sharedConfig = { ...newConfig, knownDefaultItemIds: DEFAULT_NAV_ITEM_IDS }
  safeSetItem(STORAGE_KEY, JSON.stringify(sharedConfig))
  notifyListeners()
}
