import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAlerts } from '../../hooks/useAlerts'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useMissions } from '../../hooks/useMissions'
import { useMobile } from '../../hooks/useMobile'
import { useModalState } from '../../lib/modals'
import { groupAlertsForDisplay, type GroupedAlert } from '../../lib/alerts/groupAlertsForDisplay'
import { filterAndSortAlerts } from './AlertBadge.utils'
import type { AlertSeverity } from '../../types/alerts'
import { ROUTES } from '../../config/routes'

/**
 * Encapsulates all data-fetching, state, and event handlers for AlertBadge,
 * reducing the component to 2 hook calls (useTranslation + useAlertBadge).
 */
export function useAlertBadge() {
  const navigate = useNavigate()
  const { activeAlerts, stats, acknowledgeAlerts, runAIDiagnosis } = useAlerts()
  const { drillToCluster } = useDrillDownActions()
  const { missions, setActiveMission, openSidebar } = useMissions()
  const { isMobile } = useMobile()
  const { isOpen, close, toggle } = useModalState()
  const [searchQuery, setSearchQuery] = useState('')
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all')
  const [selectedAlertIds, setSelectedAlertIds] = useState<Set<string>>(new Set())
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        close()
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, close])

  const filteredAlerts = useMemo(
    () => filterAndSortAlerts(activeAlerts, searchQuery, severityFilter),
    [activeAlerts, searchQuery, severityFilter],
  )

  const displayedAlerts = useMemo(() => groupAlertsForDisplay(filteredAlerts), [filteredAlerts])

  const getMissionForAlert = (alert: GroupedAlert) => {
    if (!alert.aiDiagnosis?.missionId) return null
    return missions.find(m => m.id === alert.aiDiagnosis?.missionId) || null
  }

  const handleOpenMission = (e: React.MouseEvent, alert: GroupedAlert) => {
    e.stopPropagation()
    const mission = getMissionForAlert(alert)
    if (mission) {
      setActiveMission(mission.id)
      openSidebar()
      close()
    }
  }

  const handleAlertClick = (alert: GroupedAlert) => {
    close()
    if (alert.cluster) {
      drillToCluster(alert.cluster, { alert })
    }
  }

  const handleAcknowledge = (e: React.MouseEvent, alertIds: string[]) => {
    e.stopPropagation()
    acknowledgeAlerts(alertIds)
    setSelectedAlertIds(prev => {
      const next = new Set(prev)
      for (const id of alertIds) next.delete(id)
      return next
    })
  }

  const handleDiagnose = (e: React.MouseEvent | React.KeyboardEvent<HTMLDivElement>, alertId: string) => {
    e.stopPropagation()
    runAIDiagnosis(alertId)
    close()
  }

  const isGroupSelected = (alertIds: string[]) => alertIds.every(id => selectedAlertIds.has(id))

  const toggleAlertSelection = (e: React.MouseEvent, alertIds: string[]) => {
    e.stopPropagation()
    setSelectedAlertIds(prev => {
      const next = new Set(prev)
      const shouldDeselect = alertIds.every(id => next.has(id))
      for (const id of alertIds) {
        if (shouldDeselect) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  const unacknowledgedDisplayedIds = displayedAlerts.flatMap(alert =>
    alert.acknowledgedAt ? [] : alert.alertIds,
  )

  const handleSelectAll = () => setSelectedAlertIds(new Set(unacknowledgedDisplayedIds))
  const handleDeselectAll = () => setSelectedAlertIds(new Set())

  const handleAcknowledgeSelected = () => {
    if (selectedAlertIds.size > 0) {
      acknowledgeAlerts(Array.from(selectedAlertIds))
      setSelectedAlertIds(new Set())
    }
  }

  const handleOpenAlertsPage = () => {
    close()
    navigate(ROUTES.ALERTS)
  }

  const allSelected =
    unacknowledgedDisplayedIds.length > 0 &&
    unacknowledgedDisplayedIds.every(id => selectedAlertIds.has(id))
  const someSelected = unacknowledgedDisplayedIds.some(id => selectedAlertIds.has(id))

  const getBadgeColor = () => {
    if (stats.critical > 0) return 'bg-red-500'
    if (stats.warning > 0) return 'bg-orange-500'
    if (stats.info > 0) return 'bg-blue-500'
    return 'bg-gray-500 dark:bg-gray-400'
  }

  return {
    isOpen,
    close,
    toggle,
    isMobile,
    stats,
    dropdownRef,
    searchQuery,
    setSearchQuery,
    severityFilter,
    setSeverityFilter,
    selectedAlertIds,
    displayedAlerts,
    getMissionForAlert,
    handleOpenMission,
    handleAlertClick,
    handleAcknowledge,
    handleDiagnose,
    isGroupSelected,
    toggleAlertSelection,
    unacknowledgedDisplayedIds,
    handleSelectAll,
    handleDeselectAll,
    handleAcknowledgeSelected,
    handleOpenAlertsPage,
    allSelected,
    someSelected,
    getBadgeColor,
  }
}
