/**
 * TUF (The Update Framework) Status Card
 *
 * Displays TUF role metadata — root / targets / snapshot / timestamp —
 * with version, expiration, signing status, and threshold/keys.
 * Follows the linkerd_status / tikv_status pattern for structure and styling.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real TUF metadata bridge lands, the hook's fetcher will pick up live
 * data automatically with no component changes.
 */

import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Key,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedTuf } from '../../../hooks/useCachedTuf'
import { useCardLoadingState } from '../CardDataContext'
import { cn } from '../../../lib/cn'
import type { TufMetadataStatus, TufRole } from '../../../lib/demo/tuf'
import { MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../../../lib/constants/time'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const SKELETON_TITLE_WIDTH = 140
const SKELETON_TITLE_HEIGHT = 28
const SKELETON_BADGE_WIDTH = 90
const SKELETON_BADGE_HEIGHT = 20
const SKELETON_LIST_ITEMS = 4


// Role count used for skeleton row pre-allocation — TUF has exactly four
// top-level roles per the spec (root, targets, snapshot, timestamp).
const TUF_TOP_LEVEL_ROLE_COUNT = 4

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatExpiration(isoString: string): string {
  if (!isoString) return '—'
  const parsedMs = new Date(isoString).getTime()
  if (!Number.isFinite(parsedMs)) return '—'
  const deltaMs = parsedMs - Date.now()

  if (deltaMs <= 0) {
    const absDelta = Math.abs(deltaMs)
    if (absDelta < MS_PER_HOUR) return 'just expired'
    if (absDelta < MS_PER_DAY) return `expired ${Math.floor(absDelta / MS_PER_HOUR)}h ago`
    return `expired ${Math.floor(absDelta / MS_PER_DAY)}d ago`
  }

  if (deltaMs < MS_PER_HOUR) return `in ${Math.max(1, Math.floor(deltaMs / MS_PER_MINUTE))}m`
  if (deltaMs < MS_PER_DAY) return `in ${Math.floor(deltaMs / MS_PER_HOUR)}h`
  return `in ${Math.floor(deltaMs / MS_PER_DAY)}d`
}

function statusBadgeClass(status: TufMetadataStatus): string {
  switch (status) {
    case 'signed':
      return 'bg-green-500/20 text-green-400'
    case 'expiring-soon':
      return 'bg-yellow-500/20 text-yellow-400'
    case 'expired':
      return 'bg-red-500/20 text-red-400'
    case 'unsigned':
      return 'bg-red-500/20 text-red-400'
    default:
      return 'bg-secondary/40 text-muted-foreground'
  }
}

function statusTextColor(status: TufMetadataStatus): string {
  switch (status) {
    case 'signed':
      return 'text-green-400'
    case 'expiring-soon':
      return 'text-yellow-400'
    case 'expired':
    case 'unsigned':
      return 'text-red-400'
    default:
      return 'text-muted-foreground'
  }
}

function RoleRow({
  role,
  statusLabel,
}: {
  role: TufRole
  statusLabel: string
}) {
  const isHealthy = role.status === 'signed'
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          {isHealthy ? (
            <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
          ) : (
            <AlertTriangle className={cn('w-3.5 h-3.5 shrink-0', statusTextColor(role.status))} />
          )}
          <span className="text-xs font-medium font-mono truncate">{role.name}</span>
          <span className="text-[11px] text-muted-foreground shrink-0">v{role.version}</span>
        </div>
        <span
          className={cn(
            'text-[11px] px-1.5 py-0.5 rounded-full shrink-0',
            statusBadgeClass(role.status),
          )}
        >
          {statusLabel}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span className={statusTextColor(role.status)}>{formatExpiration(role.expiresAt)}</span>
        </span>
        <span className="flex items-center gap-1">
          <Key className="w-3 h-3" />
          {role.threshold}/{role.keyCount} keys
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TufStatus() {
  const { t } = useTranslation('cards')
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  } = useCachedTuf()

  // Rule: never show demo data while still loading
  const isDemoData = isDemoFallback && !isLoading

  // 'not-installed' counts as "we have data" so the card isn't stuck in skeleton
  const hasAnyData =
    data.health === 'not-installed' ? true : data.summary.totalRoles > 0

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
        <div className="flex items-center justify-between">
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
          {t('tufStatus.notInstalled', 'TUF not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'tufStatus.notInstalledHint',
            'No TUF repository metadata reachable. Configure a TUF repository to monitor role metadata signing and expiration.',
          )}
        </p>
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const roles = data.roles ?? []

  const statusLabels: Record<TufMetadataStatus, string> = {
    signed: t('tufStatus.statusSigned', 'Signed'),
    'expiring-soon': t('tufStatus.statusExpiringSoon', 'Expiring soon'),
    expired: t('tufStatus.statusExpired', 'Expired'),
    unsigned: t('tufStatus.statusUnsigned', 'Unsigned'),
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* Header — health pill + freshness */}
      <div className="flex items-center justify-between gap-2">
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
            ? t('tufStatus.healthy', 'Healthy')
            : t('tufStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={cn('w-3 h-3', isRefreshing ? 'animate-spin' : '')} />
          <span>
            {t('tufStatus.specVersion', 'spec')}:{' '}
            <span className="text-foreground font-mono">{data.specVersion}</span>
          </span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('tufStatus.rolesTotal', 'Roles')}
          value={data.summary.totalRoles}
          colorClass="text-cyan-400"
          icon={<ShieldCheck className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('tufStatus.rolesSigned', 'Signed')}
          value={data.summary.signedRoles}
          colorClass="text-green-400"
          icon={<CheckCircle className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('tufStatus.rolesExpiringSoon', 'Expiring')}
          value={data.summary.expiringSoonRoles}
          colorClass={
            data.summary.expiringSoonRoles > 0 ? 'text-yellow-400' : 'text-muted-foreground'
          }
          icon={<Clock className="w-4 h-4 text-yellow-400" />}
        />
        <MetricTile
          label={t('tufStatus.rolesExpired', 'Expired')}
          value={data.summary.expiredRoles}
          colorClass={data.summary.expiredRoles > 0 ? 'text-red-400' : 'text-muted-foreground'}
          icon={
            data.summary.expiredRoles > 0 ? (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-400" />
            )
          }
        />
      </div>

      {/* Roles list */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('tufStatus.sectionRoles', 'Top-level roles')}
            </h4>
            {data.repository ? (
              <span className="text-[11px] text-muted-foreground ml-auto truncate max-w-[50%]">
                {data.repository}
              </span>
            ) : null}
          </div>

          {roles.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('tufStatus.noRoles', 'No TUF roles reporting.')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(roles ?? [])
                .slice(0, TUF_TOP_LEVEL_ROLE_COUNT)
                .map(role => (
                  <RoleRow
                    key={role.name}
                    role={role}
                    statusLabel={statusLabels[role.status] ?? role.status}
                  />
                ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default TufStatus
