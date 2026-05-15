import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  Server,
  Bell,
  BellOff } from 'lucide-react'
import { useAlerts } from '../../hooks/useAlerts'
import { MS_PER_MINUTE } from '../../lib/constants/time'
import { DEFAULT_PAGE_SIZE } from '../../lib/constants/ui'
import { StatusBadge } from '../ui/StatusBadge'
import { useGlobalFilters, type SeverityLevel } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useMissions } from '../../hooks/useMissions'
import { ALERT_SEVERITY_ORDER } from '../../types/alerts'
import type { Alert, AlertSeverity } from '../../types/alerts'
import { CardControls } from '../ui/CardControls'
import { Pagination } from '../ui/Pagination'
import { CardClusterFilter, CardSearchInput } from '../../lib/cards/CardComponents'
import { useCardData } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'
import { NotificationVerifyIndicator } from './NotificationVerifyIndicator'
import { AlertListItem } from './AlertListItem'
import { useDoNotDisturb, type TimedDuration } from '../../hooks/useDoNotDisturb'
import { groupAlertsForDisplay, type GroupedAlert } from '../../lib/alerts/groupAlertsForDisplay'
import { VirtualizedList } from '../ui/VirtualizedList'

/** Format remaining DND time as "Xh Ym" or "Ym" */
function formatRemaining(ms: number): string {
  const totalMinutes = Math.ceil(ms / MS_PER_MINUTE)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

// Stats summary row shown at the top of the alerts card
function AlertStatsRow({ critical, warning, acknowledged }: { critical: number; warning: number; acknowledged: number }) {
  const { t } = useTranslation('cards')
  return (
    <div className="grid grid-cols-2 @sm:grid-cols-3 gap-2 mb-2">
      <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
        <div className="flex items-center gap-1.5 mb-1">
          <AlertTriangle className="w-3 h-3 text-red-400" />
          <span className="text-xs text-red-400">{t('activeAlerts.critical')}</span>
        </div>
        <span className="text-lg font-bold text-foreground">{critical}</span>
      </div>
      <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
        <div className="flex items-center gap-1.5 mb-1">
          <AlertTriangle className="w-3 h-3 text-orange-400" />
          <span className="text-xs text-orange-400">{t('activeAlerts.warning')}</span>
        </div>
        <span className="text-lg font-bold text-foreground">{warning}</span>
      </div>
      <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
        <div className="flex items-center gap-1.5 mb-1">
          <CheckCircle className="w-3 h-3 text-green-400" />
          <span className="text-xs text-green-400">{t('activeAlerts.ackd')}</span>
        </div>
        <span className="text-lg font-bold text-foreground">{acknowledged}</span>
      </div>
    </div>
  )
}

type SortField = 'severity' | 'time'

const ALERT_ROW_ESTIMATED_HEIGHT_PX = 144
const ALERT_LIST_OVERSCAN_COUNT = 8
const ALERT_LIST_ITEM_GAP_PX = 8

export function ActiveAlerts() {
  const { t } = useTranslation('cards')
  const {
    activeAlerts,
    acknowledgedAlerts,
    stats,
    acknowledgeAlerts,
    runAIDiagnosis,
    isLoadingData,
    dataError,
  } = useAlerts()
  const { selectedSeverities, isAllSeveritiesSelected, customFilter } = useGlobalFilters()
  const { isDemoMode } = useDemoMode()

  // Report real fetch state so CardWrapper shows the refresh spinner on reload (#8011)
  // and the error badge when the underlying MCP data bridge fails (#8014).
  const hasAnyData = activeAlerts.length > 0 || acknowledgedAlerts.length > 0
  useCardLoadingState({
    isLoading: isLoadingData && !hasAnyData,
    isRefreshing: isLoadingData && hasAnyData,
    hasAnyData,
    isDemoData: isDemoMode,
    isFailed: Boolean(dataError),
    consecutiveFailures: dataError ? 1 : 0,
    errorMessage: dataError ?? undefined,
  })
  const { drillToAlert } = useDrillDownActions()
  const { missions, setActiveMission, openSidebar } = useMissions()

  const [showAcknowledged, setShowAcknowledged] = useState(false)
  const [showDNDMenu, setShowDNDMenu] = useState(false)
  const dnd = useDoNotDisturb()

  // Combine active and acknowledged alerts when toggle is on
  const allAlertsToShow = (() => {
    if (showAcknowledged) {
      return [...activeAlerts, ...acknowledgedAlerts]
    }
    return activeAlerts
  })()

  // Map AlertSeverity to global SeverityLevel for filtering
  const mapAlertSeverityToGlobal = (alertSeverity: AlertSeverity): SeverityLevel[] => {
    switch (alertSeverity) {
      case 'critical': return ['critical']
      case 'warning': return ['warning']
      case 'info': return ['info']
      default: return ['info']
    }
  }

  // Pre-filter by severity and global custom filter (these are outside useCardData)
  const severityFilteredAlerts = (() => {
    let result = allAlertsToShow

    // Apply global severity filter
    if (!isAllSeveritiesSelected) {
      result = result.filter(a => {
        const mappedSeverities = mapAlertSeverityToGlobal(a.severity)
        return mappedSeverities.some(s => selectedSeverities.includes(s))
      })
    }

    // Apply global custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(a =>
        a.ruleName.toLowerCase().includes(query) ||
        a.message.toLowerCase().includes(query) ||
        (a.cluster?.toLowerCase() || '').includes(query)
      )
    }

    return result
  })()

  const groupedAlerts = useMemo(
    () => groupAlertsForDisplay(severityFilteredAlerts),
    [severityFilteredAlerts]
  )

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: displayedAlerts,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: localSearch,
      setSearch: setLocalSearch,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters: availableClustersForFilter,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef },
    sorting: {
      sortBy,
      setSortBy },
    containerRef,
    containerStyle } = useCardData<GroupedAlert, SortField>(groupedAlerts, {
    filter: {
      searchFields: ['ruleName', 'message', 'cluster'],
      clusterField: 'cluster',
      storageKey: 'active-alerts' },
    sort: {
      defaultField: 'severity',
      defaultDirection: 'asc',
      comparators: {
        severity: (a, b) => {
          const severityDiff = ALERT_SEVERITY_ORDER[a.severity] - ALERT_SEVERITY_ORDER[b.severity]
          if (severityDiff !== 0) return severityDiff
          return new Date(b.firedAt).getTime() - new Date(a.firedAt).getTime()
        },
        time: (a, b) => new Date(b.firedAt).getTime() - new Date(a.firedAt).getTime() } },
    defaultLimit: DEFAULT_PAGE_SIZE })

  // Issue 9257 — the global severity filter is applied before `useCardData`
  // sees the items, so `useCardData`'s internal page-reset effect (which only
  // fires on its own search/cluster filter changes) never triggered when the
  // severity filter changed. That left users on a stale page (e.g. page 3 of
  // a list that now has 1 page). Track the external filter inputs in a ref
  // and reset to page 1 only on the cycle where they actually change, so we
  // don't snap the page back to 1 on every render (useCardData recreates
  // `goToPage` each render).
  const RESET_TO_FIRST_PAGE = 1
  const externalFilterKey = `${isAllSeveritiesSelected ? 'all' : selectedSeverities.join(',')}|${showAcknowledged}`
  const lastExternalFilterKeyRef = useRef(externalFilterKey)
  useEffect(() => {
    if (lastExternalFilterKeyRef.current !== externalFilterKey) {
      lastExternalFilterKeyRef.current = externalFilterKey
      goToPage(RESET_TO_FIRST_PAGE)
    }
  })

  const handleAlertClick = (alert: Alert) => {
    if (alert.cluster) {
      drillToAlert(alert.cluster, alert.namespace, alert.ruleName, {
        severity: alert.severity,
        state: alert.status,
        message: alert.message,
        startsAt: alert.firedAt,
        labels: alert.details?.labels as Record<string, string> || {},
        annotations: alert.details?.annotations as Record<string, string> || {},
        source: alert.details?.source as string })
    }
  }

  const handleAIDiagnose = (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation()
    runAIDiagnosis(alertId)
  }

  const handleAcknowledge = (e: React.MouseEvent, alertIds: string[]) => {
    e.stopPropagation()
    acknowledgeAlerts(alertIds)
  }

  // Check if a mission exists for an alert
  const getMissionForAlert = (alert: Alert) => {
    if (!alert.aiDiagnosis?.missionId) return null
    return missions.find(m => m.id === alert.aiDiagnosis?.missionId) || null
  }

  // Open mission sidebar for an alert
  const handleOpenMission = (e: React.MouseEvent, alert: Alert) => {
    e.stopPropagation()
    const mission = getMissionForAlert(alert)
    if (mission) {
      setActiveMission(mission.id)
      openSidebar()
    }
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header with controls — uses @container queries so layout
           responds to card width, not viewport width */}
      <div className="mb-3 flex flex-col gap-2 shrink-0 @lg:flex-row @lg:items-start @lg:justify-between">
        <div className="flex flex-wrap items-start gap-2">
          {stats.firing > 0 && (
            <StatusBadge color="red" variant="outline" rounded="full">
              {t('activeAlerts.firingCount', { count: stats.firing })}
            </StatusBadge>
          )}
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClustersForFilter.length}
            </span>
          )}
          {/* Browser notification verification indicator */}
          <NotificationVerifyIndicator />
          {/* Do Not Disturb toggle */}
          <div className="relative">
            <button
              onClick={() => dnd.isActive ? dnd.clearDND() : setShowDNDMenu(!showDNDMenu)}
              className={`flex items-center gap-1 px-1.5 py-1 text-xs rounded-lg border transition-colors ${
                dnd.isActive
                  ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400'
                  : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
              }`}
              title={dnd.isActive
                ? `Notifications paused${dnd.remaining > 0 ? ` (${formatRemaining(dnd.remaining)})` : ''} — click to resume`
                : 'Pause notifications'}
            >
              {dnd.isActive ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
              {dnd.isActive && dnd.remaining > 0 && (
                <span className="text-[10px]">{formatRemaining(dnd.remaining)}</span>
              )}
            </button>
            {showDNDMenu && !dnd.isActive && (
              // Issue 9257 — same hardcoded-dark-hex fix as the snooze menu:
              // use the themed `bg-card` token so light mode isn't broken.
              <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[160px]"
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                  e.preventDefault()
                  const items = e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled])')
                  const idx = Array.from(items).indexOf(document.activeElement as HTMLElement)
                  if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus()
                  else items[Math.max(idx - 1, 0)]?.focus()
                }}
              >
                {([
                  ['1h', 'For 1 hour'],
                  ['4h', 'For 4 hours'],
                  ['tomorrow', 'Until tomorrow 8am'],
                ] as [TimedDuration, string][]).map(([duration, label]) => (
                  <button
                    key={duration}
                    onClick={() => { dnd.setTimedDND(duration); setShowDNDMenu(false) }}
                    className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-muted/50 transition-colors"
                  >
                    {label}
                  </button>
                ))}
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => { dnd.setManualDND(true); setShowDNDMenu(false) }}
                  className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-muted/50 transition-colors"
                >
                  Until I turn it off
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full flex-col items-stretch gap-2 @lg:w-auto @lg:min-w-[18rem] @lg:max-w-[20rem] @lg:items-end">
          <CardSearchInput
            value={localSearch}
            onChange={setLocalSearch}
            placeholder={t('activeAlerts.searchAlerts')}
            className="mb-0 w-full"
          />
          <div className="flex flex-wrap items-start gap-2 @lg:justify-end">
            {/* 1. Ack'd toggle */}
            <button
              onClick={() => setShowAcknowledged(!showAcknowledged)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                showAcknowledged
                  ? 'bg-green-500/20 border-green-500/30 text-green-400'
                  : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
              }`}
              title={showAcknowledged ? t('activeAlerts.hideAcknowledged') : t('activeAlerts.showAcknowledged')}
            >
              {showAcknowledged ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span>{t('activeAlerts.ackd')}</span>
              {acknowledgedAlerts.length > 0 && (
                <StatusBadge color="green" size="xs" rounded="full" className="ml-0.5">
                  {acknowledgedAlerts.length}
                </StatusBadge>
              )}
            </button>
            {/* 2. Cluster Filter */}
            <CardClusterFilter
              availableClusters={availableClustersForFilter}
              selectedClusters={localClusterFilter}
              onToggle={toggleClusterFilter}
              onClear={clearClusterFilter}
              isOpen={showClusterFilter}
              setIsOpen={setShowClusterFilter}
              containerRef={clusterFilterRef}
              minClusters={1}
            />
            {/* 3. CardControls */}
            <CardControls
              limit={itemsPerPage}
              onLimitChange={setItemsPerPage}
              sortBy={sortBy}
              onSortChange={setSortBy}
              sortOptions={[
                { value: 'severity', label: t('activeAlerts.sortSeverity') },
                { value: 'time', label: t('activeAlerts.sortTime') },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <AlertStatsRow critical={stats.critical} warning={stats.warning} acknowledged={stats.acknowledged} />

      {/* Alerts List */}
      {displayedAlerts.length === 0 ? (
        <div ref={containerRef} className="flex-1 overflow-y-auto min-h-card-content" style={containerStyle}>
          <div className="rounded-lg border border-border/50 bg-secondary/10 p-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t('activeAlerts.noActiveAlerts')}</p>
                <p className="text-xs text-muted-foreground">{t('activeAlerts.allSystemsOperational')}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <VirtualizedList
          items={displayedAlerts}
          estimateSize={() => ALERT_ROW_ESTIMATED_HEIGHT_PX}
          overscan={ALERT_LIST_OVERSCAN_COUNT}
          itemGap={ALERT_LIST_ITEM_GAP_PX}
          scrollRef={containerRef}
          className="flex-1 overflow-y-auto"
          style={containerStyle}
          getItemKey={(alert) => `${alert.id}-${alert.duplicateCount}`}
          renderItem={(alert) => (
            <AlertListItem
              key={alert.id}
              alert={alert}
              alertIds={alert.alertIds}
              duplicateCount={alert.duplicateCount}
              mission={getMissionForAlert(alert)}
              onAlertClick={handleAlertClick}
              onAcknowledge={handleAcknowledge}
              onAIDiagnose={handleAIDiagnose}
              onOpenMission={handleOpenMission}
            />
          )}
        />
      )}

      {/* Pagination */}
      {needsPagination && itemsPerPage !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : DEFAULT_PAGE_SIZE}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}
