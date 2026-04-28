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
  Clock,
  FileWarning,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldOff,
  Target,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedCloudCustodian } from '../../../hooks/useCachedCloudCustodian'
import { useCardLoadingState } from '../CardDataContext'
import { cn } from '../../../lib/cn'
import type {
  CustodianPolicy,
  CustodianPolicyMode,
  CustodianTopResource,
  CustodianViolationSeverity,
} from '../../../lib/demo/cloud-custodian'
import { formatTimeAgo } from '../../../lib/formatters'

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
// Helpers
// ---------------------------------------------------------------------------

function policyStatusBadgeClass(policy: CustodianPolicy): string {
  if (policy.failCount > 0) return 'bg-red-500/20 text-red-400'
  if (policy.dryRunCount > 0) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-green-500/20 text-green-400'
}

function modeBadgeClass(mode: CustodianPolicyMode): string {
  switch (mode) {
    case 'event':
      return 'bg-violet-500/20 text-violet-400'
    case 'periodic':
      return 'bg-cyan-500/20 text-cyan-400'
    case 'pull':
      return 'bg-blue-500/20 text-blue-400'
    default:
      return 'bg-secondary/40 text-muted-foreground'
  }
}

function severityClass(sev: CustodianViolationSeverity): string {
  switch (sev) {
    case 'critical':
      return 'text-red-400'
    case 'high':
      return 'text-orange-400'
    case 'medium':
      return 'text-yellow-400'
    case 'low':
      return 'text-muted-foreground'
    default:
      return 'text-muted-foreground'
  }
}

function policyStatusLabel(
  policy: CustodianPolicy,
  t: TFunction<'cards'>,
): string {
  if (policy.failCount > 0) return t('cloudCustodianStatus.statusFail', 'Failing')
  if (policy.dryRunCount > 0) return t('cloudCustodianStatus.statusDryRun', 'Dry-run')
  return t('cloudCustodianStatus.statusSuccess', 'Success')
}

function modeLabel(
  mode: CustodianPolicyMode,
  t: TFunction<'cards'>,
): string {
  const modeLabels: Record<CustodianPolicyMode, string> = {
    pull: t('cloudCustodianStatus.modePull', 'pull'),
    periodic: t('cloudCustodianStatus.modePeriodic', 'periodic'),
    event: t('cloudCustodianStatus.modeEvent', 'event'),
  }
  return modeLabels[mode] ?? mode
}

function PolicyRow({
  policy,
  t,
}: {
  policy: CustodianPolicy
  t: TFunction<'cards'>
}) {
  const isHealthy = policy.failCount === 0 && policy.dryRunCount === 0
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          {isHealthy ? (
            <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
          ) : policy.failCount > 0 ? (
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
          )}
          <span className="text-xs font-medium font-mono truncate">{policy.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={cn(
              'text-[11px] px-1.5 py-0.5 rounded-full',
              modeBadgeClass(policy.mode),
            )}
          >
            {modeLabel(policy.mode, t)}
          </span>
          <span
            className={cn(
              'text-[11px] px-1.5 py-0.5 rounded-full',
              policyStatusBadgeClass(policy),
            )}
          >
            {policyStatusLabel(policy, t)}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="truncate">
          <span className="text-foreground font-mono">{policy.resource}</span>
        </span>
        <span className="flex items-center gap-1">
          <Target className="w-3 h-3" />
          {policy.resourcesMatched}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatTimeAgo(policy.lastRunAt)}
        </span>
      </div>
    </div>
  )
}

function TopResourceRow({ resource }: { resource: CustodianTopResource }) {
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0 flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span className="text-xs font-mono text-foreground truncate">{resource.id}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-muted-foreground">{resource.type}</span>
        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-secondary/50 text-cyan-400 font-mono">
          {resource.actionCount}
        </span>
      </div>
    </div>
  )
}

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
    lastRefresh,
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

  if (showEmptyState || (data.health === 'not-installed' && !isDemoData)) {
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
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('cloudCustodianStatus.sectionViolations', 'Violations by severity')}
          </h4>
        </div>
        <div className="grid grid-cols-2 @md:grid-cols-4 gap-2 text-xs">
          <div>
            <span className={cn('text-base font-semibold', severityClass('critical'))}>
              {violations.critical}
            </span>
            <div className="text-[11px] text-muted-foreground">
              {t('cloudCustodianStatus.severityCritical', 'Critical')}
            </div>
          </div>
          <div>
            <span className={cn('text-base font-semibold', severityClass('high'))}>
              {violations.high}
            </span>
            <div className="text-[11px] text-muted-foreground">
              {t('cloudCustodianStatus.severityHigh', 'High')}
            </div>
          </div>
          <div>
            <span className={cn('text-base font-semibold', severityClass('medium'))}>
              {violations.medium}
            </span>
            <div className="text-[11px] text-muted-foreground">
              {t('cloudCustodianStatus.severityMedium', 'Medium')}
            </div>
          </div>
          <div>
            <span className={cn('text-base font-semibold', severityClass('low'))}>
              {violations.low}
            </span>
            <div className="text-[11px] text-muted-foreground">
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
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('cloudCustodianStatus.sectionPolicies', 'Policies')}
            </h4>
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
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('cloudCustodianStatus.sectionTopResources', 'Top resources acted on')}
            </h4>
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
