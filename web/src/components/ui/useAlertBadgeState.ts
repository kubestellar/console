import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ALERT_SEVERITY_ORDER, type Alert, type AlertSeverity } from '../../types/alerts'
import { groupAlertsForDisplay } from '../../lib/alerts/groupAlertsForDisplay'

interface UseAlertBadgeStateArgs {
  activeAlerts: Alert[]
  acknowledgeAlerts: (alertIds: string[]) => void
  close: () => void
  isOpen: boolean
}

export interface UseAlertBadgeStateResult {
  dropdownRef: React.RefObject<HTMLDivElement | null>
  searchQuery: string
  setSearchQuery: (value: string) => void
  severityFilter: AlertSeverity | 'all'
  setSeverityFilter: (value: AlertSeverity | 'all') => void
  selectedAlertIds: Set<string>
  displayedAlerts: ReturnType<typeof groupAlertsForDisplay>
  unacknowledgedDisplayedIds: string[]
  allSelected: boolean
  someSelected: boolean
  isGroupSelected: (alertIds: string[]) => boolean
  toggleAlertSelection: (event: React.MouseEvent, alertIds: string[]) => void
  handleAcknowledge: (event: React.MouseEvent, alertIds: string[]) => void
  handleSelectAll: () => void
  handleDeselectAll: () => void
  handleAcknowledgeSelected: () => void
}

export function useAlertBadgeState({
  activeAlerts,
  acknowledgeAlerts,
  close,
  isOpen,
}: UseAlertBadgeStateArgs): UseAlertBadgeStateResult {
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
      if (event.key === 'Escape') {
        close()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [close, isOpen])

  const filteredAlerts = useMemo(() => {
    const normalizedAlerts = [...(activeAlerts || [])]

    let result = normalizedAlerts
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(alert => (
        alert.ruleName.toLowerCase().includes(query)
        || alert.message.toLowerCase().includes(query)
        || (alert.cluster?.toLowerCase() || '').includes(query)
      ))
    }

    if (severityFilter !== 'all') {
      result = result.filter(alert => alert.severity === severityFilter)
    }

    return result.sort((left, right) => {
      const severityDiff = ALERT_SEVERITY_ORDER[left.severity] - ALERT_SEVERITY_ORDER[right.severity]
      if (severityDiff !== 0) return severityDiff
      return new Date(right.firedAt).getTime() - new Date(left.firedAt).getTime()
    })
  }, [activeAlerts, searchQuery, severityFilter])

  const displayedAlerts = useMemo(
    () => groupAlertsForDisplay(filteredAlerts),
    [filteredAlerts],
  )

  const isGroupSelected = useCallback(
    (alertIds: string[]) => alertIds.every(alertId => selectedAlertIds.has(alertId)),
    [selectedAlertIds],
  )

  const toggleAlertSelection = useCallback((event: React.MouseEvent, alertIds: string[]) => {
    event.stopPropagation()
    setSelectedAlertIds(previous => {
      const next = new Set(previous)
      const shouldDeselect = alertIds.every(alertId => next.has(alertId))
      for (const alertId of (alertIds || [])) {
        if (shouldDeselect) {
          next.delete(alertId)
        } else {
          next.add(alertId)
        }
      }
      return next
    })
  }, [])

  const handleAcknowledge = useCallback((event: React.MouseEvent, alertIds: string[]) => {
    event.stopPropagation()
    acknowledgeAlerts(alertIds)
    setSelectedAlertIds(previous => {
      const next = new Set(previous)
      for (const alertId of (alertIds || [])) {
        next.delete(alertId)
      }
      return next
    })
  }, [acknowledgeAlerts])

  const unacknowledgedDisplayedIds = useMemo(
    () => displayedAlerts.flatMap(alert => (alert.acknowledgedAt ? [] : alert.alertIds)),
    [displayedAlerts],
  )

  const handleSelectAll = useCallback(() => {
    setSelectedAlertIds(new Set(unacknowledgedDisplayedIds))
  }, [unacknowledgedDisplayedIds])

  const handleDeselectAll = useCallback(() => {
    setSelectedAlertIds(new Set())
  }, [])

  const handleAcknowledgeSelected = useCallback(() => {
    if (selectedAlertIds.size === 0) return
    acknowledgeAlerts(Array.from(selectedAlertIds))
    setSelectedAlertIds(new Set())
  }, [acknowledgeAlerts, selectedAlertIds])

  const allSelected = useMemo(
    () => unacknowledgedDisplayedIds.length > 0
      && unacknowledgedDisplayedIds.every(id => selectedAlertIds.has(id)),
    [selectedAlertIds, unacknowledgedDisplayedIds],
  )

  const someSelected = useMemo(
    () => unacknowledgedDisplayedIds.some(id => selectedAlertIds.has(id)),
    [selectedAlertIds, unacknowledgedDisplayedIds],
  )

  return {
    dropdownRef,
    searchQuery,
    setSearchQuery,
    severityFilter,
    setSeverityFilter,
    selectedAlertIds,
    displayedAlerts,
    unacknowledgedDisplayedIds,
    allSelected,
    someSelected,
    isGroupSelected,
    toggleAlertSelection,
    handleAcknowledge,
    handleSelectAll,
    handleDeselectAll,
    handleAcknowledgeSelected,
  }
}
