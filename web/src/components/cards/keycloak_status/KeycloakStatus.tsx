import { useMemo } from 'react'
import { StatTile } from '../shared/StatTile'
import {
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Shield,
  XCircle,
  Loader2,
  Users,
  Globe,
  Key,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton, SkeletonStats, SkeletonList } from '../../ui/Skeleton'
import {
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
} from '../../../lib/cards/CardComponents'
import { useCardData } from '../../../lib/cards/cardHooks'
import { useKeycloakStatus } from './useKeycloakStatus'
import type { KeycloakRealm, KeycloakRealmStatus } from './demoData'
import { createCardSyncFormatter } from '../../../lib/formatters'

// Default page size for the paginated realm list. Named constant per
// CLAUDE.md "No magic numbers" rule.
const REALMS_PER_PAGE = 10

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Labels are resolved via t(`keycloak.${status}`) at render time so they go
// through the i18n pipeline. Keys: keycloak.ready, keycloak.degraded,
// keycloak.provisioning, keycloak.error — all defined in locales/en/cards.json.
const STATUS_CONFIG: Record<
  KeycloakRealmStatus,
  { color: string; icon: React.ReactNode }
> = {
  ready: {
    color: 'text-green-400',
    icon: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
  },
  degraded: {
    color: 'text-yellow-400',
    icon: <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />,
  },
  provisioning: {
    color: 'text-blue-400',
    icon: <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />,
  },
  error: {
    color: 'text-red-400',
    icon: <XCircle className="w-3.5 h-3.5 text-red-400" />,
  },
}

type RealmSortKey = 'status' | 'name'

const STATUS_SORT_ORDER: Record<KeycloakRealmStatus, number> = {
  error: 0,
  degraded: 1,
  provisioning: 2,
  ready: 3,
}


// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RealmRow({ realm }: { realm: KeycloakRealm }) {
  const { t } = useTranslation('cards')
  const cfg = STATUS_CONFIG[realm.status]

  return (
    <div className="rounded-md bg-muted/30 px-3 py-2 space-y-1.5">
      {/* Row 1: name + status */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {cfg.icon}
          <span className="text-xs font-medium truncate">{realm.name}</span>
          {!realm.enabled && (
            <span className="text-xs text-muted-foreground/60 shrink-0">
              ({t('keycloak.disabled')})
            </span>
          )}
        </div>
        <span className={`text-xs shrink-0 ${cfg.color}`}>{t(`keycloak.${realm.status}`)}</span>
      </div>

      {/* Row 2: namespace + metrics */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-muted-foreground">
        <span className="truncate">{realm.namespace}</span>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {realm.users.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <Globe className="w-3 h-3" />
            {realm.clients}
          </span>
          {realm.activeSessions > 0 && (
            <span className="flex items-center gap-1 text-green-400">
              <Key className="w-3 h-3" />
              {realm.activeSessions}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function KeycloakStatus() {
  const { t } = useTranslation('cards')
  const formatRelativeTime = createCardSyncFormatter(t, 'keycloak')
  const { data, isRefreshing, isFailed, showSkeleton, showEmptyState } =
    useKeycloakStatus()

  const realms = data.realms || []
  const operatorPods = data.operatorPods || { ready: 0, total: 0 }

  // Derived stats are always computed from all realms, not the filtered slice
  const stats = {
    ready: realms.filter(r => r.status === 'ready').length,
    issues: realms.filter(r => r.status === 'degraded' || r.status === 'error').length,
  }

  // Sort options for CardControls — labels resolved through i18n. Memoized so
  // the reference stays stable across renders.
  const SORT_OPTIONS = useMemo(
    () => [
      { value: 'status' as const, label: String(t('keycloak.sortByStatus')) },
      { value: 'name' as const, label: String(t('keycloak.sortByName')) },
    ],
    [t],
  )

  const {
    items: displayRealms,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search,
      setSearch,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef,
    },
    sorting: { sortBy, setSortBy, sortDirection, setSortDirection },
    containerRef,
    containerStyle,
  } = useCardData<KeycloakRealm, RealmSortKey>(realms, {
    filter: {
      searchFields: ['name', 'namespace'],
      clusterField: 'cluster' as keyof KeycloakRealm,
      storageKey: 'keycloak-status',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: (a, b) =>
          (STATUS_SORT_ORDER[a.status] ?? 4) - (STATUS_SORT_ORDER[b.status] ?? 4),
        name: (a, b) => a.name.localeCompare(b.name),
      },
    },
    defaultLimit: REALMS_PER_PAGE,
  })

  // ── Loading ───────────────────────────────────────────────────────────────
  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <Skeleton variant="rounded" width={120} height={28} />
          <Skeleton variant="rounded" width={80} height={20} />
        </div>
        <SkeletonStats className="grid-cols-2 @md:grid-cols-4" />
        <Skeleton variant="rounded" height={32} />
        <SkeletonList items={3} className="flex-1" />
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (isFailed && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">
          {t('keycloak.fetchError')}
        </p>
      </div>
    )
  }

  // ── Not installed ──────────────────────────────────────────────────────────
  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Shield className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('keycloak.notInstalled')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t('keycloak.notInstalledHint')}
        </p>
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const healthColorClass = isHealthy
    ? 'bg-green-500/15 text-green-400'
    : 'bg-yellow-500/15 text-yellow-400'

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* ── Header: health badge + operator pods + last check ── */}
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${healthColorClass}`}
          >
            {isHealthy ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            {isHealthy
              ? t('keycloak.healthy')
              : t('keycloak.degraded')}
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Shield className="w-3 h-3" />
            {operatorPods.ready}/{operatorPods.total}{' '}
            {t('keycloak.pods')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatRelativeTime(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* ── Stats grid ── */}
      {realms.length > 0 && (
        <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
          <StatTile
            icon={<Globe className="w-4 h-4 text-blue-400" />}
            label={t('keycloak.realms')}
            value={realms.length.toLocaleString()}
            colorClass="text-blue-400"
            borderClass="border-blue-500/20"
          />
          <StatTile
            icon={<CheckCircle className="w-4 h-4 text-green-400" />}
            label={t('keycloak.ready')}
            value={stats.ready.toLocaleString()}
            colorClass="text-green-400"
            borderClass="border-green-500/20"
          />
          <StatTile
            icon={<Users className="w-4 h-4 text-cyan-400" />}
            label={t('keycloak.sessions')}
            value={data.totalActiveSessions.toLocaleString()}
            colorClass="text-cyan-400"
            borderClass="border-cyan-500/20"
          />
          <StatTile
            icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
            label={t('keycloak.issues')}
            value={stats.issues.toLocaleString()}
            colorClass="text-red-400"
            borderClass="border-red-500/20"
          />
        </div>
      )}

      {/* ── Search + unified controls (sort, limit, cluster filter) ── */}
      {realms.length > 0 && (
        <>
          <CardSearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('keycloak.searchPlaceholder')}
          />
          <CardControlsRow
            clusterFilter={{
              availableClusters,
              selectedClusters: localClusterFilter,
              onToggle: toggleClusterFilter,
              onClear: clearClusterFilter,
              isOpen: showClusterFilter,
              setIsOpen: setShowClusterFilter,
              containerRef: clusterFilterRef,
              minClusters: 1,
            }}
            cardControls={{
              limit: itemsPerPage,
              onLimitChange: setItemsPerPage,
              sortBy,
              sortOptions: SORT_OPTIONS,
              onSortChange: v => setSortBy(v as RealmSortKey),
              sortDirection,
              onSortDirectionChange: setSortDirection,
            }}
          />
        </>
      )}

      {/* ── Realm list ── */}
      <div
        ref={containerRef}
        className="flex-1 space-y-2 overflow-y-auto"
        style={containerStyle}
      >
        {displayRealms.length > 0 ? (
          displayRealms.map(realm => (
            <RealmRow
              key={`${realm.cluster}/${realm.namespace}/${realm.name}`}
              realm={realm}
            />
          ))
        ) : realms.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1 py-6">
            <Shield className="w-6 h-6 opacity-40" />
            <p className="text-sm">{t('keycloak.noRealms')}</p>
            <p className="text-xs text-center">
              {t('keycloak.noRealmsHint')}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            {t('keycloak.noSearchResults')}
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : REALMS_PER_PAGE}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />

      {/* ── Footer: totals ── */}
      {realms.length > 0 && (
        <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground flex gap-4">
          <span>
            {data.totalUsers.toLocaleString()} {t('keycloak.users')}
          </span>
          <span>
            {data.totalClients} {t('keycloak.clients')}
          </span>
        </div>
      )}
    </div>
  )
}
