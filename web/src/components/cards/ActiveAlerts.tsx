import { useState, useMemo, useCallback } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  Server,
} from 'lucide-react'
import { useAlerts } from '../../hooks/useAlerts'
import { StatusBadge } from '../ui/StatusBadge'
import { useGlobalFilters, type SeverityLevel } from '../../hooks/useGlobalFilters'
import { useDrillDown } from '../../hooks/useDrillDown'
import { useMissions } from '../../hooks/useMissions'
import type { Alert, AlertSeverity } from '../../types/alerts'
import { CardControls } from '../ui/CardControls'
import { Pagination } from '../ui/Pagination'
import { useCardData, CardClusterFilter, CardSearchInput } from '../../lib/cards'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'
import { NotificationVerifyIndicator } from './NotificationVerifyIndicator'
import { AlertListItem } from './AlertListItem'

// Stats summary row shown at the top of the alerts card
function AlertStatsRow({ critical, warning, acknowledged }: { critical: number; warning: number; acknowledged: number }) {
  const { t } = useTranslation('cards')
  return (
    <div className="grid grid-cols-3 gap-2 mb-3">
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

/** Default pagination size for the alerts list */
const DEFAULT_PAGE_SIZE = 5

type SortField = 'severity' | 'time'

export function ActiveAlerts() {
  const { t } = useTranslation('cards')
  const { activeAlerts, acknowledgedAlerts, stats, acknowledgeAlert, runAIDiagnosis } = useAlerts()
  const { selectedSeverities, isAllSeveritiesSelected, customFilter } = useGlobalFilters()
  const { isDemoMode } = useDemoMode()

  // Report state to CardWrapper for refresh animation
  useCardLoadingState({
    isLoading: false,
    hasAnyData: true,
    isDemoData: isDemoMode,
  })
  const { open } = useDrillDown()
  const { missions, setActiveMission, openSidebar } = useMissions()

  const [showAcknowledged, setShowAcknowledged] = useState(false)

  // Combine active and acknowledged alerts when toggle is on
  const allAlertsToShow = useMemo(() => {
    if (showAcknowledged) {
      return [...activeAlerts, ...acknowledgedAlerts]
    }
    return activeAlerts
  }, [activeAlerts, acknowledgedAlerts, showAcknowledged])

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
  const severityFilteredAlerts = useMemo(() => {
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
  }, [allAlertsToShow, selectedSeverities, isAllSeveritiesSelected, customFilter])

  const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }

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
      clusterFilterRef,
    },
    sorting: {
      sortBy,
      setSortBy,
    },
    containerRef,
    containerStyle,
  } = useCardData<Alert, SortField>(severityFilteredAlerts, {
    filter: {
      searchFields: ['ruleName', 'message', 'cluster'],
      clusterField: 'cluster',
      storageKey: 'active-alerts',
    },
    sort: {
      defaultField: 'severity',
      defaultDirection: 'asc',
      comparators: {
        severity: (a, b) => {
          const severityDiff = severityOrder[a.severity] - severityOrder[b.severity]
          if (severityDiff !== 0) return severityDiff
          return new Date(b.firedAt).getTime() - new Date(a.firedAt).getTime()
        },
        time: (a, b) => new Date(b.firedAt).getTime() - new Date(a.firedAt).getTime(),
      },
    },
    defaultLimit: DEFAULT_PAGE_SIZE,
  })

  const handleAlertClick = (alert: Alert) => {
    if (alert.cluster) {
      open({
        type: 'cluster',
        title: alert.cluster,
        data: { name: alert.cluster, alert },
      })
    }
  }

  const handleAIDiagnose = (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation()
    runAIDiagnosis(alertId)
  }

  const handleAcknowledge = (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation()
    acknowledgeAlert(alertId)
  }

  // Check if a mission exists for an alert
  const getMissionForAlert = useCallback((alert: Alert) => {
    if (!alert.aiDiagnosis?.missionId) return null
    return missions.find(m => m.id === alert.aiDiagnosis?.missionId) || null
  }, [missions])

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
    <div className="h-full flex flex-col">
      {/* Header with controls */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
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
        </div>

        <div className="flex items-center gap-2">
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
          {/* 4. RefreshButton */}
        </div>
      </div>

      {/* Local Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder={t('activeAlerts.searchAlerts')}
      />

      {/* Stats Row */}
      <AlertStatsRow critical={stats.critical} warning={stats.warning} acknowledged={stats.acknowledged} />

      {/* Alerts List */}
      <div ref={containerRef} className="flex-1 overflow-y-auto space-y-2" style={containerStyle}>
        {displayedAlerts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm">
            <CheckCircle className="w-8 h-8 mb-2 text-green-400" />
            <span>{t('activeAlerts.noActiveAlerts')}</span>
            <span className="text-xs">{t('activeAlerts.allSystemsOperational')}</span>
          </div>
        ) : (
          displayedAlerts.map((alert: Alert) => (
            <AlertListItem
              key={alert.id}
              alert={alert}
              mission={getMissionForAlert(alert)}
              onAlertClick={handleAlertClick}
              onAcknowledge={handleAcknowledge}
              onAIDiagnose={handleAIDiagnose}
              onOpenMission={handleOpenMission}
            />
          ))
        )}
      </div>

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
