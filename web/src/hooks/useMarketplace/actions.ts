import { useEffect, useRef, useSyncExternalStore } from 'react'
import { api } from '../../lib/api'
import { addCustomTheme, removeCustomTheme } from '../../lib/themes'
import { emitMarketplaceInstall, emitMarketplaceRemove, emitMarketplaceInstallFailed } from '../../lib/analytics'
import { FETCH_EXTERNAL_TIMEOUT_MS } from '../../lib/constants/network'
import { isCardTypeRegistered } from '../../components/cards/cardRegistry'
import { getDefaultCardSize } from '../../components/dashboard/dashboardUtils'
import { verifyIntegrity, IntegrityError, MissingIntegrityError } from './integrity'
import type {
  DashboardSummary,
  InstallResult,
  InstalledEntry,
  InstalledMap,
  MarketplaceItem,
  MarketplaceItemStatus,
  MarketplaceRegistry,
} from './types'

const INSTALLED_KEY = 'kc-marketplace-installed'

interface TrustedMarketplaceDownloadSource {
  origin: string
  pathnamePrefix: string
}

const TRUSTED_MARKETPLACE_DOWNLOAD_SOURCES: ReadonlyArray<TrustedMarketplaceDownloadSource> = [
  { origin: 'https://raw.githubusercontent.com', pathnamePrefix: '/kubestellar/' },
  { origin: 'https://github.com', pathnamePrefix: '/kubestellar/' },
]

const MARKETPLACE_TO_CARD_TYPE: Record<string, string> = {
  'cncf-karmada': 'karmada_status',
  'cncf-keda': 'keda_status',
  'cncf-etcd': 'etcd_status',
  'cncf-fluentd': 'fluentd_status',
  'cncf-crio': 'crio_status',
  'cncf-backstage': 'backstage_status',
  'cncf-cloud-custodian': 'cloud_custodian_status',
  'cncf-containerd': 'containerd_status',
  'cncf-cortex': 'cortex_status',
  'cncf-dragonfly': 'dragonfly_status',
  'cncf-cloudevents': 'cloudevents_status',
  'cncf-crossplane': 'crossplane_managed_resources',
  'cncf-buildpacks': 'buildpacks_status',
  'cncf-kubevirt': 'kubevirt_status',
  'cncf-kubevela': 'kubevela_status',
  'cncf-lima': 'lima_status',
  'cncf-flux': 'flux_status',
  'cncf-contour': 'contour_status',
  'cncf-dapr': 'dapr_status',
  'cncf-envoy': 'envoy_status',
  'cncf-flatcar': 'flatcar_status',
  'cncf-grpc': 'grpc_status',
  'cncf-kserve': 'kserve_status',
  'cncf-linkerd': 'linkerd_status',
  'cncf-longhorn': 'longhorn_status',
  'cncf-openfeature': 'openfeature_status',
  'cncf-openfga': 'openfga_status',
  'cncf-rook': 'rook_status',
  'cncf-spiffe': 'spiffe_status',
  'cncf-cni': 'cni_status',
  'cncf-spire': 'spire_status',
  'cncf-strimzi': 'strimzi_status',
  'cncf-thanos': 'thanos_status',
  'cncf-opentelemetry': 'otel_status',
  'cncf-tikv': 'tikv_status',
  'cncf-tuf': 'tuf_status',
  'cncf-vitess': 'vitess_status',
  'cncf-chaos-mesh': 'chaos_mesh_status',
  'cncf-wasmcloud': 'wasmcloud_status',
  'cncf-volcano': 'volcano_status',
}

function reconcileImplementedCards(items: MarketplaceItem[]): MarketplaceItem[] {
  return items.map(item => {
    if (item.status !== 'help-wanted') return item
    const cardType = MARKETPLACE_TO_CARD_TYPE[item.id]
    if (!cardType || !isCardTypeRegistered(cardType)) return item
    return {
      ...item,
      status: 'available' as MarketplaceItemStatus,
      tags: item.tags.filter(tag => tag !== 'help-wanted'),
    }
  })
}

