/**
 * SPIFFE Status Card
 *
 * SPIFFE (Secure Production Identity Framework For Everyone) is a CNCF
 * graduated identity standard. This card surfaces the active trust domain,
 * SVID counts (x509 and JWT), federated trust domains, and recent
 * registration entries — the primary operational signals from a SPIRE
 * server.
 *
 * Follows the linkerd_status / envoy_status pattern for structure and styling.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real SPIRE server bridge lands (`/api/spiffe/status`), the hook's fetcher
 * will pick up live data automatically with no component changes.
 */

import {
  AlertTriangle,
  CheckCircle,
  Fingerprint,
  Globe,
  Key,
  RefreshCw,
  Shield,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedSpiffe } from '../../../hooks/useCachedSpiffe'
import type {
  SpiffeFederatedDomain,
  SpiffeRegistrationEntry,
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

const MAX_ENTRIES_DISPLAYED = 5

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function federationStatusClass(status: SpiffeFederatedDomain['status']): string {
  if (status === 'active') return 'bg-green-500/20 text-green-400'
  if (status === 'pending') return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-red-500/20 text-red-400'
}

// ---------------------------------------------------------------------------
// Subsections
// ---------------------------------------------------------------------------

function EntryRow({ entry }: { entry: SpiffeRegistrationEntry }) {
  const svidClass =
    entry.svidType === 'x509'
      ? 'bg-cyan-500/20 text-cyan-400'
      : 'bg-purple-500/20 text-purple-400'

  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <Fingerprint className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-medium text-foreground truncate font-mono">
            {entry.spiffeId}
          </span>
        </div>
        <span className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${svidClass}`}>
          {entry.svidType.toUpperCase()}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="truncate">{entry.selector}</span>
        <span className="ml-auto shrink-0 font-mono">
          ttl {formatDuration(entry.ttlSeconds)}
        </span>
      </div>
    </div>
  )
}

function FederatedRow({ domain }: { domain: SpiffeFederatedDomain }) {
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-medium text-foreground truncate font-mono">
            {domain.trustDomain}
          </span>
        </div>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${federationStatusClass(
            domain.status,
          )}`}
        >
          {domain.status}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground truncate">
        {domain.bundleEndpoint}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SpiffeStatus() {
  const { t } = useTranslation('cards')
  const { data, isRefreshing, error, showSkeleton, showEmptyState } = useCachedSpiffe()

  const isHealthy = data.health === 'healthy'
  const entries = data.entries ?? []
  const federatedDomains = data.federatedDomains ?? []
  const displayedEntries = entries.slice(0, MAX_ENTRIES_DISPLAYED)

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
          {t('spiffeStatus.fetchError', 'Unable to fetch SPIFFE status')}
        </p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Shield className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('spiffeStatus.notInstalled', 'SPIFFE/SPIRE not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'spiffeStatus.notInstalledHint',
            'No SPIRE server reachable from the connected clusters.',
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
            ? t('spiffeStatus.healthy', 'Healthy')
            : t('spiffeStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatTimeAgo(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('spiffeStatus.x509Svids', 'x509 SVIDs')}
          value={`${data.stats.x509SvidCount}`}
          colorClass="text-cyan-400"
          icon={<Key className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('spiffeStatus.jwtSvids', 'JWT SVIDs')}
          value={`${data.stats.jwtSvidCount}`}
          colorClass="text-purple-400"
          icon={<Key className="w-4 h-4 text-purple-400" />}
        />
        <MetricTile
          label={t('spiffeStatus.federated', 'Federated')}
          value={`${data.summary.totalFederatedDomains}`}
          colorClass="text-green-400"
          icon={<Globe className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('spiffeStatus.agents', 'Agents')}
          value={`${data.stats.agentCount}`}
          colorClass="text-yellow-400"
          icon={<Users className="w-4 h-4 text-yellow-400" />}
        />
      </div>

      {/* Trust domain + lists */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('spiffeStatus.sectionTrustDomain', 'Trust domain')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {t('spiffeStatus.server', 'server')}:{' '}
              <span className="text-foreground">{data.stats.serverVersion}</span>
            </span>
          </div>
          <div className="rounded-md bg-secondary/30 px-3 py-2 text-xs font-mono text-foreground">
            spiffe://{data.summary.trustDomain}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Fingerprint className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('spiffeStatus.sectionEntries', 'Registration entries')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {entries.length}
            </span>
          </div>

          {entries.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('spiffeStatus.noEntries', 'No registration entries found')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(displayedEntries ?? []).map(entry => (
                <EntryRow
                  key={`${entry.cluster}:${entry.spiffeId}`}
                  entry={entry}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('spiffeStatus.sectionFederated', 'Federated trust domains')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {federatedDomains.length}
            </span>
          </div>

          {federatedDomains.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('spiffeStatus.noFederated', 'No federated trust domains')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(federatedDomains ?? []).map(domain => (
                <FederatedRow key={domain.trustDomain} domain={domain} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default SpiffeStatus
