/**
 * wasmCloud Status Card
 *
 * wasmCloud is a CNCF incubating project for building distributed
 * applications on WebAssembly. This card surfaces the lattice id, host
 * count, actor and capability-provider counts, and active link definitions
 * — the primary operational signals from a wasmCloud control interface.
 *
 * Follows the spiffe_status / linkerd_status pattern for structure and styling.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real wasmCloud control bridge lands (`/api/wasmcloud/status`), the hook's
 * fetcher will pick up live data automatically with no component changes.
 */

import {
  AlertTriangle,
  Box,
  CheckCircle,
  Cpu,
  Link2,
  Package,
  RefreshCw,
  Server,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedWasmcloud } from '../../../hooks/useCachedWasmcloud'
import type {
  WasmcloudHost,
  WasmcloudLink,
  WasmcloudLinkStatus,
  WasmcloudProvider,
  WasmcloudProviderStatus,
} from './demoData'
import { formatTimeAgo } from '../../../lib/formatters'
import { formatDuration } from '../../../lib/stats/types'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const SKELETON_TITLE_WIDTH = 140
const SKELETON_TITLE_HEIGHT = 28
const SKELETON_BADGE_WIDTH = 90
const SKELETON_BADGE_HEIGHT = 20
const SKELETON_LIST_ITEMS = 5

const MAX_HOSTS_DISPLAYED = 5
const MAX_PROVIDERS_DISPLAYED = 5
const MAX_LINKS_DISPLAYED = 6

const HOST_ID_SHORT_LENGTH = 8

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortId(id: string): string {
  if (!id) return ''
  return id.length <= HOST_ID_SHORT_LENGTH ? id : `${id.slice(0, HOST_ID_SHORT_LENGTH)}…`
}

const HOST_STATUS_CLASS: Record<WasmcloudHost['status'], string> = {
  ready: 'bg-green-500/20 text-green-400',
  starting: 'bg-yellow-500/20 text-yellow-400',
  unreachable: 'bg-red-500/20 text-red-400',
}

const PROVIDER_STATUS_CLASS: Record<WasmcloudProviderStatus, string> = {
  running: 'bg-green-500/20 text-green-400',
  starting: 'bg-yellow-500/20 text-yellow-400',
  failed: 'bg-red-500/20 text-red-400',
}

const LINK_STATUS_CLASS: Record<WasmcloudLinkStatus, string> = {
  active: 'bg-green-500/20 text-green-400',
  pending: 'bg-yellow-500/20 text-yellow-400',
  failed: 'bg-red-500/20 text-red-400',
}

// ---------------------------------------------------------------------------
// Subsections
// ---------------------------------------------------------------------------

function HostRow({ host, t }: { host: WasmcloudHost; t: TFunction<'cards'> }) {
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-medium text-foreground truncate">
            {host.friendlyName}
          </span>
          <span className="text-[11px] text-muted-foreground font-mono shrink-0">
            {shortId(host.hostId)}
          </span>
        </div>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${HOST_STATUS_CLASS[host.status]}`}
        >
          {host.status}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span>
          {host.actorCount} {t('wasmcloudStatus.actorsShort', 'actors')}
        </span>
        <span>
          {host.providerCount} {t('wasmcloudStatus.providersShort', 'providers')}
        </span>
        <span className="ml-auto shrink-0 font-mono">
          {t('wasmcloudStatus.uptime', 'up')} {formatDuration(host.uptimeSeconds)}
        </span>
      </div>
    </div>
  )
}

function ProviderRow({ provider }: { provider: WasmcloudProvider }) {
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-medium text-foreground truncate">
            {provider.name}
          </span>
        </div>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${PROVIDER_STATUS_CLASS[provider.status]}`}
        >
          {provider.status}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground truncate font-mono">
        {provider.contractId}
      </div>
    </div>
  )
}