export function mergeRegistryItems(registry: MarketplaceRegistry): MarketplaceItem[] {
  return reconcileImplementedCards([...(registry.items || []), ...(registry.presets || [])])
}

function loadInstalled(): InstalledMap {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(INSTALLED_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveInstalled(map: InstalledMap): void {
  try {
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(map))
  } catch {
    // Non-critical
  }
}

let installedSnapshot = loadInstalled()
const installedListeners = new Set<() => void>()
const emptyInstalledMap: InstalledMap = {}

function subscribeInstalled(cb: () => void) {
  installedListeners.add(cb)
  return () => { installedListeners.delete(cb) }
}

function getInstalledSnapshot(): InstalledMap {
  return installedSnapshot
}

function notifyInstalledChange() {
  installedSnapshot = loadInstalled()
  installedListeners.forEach(cb => cb())
}

function handleStorageForMarketplace(e: StorageEvent) {
  if (e.key === INSTALLED_KEY) notifyInstalledChange()
}

if (typeof window !== 'undefined') {
  window.removeEventListener('storage', handleStorageForMarketplace)
  window.addEventListener('storage', handleStorageForMarketplace)
}

function markInstalled(itemId: string, entry: InstalledEntry) {
  const next = { ...installedSnapshot, [itemId]: entry }
  saveInstalled(next)
  notifyInstalledChange()
}

function markUninstalled(itemId: string) {
  const next = { ...installedSnapshot }
  delete next[itemId]
  saveInstalled(next)
  notifyInstalledChange()
}

class MarketplaceDownloadOriginError extends Error {
  constructor(downloadUrl: string) {
    super(`Marketplace download URL is not allowed: ${downloadUrl}`)
    this.name = 'MarketplaceDownloadOriginError'
  }
}

function assertTrustedMarketplaceDownloadUrl(downloadUrl: string): void {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(downloadUrl)
  } catch {
    throw new MarketplaceDownloadOriginError(downloadUrl)
  }

  const isTrustedSource = TRUSTED_MARKETPLACE_DOWNLOAD_SOURCES.some(source => (
    parsedUrl.origin === source.origin && parsedUrl.pathname.startsWith(source.pathnamePrefix)
  ))

  if (!isTrustedSource) {
    throw new MarketplaceDownloadOriginError(downloadUrl)
  }
}

export function useInstalledMarketplaceItems(): InstalledMap {
  return useSyncExternalStore(subscribeInstalled, getInstalledSnapshot, () => emptyInstalledMap)
}

export function useReconcileInstalledDashboards(installedItems: InstalledMap) {
  const reconcileRef = useRef(false)

  useEffect(() => {
    if (reconcileRef.current) return
    reconcileRef.current = true

    const dashboardEntries = (Object.entries(installedItems) as [string, InstalledEntry][]).filter(
      ([, entry]) => entry.type === 'dashboard' && entry.dashboardId
    )
    if (dashboardEntries.length === 0) return

    api.get<{ id: string }[]>('/api/dashboards').then(({ data: dashboards }) => {
      const ids = new Set((dashboards || []).map(dashboard => dashboard.id))
      let changed = false
      for (const [itemId, entry] of dashboardEntries) {
        if (entry.dashboardId && !ids.has(entry.dashboardId)) {
          markUninstalled(itemId)
          changed = true
        }
      }
      if (changed) notifyInstalledChange()
    }).catch(() => { /* reconciliation is best-effort */ })
  }, [installedItems])
}

