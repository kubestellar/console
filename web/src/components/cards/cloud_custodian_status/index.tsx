/**
 * Cloud Custodian Status Card
 *
 * Cloud Custodian (CNCF incubating) is a rules engine for cloud governance,
 * compliance, and cost management. This card surfaces per-policy run
 * telemetry — success / fail / dry-run counts, last-run times, mode
 * (pull / periodic / event) — plus the top resources acted on and a
 * severity breakdown of active violations.
 *
 * Follows the tuf_status / containerd_status pattern for structure and
 * styling.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real Cloud Custodian bridge lands, the hook's fetcher will pick up live
 * data automatically with no component changes.
 */

import {
  AlertTriangle,
  CheckCircle,
  FileWarning,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldOff,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedCloudCustodian } from '../../../hooks/useCachedCloudCustodian'
import { useCardLoadingState } from '../CardDataContext'
import { cn } from '../../../lib/cn'
import { PolicyRow, TopResourceRow, severityClass } from './CloudCustodianRows'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const SKELETON_TITLE_WIDTH = 160
const SKELETON_TITLE_HEIGHT = 28
const SKELETON_BADGE_WIDTH = 90
const SKELETON_BADGE_HEIGHT = 20
const SKELETON_LIST_ITEMS = 5

// Max rows to render in the two main lists before the scroller takes over —
// keeps the card height predictable while still giving operators signal.
const MAX_POLICY_ROWS = 6
const MAX_TOP_RESOURCE_ROWS = 5

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CloudCustodianStatus() {
  const { t } = useTranslation('cards')
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    error,
    lastRefresh,
    refetch,
  } = useCachedCloudCustodian()

  // Rule: never show demo data while still loading
  const isDemoData = isDemoFallback && !isLoading

  // 'not-installed' counts as "we have data" so the card isn't stuck in skeleton.
  const hasAnyData =
    data.health === 'not-installed' ? true : data.summary.totalPolicies > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    isDemoData,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    errorMessage: error ?? undefined,
    lastRefresh,
  })

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

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-3">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">{t('cloudCustodianStatus.fetchFailed', 'Failed to fetch Cloud Custodian status')}</p>
        {error && <p className="text-xs text-muted-foreground max-w-xs text-center">{error}</p>}
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-sm"
        >
          <RefreshCw className={cn('w-4 h-4', isRefreshing ? 'animate-spin' : '')} />
          {t('common.retry', 'Retry')}
        </button>
      </div>
    )
  }

  if (data.health === 'not-installed' && !isDemoData) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <ShieldOff className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('cloudCustodianStatus.notInstalled', 'Cloud Custodian not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'cloudCustodianStatus.notInstalledHint',
            'No Cloud Custodian policy telemetry reachable. Configure Cloud Custodian to monitor cloud policy runs and violations.',
          )}
        </p>
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const policies = data.policies ?? []
  const topResources = data.topResources ?? []
  const violations = data.violationsBySeverity

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* Header — health pill + version freshness */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
            isHealthy
              ? 'bg-green-500/15 text-green-400'
              : 'bg-yellow-500/15 text-yellow-400',
          )}
        >
          {isHealthy ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {isHealthy
            ? t('cloudCustodianStatus.healthy', 'Healthy')
            : t('cloudCustodianStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={cn('w-3 h-3', isRefreshing ? 'animate-spin' : '')} />
          <span>
            {t('cloudCustodianStatus.version', 'version')}:{' '}
            <span className="text-foreground font-mono">{data.version}</span>
          </span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('cloudCustodianStatus.policiesTotal', 'Policies')}
          value={data.summary.totalPolicies}
          colorClass="text-cyan-400"
          icon={<Shield className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('cloudCustodianStatus.policiesSuccess', 'Success')}
          value={data.summary.successfulPolicies}
          colorClass="text-green-400"
          icon={<CheckCircle className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('cloudCustodianStatus.policiesFail', 'Failing')}
          value={data.summary.failedPolicies}
          colorClass={
            data.summary.failedPolicies > 0 ? 'text-red-400' : 'text-muted-foreground'
          }
          icon={
            data.summary.failedPolicies > 0 ? (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-400" />
            )
          }
        />
        <MetricTile
          label={t('cloudCustodianStatus.policiesDryRun', 'Dry-run')}
          value={data.summary.dryRunPolicies}
          colorClass={
            data.summary.dryRunPolicies > 0 ? 'text-yellow-400' : 'text-muted-foreground'
          }
          icon={<FileWarning className="w-4 h-4 text-yellow-400" />}
        />
      </div>

      {/* Violations breakdown */}
      <section className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2">
        <div className="flex items-center gap-2 mb-1.5">
          <ShieldAlert className="w-4 h-4 text-orange-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('cloudCustodianStatus.sectionViolations', 'Violations by severity')}
          </h3>
        </div>
        <div className="grid grid-cols-2 @md:grid-cols-4 gap-2 text-xs">
          <div>
            <span className={cn('text-base font-semibold', severityClass('critical'))}>
              {violations.critical}
            </span>
            <div className="text-xs text-muted-foreground">
              {t('cloudCustodianStatus.severityCritical', 'Critical')}
            </div>
          </div>
          <div>
            <span className={cn('text-base font-semibold', severityClass('high'))}>
              {violations.high}
            </span>
            <div className="text-xs text-muted-foreground">
              {t('cloudCustodianStatus.severityHigh', 'High')}
            </div>
          </div>
          <div>
            <span className={cn('text-base font-semibold', severityClass('medium'))}>
              {violations.medium}
            </span>
            <div className="text-xs text-muted-foreground">
              {t('cloudCustodianStatus.severityMedium', 'Medium')}
            </div>
          </div>
          <div>
            <span className={cn('text-base font-semibold', severityClass('low'))}>
              {violations.low}
            </span>
            <div className="text-xs text-muted-foreground">
              {t('cloudCustodianStatus.severityLow', 'Low')}
            </div>
          </div>
        </div>
      </section>

      {/* Lists */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('cloudCustodianStatus.sectionPolicies', 'Policies')}
            </h3>
          </div>
          {policies.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('cloudCustodianStatus.noPolicies', 'No Cloud Custodian policies reporting.')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(policies ?? [])
                .slice(0, MAX_POLICY_ROWS)
                .map(policy => (
                  <PolicyRow key={policy.name} policy={policy} t={t} />
                ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('cloudCustodianStatus.sectionTopResources', 'Top resources acted on')}
            </h3>
          </div>
          {topResources.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('cloudCustodianStatus.noTopResources', 'No resources acted on.')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(topResources ?? [])
                .slice(0, MAX_TOP_RESOURCE_ROWS)
                .map(resource => (
                  <TopResourceRow key={resource.id} resource={resource} />
                ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default CloudCustodianStatus
