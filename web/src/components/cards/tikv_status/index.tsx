/**
 * TiKV Status Card
 *
 * Shows TiKV store nodes for a TiKV (CNCF graduated) distributed
 * key-value cluster: per-store state, region/leader counts, and
 * capacity utilization. Demo fallback is used when TiKV is not
 * installed or the user is in demo mode.
 */

import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle, Database, HardDrive, RefreshCw, Server } from 'lucide-react'
import { useCachedTikv } from '../../../hooks/useCachedTikv'
import { useCardLoadingState } from '../CardDataContext'
import { SkeletonCardWithRefresh } from '../../ui/Skeleton'
import { EmptyState } from '../../ui/EmptyState'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { cn } from '../../../lib/cn'
import type { TikvStore } from '../../../lib/demo/tikv'
import { BYTES_PER_GIB } from '../../../lib/constants/units'
import { getHealthBadgeClasses } from '../../../lib/cards/statusColors'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const USAGE_PCT_WARN = 70
const USAGE_PCT_ALERT = 85
const PCT_MULTIPLIER = 100
const MIN_DECIMAL_PLACES = 1
const STORE_PAGE_SIZE = 6
// Fallback summary — used when cached data is malformed (e.g. older schema
// without `summary`) so render-time property access never throws. See #9918.
const EMPTY_SUMMARY = {
  totalStores: 0,
  upStores: 0,
  downStores: 0,
  totalRegions: 0,
  totalLeaders: 0,
} as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatGib(bytes: number | undefined): string {
  // Guard: undefined/NaN/non-positive → em-dash. Prevents "NaN GiB" render
  // when a store object is missing capacity/available annotations (#9918).
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '—'
  const gib = bytes / BYTES_PER_GIB
  return `${gib.toFixed(MIN_DECIMAL_PLACES)} GiB`
}

function usagePct(store: Partial<TikvStore> | undefined): number {
  const capacity = store?.capacityBytes
  const available = store?.availableBytes
  if (
    typeof capacity !== 'number' ||
    !Number.isFinite(capacity) ||
    capacity <= 0 ||
    typeof available !== 'number' ||
    !Number.isFinite(available)
  ) {
    return 0
  }
  const used = capacity - available
  return Math.max(0, Math.min(PCT_MULTIPLIER, (used / capacity) * PCT_MULTIPLIER))
}

function usageColor(pct: number): string {
  if (pct >= USAGE_PCT_ALERT) return 'text-red-400'
  if (pct >= USAGE_PCT_WARN) return 'text-yellow-400'
  return 'text-green-400'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TikvStatus() {
  const { t } = useTranslation(['cards', 'common'])
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  } = useCachedTikv()

  // Rule: never show demo data while still loading
  const isDemoData = isDemoFallback && !isLoading

  // Defensive: cached payloads from older schemas or partial fetches may be
  // missing `summary` or `health` entirely — never assume nested structure
  // exists at render time (#9918).
  const summary = data?.summary ?? EMPTY_SUMMARY
  const health = data?.health
  // 'not-installed' still counts as "we have data" so the card isn't stuck in skeleton
  const hasAnyData =
    health === 'not-installed' ? true : (summary.totalStores ?? 0) > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    isDemoData,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  })

  if (showSkeleton) {
    return <SkeletonCardWithRefresh showStats={true} rows={STORE_PAGE_SIZE} />
  }

  if (showEmptyState || (health === 'not-installed' && !isDemoData)) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <EmptyState
          icon={<Database className="w-8 h-8 text-muted-foreground/40" />}
          title={t('tikvStatus.notInstalled', 'TiKV not detected')}
          description={t(
            'tikvStatus.notInstalledHint',
            'No TiKV store pods found. Deploy TiKV to monitor the distributed key-value store.',
          )}
        />
      </div>
    )
  }

  const isHealthy = health === 'healthy'
  // Guard against non-array cached values (older schema) and nullish store
  // entries so downstream property access in the render loop never throws.
  const allStores = Array.isArray(data?.stores) ? data.stores : []
  const stores = allStores.filter((s): s is TikvStore => s != null).slice(0, STORE_PAGE_SIZE)

  return (
    <div className="h-full flex flex-col min-h-card gap-4 overflow-hidden animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
            getHealthBadgeClasses(isHealthy),
          )}
        >
          {isHealthy ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {isHealthy
            ? t('tikvStatus.healthy', 'Healthy')
            : t('tikvStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={cn('w-3 h-3', isRefreshing ? 'animate-spin' : '')} />
          <span>{t('tikvStatus.stores', { count: summary.totalStores ?? 0, defaultValue: '{{count}} stores' })}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('tikvStatus.upStores', 'Up')}
          value={summary.upStores ?? 0}
          colorClass="text-green-400"
          icon={<CheckCircle className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('tikvStatus.downStores', 'Down')}
          value={summary.downStores ?? 0}
          colorClass={(summary.downStores ?? 0) > 0 ? 'text-red-400' : 'text-green-400'}
          icon={
            (summary.downStores ?? 0) > 0 ? (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-400" />
            )
          }
        />
        <MetricTile
          label={t('tikvStatus.regions', 'Regions')}
          value={(summary.totalRegions ?? 0).toLocaleString()}
          colorClass="text-cyan-400"
          icon={<Database className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('tikvStatus.leaders', 'Leaders')}
          value={(summary.totalLeaders ?? 0).toLocaleString()}
          colorClass="text-blue-400"
          icon={<Server className="w-4 h-4 text-blue-400" />}
        />
      </div>

      <div className="space-y-1.5 overflow-y-auto scrollbar-thin pr-0.5">
        {stores.length === 0 ? (
          <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
            {t('tikvStatus.noStores', 'No TiKV stores reporting.')}
          </div>
        ) : (
          stores.map((store, idx) => {
            // Defensive per-field reads: cached or partial responses may miss
            // fields that are non-optional in the TikvStore type (#9918).
            const pct = usagePct(store)
            const stateUp = store.state === 'Up'
            const storeState = store.state ?? t('tikvStatus.unknownState', 'Unknown')
            const regionCount = store.regionCount ?? 0
            const leaderCount = store.leaderCount ?? 0
            const storeId = store.storeId ?? idx + 1
            const address = store.address ?? ''
            return (
              <div
                key={storeId}
                className="rounded-md bg-secondary/30 px-3 py-2.5 space-y-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-1.5">
                    {stateUp ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    )}
                    <span className="text-xs font-medium truncate font-mono">
                      store-{storeId}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {address}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'text-[11px] px-1.5 py-0.5 rounded-full shrink-0',
                      stateUp
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400',
                    )}
                  >
                    {storeState}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate">
                    {t('tikvStatus.regionCount', { count: regionCount, defaultValue: '{{count}} regions' })} · {t('tikvStatus.leaderCount', { count: leaderCount, defaultValue: '{{count}} leaders' })}
                  </span>
                  <span className={cn('flex items-center gap-1 shrink-0', usageColor(pct))}>
                    <HardDrive className="w-3 h-3" />
                    {formatGib(store.availableBytes)} / {formatGib(store.capacityBytes)}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default TikvStatus
