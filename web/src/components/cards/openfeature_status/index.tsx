/**
 * OpenFeature Status Card
 *
 * OpenFeature (CNCF Incubating) is the open standard for feature flags —
 * a vendor-neutral SDK surface that sits in front of any flag backend
 * (flagd, LaunchDarkly, Split, ConfigCat, ...). This card surfaces the
 * operational signals a platform team needs to monitor an OpenFeature
 * deployment:
 *
 *  - Active providers (flagd, LaunchDarkly, ...) with evaluation counts
 *    and cache hit rate
 *  - Feature flags grouped by type (boolean / string / number / json)
 *  - Aggregate evaluation metrics + freshness badge
 *
 * Follows the spiffe_status / linkerd_status pattern for structure and
 * styling. The hook transparently falls back to demo data via useCache
 * when `/api/openfeature/status` is not wired up (404) or returns no data.
 */

import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Flag,
  RefreshCw,
  Server,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedOpenfeature } from '../../../hooks/useCachedOpenfeature'
import type {
  OpenFeatureFlag,
  OpenFeatureFlagType,
  OpenFeatureProvider,
  OpenFeatureProviderStatus,
} from './demoData'
import { formatTimeAgo } from '../../../lib/formatters'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const SKELETON_TITLE_WIDTH = 140
const SKELETON_TITLE_HEIGHT = 28
const SKELETON_BADGE_WIDTH = 90
const SKELETON_BADGE_HEIGHT = 20
const SKELETON_LIST_ITEMS = 5

const MAX_FLAGS_DISPLAYED = 6
const ERROR_RATE_WARNING_PCT = 5

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROVIDER_STATUS_CLASS: Record<OpenFeatureProviderStatus, string> = {
  healthy: 'bg-green-500/20 text-green-400',
  degraded: 'bg-yellow-500/20 text-yellow-400',
  unhealthy: 'bg-red-500/20 text-red-400',
}

const PROVIDER_DOT_CLASS: Record<OpenFeatureProviderStatus, string> = {
  healthy: 'bg-green-400',
  degraded: 'bg-yellow-400',
  unhealthy: 'bg-red-400',
}

const FLAG_TYPE_CLASS: Record<OpenFeatureFlagType, string> = {
  boolean: 'bg-cyan-500/20 text-cyan-400',
  string: 'bg-purple-500/20 text-purple-400',
  number: 'bg-blue-500/20 text-blue-400',
  json: 'bg-pink-500/20 text-pink-400',
}

function providerStatusLabel(
  status: OpenFeatureProviderStatus,
  t: TFunction<'cards'>,
): string {
  if (status === 'healthy') return t('openFeature.healthy', 'Healthy')
  if (status === 'degraded') return t('openFeature.degraded', 'Degraded')
  return t('openFeature.unhealthy', 'Unhealthy')
}

// ---------------------------------------------------------------------------
// Subsections
// ---------------------------------------------------------------------------

function ProviderRow({
  provider,
  t,
}: {
  provider: OpenFeatureProvider
  t: TFunction<'cards'>
}) {
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${PROVIDER_DOT_CLASS[provider.status]}`}
          />
          <Server className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-medium text-foreground truncate">
            {provider.name}
          </span>
        </div>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${PROVIDER_STATUS_CLASS[provider.status]}`}
        >
          {providerStatusLabel(provider.status, t)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {provider.evaluations > 0 && (
          <span>
            {provider.evaluations.toLocaleString()} {t('openFeature.evals', 'evals')}
          </span>
        )}
        {provider.cacheHitRate > 0 && (
          <span className="ml-auto shrink-0 font-mono">
            {provider.cacheHitRate.toFixed(1)}% {t('openFeature.cache', 'cache')}
          </span>
        )}
      </div>
    </div>
  )
}