export function useMarketplaceActions(installedItems: InstalledMap) {
  const isInstalled = (itemId: string): boolean => itemId in installedItems

  const getInstalledDashboardId = (itemId: string): string | undefined => installedItems[itemId]?.dashboardId

  const installItem = async (item: MarketplaceItem): Promise<InstallResult> => {
    try {
      assertTrustedMarketplaceDownloadUrl(item.downloadUrl)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'download URL validation failed'
      emitMarketplaceInstallFailed(item.type, item.name, message, 'download')
      throw error
    }

    if (!item.sha256?.trim()) {
      const error = new MissingIntegrityError()
      emitMarketplaceInstallFailed(item.type, item.name, error.message, 'integrity')
      throw error
    }

    let response: Response
    try {
      response = await fetch(item.downloadUrl, {
        signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'network error'
      emitMarketplaceInstallFailed(item.type, item.name, message, 'download')
      throw error
    }
    if (!response.ok) {
      emitMarketplaceInstallFailed(item.type, item.name, `HTTP ${response.status}`, 'http_error')
      throw new Error(`Download failed: ${response.status}`)
    }
    const rawText = await response.text()

    try {
      await verifyIntegrity(rawText, item.sha256)
    } catch (error: unknown) {
      const message = error instanceof IntegrityError || error instanceof MissingIntegrityError
        ? error.message
        : 'integrity verification failed'
      emitMarketplaceInstallFailed(item.type, item.name, message, 'integrity')
      throw error
    }

    const json = JSON.parse(rawText)

    if (item.type === 'card-preset') {
      const { card_type, config, title } = json as {
        card_type?: string
        config?: Record<string, unknown>
        title?: string
      }
      if (!card_type) {
        const message = 'card-preset payload missing card_type'
        emitMarketplaceInstallFailed(item.type, item.name, message, 'parse')
        throw new Error(message)
      }

      const size = getDefaultCardSize(card_type)
      const newCard = {
        id: `mp-${Date.now()}`,
        card_type,
        config: config || {},
        title,
        position: { x: 0, y: 0, ...size },
      }

      try {
        const { data: dashboards } = await api.get<DashboardSummary[]>('/api/dashboards')
        const target = (dashboards || []).find(dashboard => dashboard.is_default) || (dashboards || [])[0]
        if (!target?.id) {
          throw new Error('no dashboard available to install card-preset into')
        }
        await api.post(`/api/dashboards/${target.id}/cards`, newCard)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'backend persist failed'
        emitMarketplaceInstallFailed(item.type, item.name, message, 'persist')
        throw error
      }

      window.dispatchEvent(new CustomEvent('kc-add-card-from-marketplace', { detail: json }))
      markInstalled(item.id, { installedAt: new Date().toISOString(), type: 'card-preset' })
      emitMarketplaceInstall(item.type, item.name)
      return { type: 'card-preset', data: json }
    }

    if (item.type === 'theme') {
      addCustomTheme(json)
      window.dispatchEvent(new Event('kc-custom-themes-changed'))
      markInstalled(item.id, { installedAt: new Date().toISOString(), type: 'theme' })
      emitMarketplaceInstall(item.type, item.name)
      return { type: 'theme', data: json }
    }

    const { data } = await api.post<{ id: string }>('/api/dashboards/import', json)
    markInstalled(item.id, {
      dashboardId: data?.id,
      installedAt: new Date().toISOString(),
      type: 'dashboard',
    })
    emitMarketplaceInstall(item.type, item.name)
    return { type: 'dashboard', data }
  }

  const removeItem = async (item: MarketplaceItem) => {
    const entry = installedItems[item.id]
    if (!entry) return

    if (entry.type === 'dashboard' && entry.dashboardId) {
      try {
        await api.delete(`/api/dashboards/${entry.dashboardId}`)
      } catch (error: unknown) {
        const is404 = error instanceof Error && error.message.includes('404')
        if (!is404) throw error
      }
    }

    if (entry.type === 'theme') {
      removeCustomTheme(item.id)
      window.dispatchEvent(new Event('kc-custom-themes-changed'))
    }

    markUninstalled(item.id)
    emitMarketplaceRemove(item.type)
  }

  return {
    getInstalledDashboardId,
    installItem,
    isInstalled,
    removeItem,
  }
}