function LinkRow({ link }: { link: WasmcloudLink }) {
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-[11px] font-mono text-foreground truncate">
            {shortId(link.actorId)} → {shortId(link.providerId)}
          </span>
        </div>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${LINK_STATUS_CLASS[link.status]}`}
        >
          {link.status}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground truncate font-mono">
        {link.contractId}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WasmcloudStatus() {
  const { t } = useTranslation('cards')
  const { data, isRefreshing, error, showSkeleton, showEmptyState } = useCachedWasmcloud()

  const isHealthy = data.health === 'healthy'
  const hosts = data.hosts ?? []
  const providers = data.providers ?? []
  const links = data.links ?? []
  const displayedHosts = hosts.slice(0, MAX_HOSTS_DISPLAYED)
  const displayedProviders = providers.slice(0, MAX_PROVIDERS_DISPLAYED)
  const displayedLinks = links.slice(0, MAX_LINKS_DISPLAYED)

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <Skeleton variant="rounded" width={SKELETON_TITLE_WIDTH} height={SKELETON_TITLE_HEIGHT} />
          <Skeleton variant="rounded" width={SKELETON_BADGE_WIDTH} height={SKELETON_BADGE_HEIGHT} />
        </div>
        <SkeletonStats className="grid-cols-2 @md:grid-cols-4" />
        <SkeletonList items={SKELETON_LIST_ITEMS} className="flex-1" />
      </div>
    )
  }

  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">
          {t('wasmcloudStatus.fetchError', 'Unable to fetch wasmCloud status')}
        </p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Box className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('wasmcloudStatus.notInstalled', 'wasmCloud not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'wasmcloudStatus.notInstalledHint',
            'No wasmCloud lattice reachable from the connected clusters.',
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* Header — health pill + freshness */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            isHealthy
              ? 'bg-green-500/15 text-green-400'
              : 'bg-yellow-500/15 text-yellow-400'
          }`}
        >
          {isHealthy ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {isHealthy
            ? t('wasmcloudStatus.healthy', 'Healthy')
            : t('wasmcloudStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatTimeAgo(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('wasmcloudStatus.hosts', 'Hosts')}
          value={`${data.stats.hostCount}`}
          colorClass="text-cyan-400"
          icon={<Server className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('wasmcloudStatus.actors', 'Actors')}
          value={`${data.stats.actorCount}`}
          colorClass="text-purple-400"
          icon={<Cpu className="w-4 h-4 text-purple-400" />}
        />
        <MetricTile
          label={t('wasmcloudStatus.providers', 'Providers')}
          value={`${data.stats.providerCount}`}
          colorClass="text-green-400"
          icon={<Package className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('wasmcloudStatus.links', 'Links')}
          value={`${data.stats.linkCount}`}
          colorClass="text-yellow-400"
          icon={<Link2 className="w-4 h-4 text-yellow-400" />}
        />
      </div>

      {/* Lattice + lists */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('wasmcloudStatus.sectionLattice', 'Lattice')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {t('wasmcloudStatus.version', 'version')}:{' '}
              <span className="text-foreground">{data.stats.latticeVersion}</span>
            </span>
          </div>
          <div className="rounded-md bg-secondary/30 px-3 py-2 text-xs font-mono text-foreground">
            lattice://{data.summary.latticeId}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('wasmcloudStatus.sectionHosts', 'Hosts')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {hosts.length}
            </span>
          </div>

          {hosts.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('wasmcloudStatus.noHosts', 'No wasmCloud hosts found')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(displayedHosts ?? []).map(host => (
                <HostRow key={`${host.cluster}:${host.hostId}`} host={host} t={t} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('wasmcloudStatus.sectionProviders', 'Capability providers')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {providers.length}
            </span>
          </div>

          {providers.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('wasmcloudStatus.noProviders', 'No capability providers found')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(displayedProviders ?? []).map(provider => (
                <ProviderRow
                  key={`${provider.cluster}:${provider.providerId}`}
                  provider={provider}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('wasmcloudStatus.sectionLinks', 'Link definitions')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {links.length}
            </span>
          </div>

          {links.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('wasmcloudStatus.noLinks', 'No link definitions found')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(displayedLinks ?? []).map(link => (
                <LinkRow
                  key={`${link.actorId}:${link.providerId}:${link.linkName}`}
                  link={link}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default WasmcloudStatus