function FlagRow({
  flag,
  t,
}: {
  flag: OpenFeatureFlag
  t: TFunction<'cards'>
}) {
  const ToggleIcon = flag.enabled ? ToggleRight : ToggleLeft
  const toggleClass = flag.enabled ? 'text-green-400' : 'text-muted-foreground'

  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <ToggleIcon className={`w-3.5 h-3.5 shrink-0 ${toggleClass}`} />
          <span className="text-xs font-medium text-foreground truncate font-mono">
            {flag.key}
          </span>
        </div>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${FLAG_TYPE_CLASS[flag.type]}`}
        >
          {flag.type}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="truncate">
          {t('openFeature.flagProvider', 'provider')}:{' '}
          <span className="text-foreground">{flag.provider}</span>
        </span>
        <span className="ml-auto shrink-0 font-mono">
          {flag.evaluations.toLocaleString()} {t('openFeature.evals', 'evals')}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OpenFeatureStatus() {
  const { t } = useTranslation('cards')
  const { data, isRefreshing, error, showSkeleton, showEmptyState } =
    useCachedOpenfeature()

  const isHealthy = data.health === 'healthy'
  const providers = data.providers ?? []
  const flags = data.flags ?? []
  const displayedFlags = flags.slice(0, MAX_FLAGS_DISPLAYED)

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <Skeleton
            variant="rounded"
            width={SKELETON_TITLE_WIDTH}
            height={SKELETON_TITLE_HEIGHT}
          />
          <Skeleton
            variant="rounded"
            width={SKELETON_BADGE_WIDTH}
            height={SKELETON_BADGE_HEIGHT}
          />
        </div>
        <SkeletonStats className="grid-cols-2 @sm:grid-cols-3" />
        <SkeletonList items={SKELETON_LIST_ITEMS} className="flex-1" />
      </div>
    )
  }

  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">
          {t('openFeature.fetchError', 'Unable to fetch OpenFeature status')}
        </p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Flag className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('openFeature.notInstalled', 'OpenFeature not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'openFeature.notInstalledHint',
            'No OpenFeature provider reachable from the connected clusters.',
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
          {isHealthy ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {isHealthy
            ? t('openFeature.healthy', 'Healthy')
            : t('openFeature.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatTimeAgo(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-3 gap-2">
        <MetricTile
          label={t('openFeature.providers', 'Providers')}
          value={`${providers.length}`}
          colorClass="text-blue-400"
          icon={<Server className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('openFeature.flags', 'Flags')}
          value={
            data.featureFlags.total > 0
              ? `${data.featureFlags.enabled}/${data.featureFlags.total}`
              : '0'
          }
          colorClass={
            data.featureFlags.total > 0 ? 'text-green-400' : 'text-muted-foreground'
          }
          icon={<Flag className="w-4 h-4 text-purple-400" />}
        />
        <MetricTile
          label={t('openFeature.evaluations', 'Evaluations')}
          value={
            data.totalEvaluations > 0 ? data.totalEvaluations.toLocaleString() : '0'
          }
          colorClass={
            data.totalEvaluations > 0 ? 'text-cyan-400' : 'text-muted-foreground'
          }
          icon={<Activity className="w-4 h-4 text-cyan-400" />}
        />
      </div>

      {/* Error rate warning */}
      {data.featureFlags.total > 0 &&
        data.featureFlags.errorRate > ERROR_RATE_WARNING_PCT && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            <span className="text-xs text-orange-400">
              {t('openFeature.highErrorRate', 'High error rate: {{rate}}%', {
                rate: data.featureFlags.errorRate.toFixed(1),
              })}
            </span>
          </div>
        )}

      {/* Provider + Flags lists */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('openFeature.providerStatus', 'Provider Status')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {providers.length}
            </span>
          </div>

          {providers.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('openFeature.noProviders', 'No providers found')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(providers ?? []).map(provider => (
                <ProviderRow key={provider.name} provider={provider} t={t} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('openFeature.sectionFlags', 'Feature flags')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {flags.length}
            </span>
          </div>

          {flags.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('openFeature.noFlags', 'No feature flags found')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(displayedFlags ?? []).map(flag => (
                <FlagRow key={flag.key} flag={flag} t={t} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default OpenFeatureStatus
