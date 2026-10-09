import { useCallback } from 'react'
import { emitGlobalSeverityFilterChanged, emitGlobalStatusFilterChanged } from '../../lib/analytics'
import { NONE_SENTINEL, SEVERITY_LEVELS, STATUS_LEVELS } from './constants'
import type { DispatchFilterSelections } from './filterSelections'
import type { SeverityLevel, StatusLevel } from './types'

/** Severity and status selection callbacks/derived state for the global filters provider. */
export function useSeverityStatusFilters(
  dispatchFilters: DispatchFilterSelections,
  selectedSeverities: SeverityLevel[],
  selectedStatuses: StatusLevel[],
) {
  // Severity filtering — stabilized with useCallback
  const setSelectedSeverities = useCallback((severities: SeverityLevel[]) => {
    dispatchFilters({ severities })
    emitGlobalSeverityFilterChanged(severities.length)
  }, [dispatchFilters])

  const toggleSeverity = useCallback((severity: SeverityLevel) => {
    dispatchFilters(({ severities: prev }) => {
      // If currently "all" (empty), switch to all except this one
      if (prev.length === 0) {
        const next = SEVERITY_LEVELS.filter(s => s !== severity)
        emitGlobalSeverityFilterChanged(next.length)
        return { severities: next }
      }

      if (prev.includes(severity)) {
        // Remove severity - if last one, revert to all
        const newSelection = prev.filter(s => s !== severity)
        const result = newSelection.length === 0 ? [] : newSelection
        emitGlobalSeverityFilterChanged(result.length)
        return { severities: result }
      } else {
        // Add severity
        const newSelection = [...prev, severity]
        // If all severities are now selected, switch to "all" mode
        if (newSelection.length === SEVERITY_LEVELS.length) {
          emitGlobalSeverityFilterChanged(0)
          return { severities: [] }
        }
        emitGlobalSeverityFilterChanged(newSelection.length)
        return { severities: newSelection }
      }
    })
  }, [dispatchFilters])

  const selectAllSeverities = useCallback(() => {
    dispatchFilters({ severities: [] })
  }, [dispatchFilters])

  const deselectAllSeverities = useCallback(() => {
    dispatchFilters({ severities: [NONE_SENTINEL as SeverityLevel] })
  }, [dispatchFilters])

  const isAllSeveritiesSelected = selectedSeverities.length === 0
  const isSeveritiesFiltered = !isAllSeveritiesSelected

  // Get effective selected severities (for filtering)
  const effectiveSelectedSeverities = isAllSeveritiesSelected ? SEVERITY_LEVELS : selectedSeverities

  // Status filtering — stabilized with useCallback
  const setSelectedStatuses = useCallback((statuses: StatusLevel[]) => {
    dispatchFilters({ statuses })
    emitGlobalStatusFilterChanged(statuses.length)
  }, [dispatchFilters])

  const toggleStatus = useCallback((status: StatusLevel) => {
    dispatchFilters(({ statuses: prev }) => {
      // If currently "all" (empty), switch to all except this one
      if (prev.length === 0) {
        const next = STATUS_LEVELS.filter(s => s !== status)
        emitGlobalStatusFilterChanged(next.length)
        return { statuses: next }
      }

      if (prev.includes(status)) {
        // Remove status - if last one, revert to all
        const newSelection = prev.filter(s => s !== status)
        const result = newSelection.length === 0 ? [] : newSelection
        emitGlobalStatusFilterChanged(result.length)
        return { statuses: result }
      } else {
        // Add status
        const newSelection = [...prev, status]
        // If all statuses are now selected, switch to "all" mode
        if (newSelection.length === STATUS_LEVELS.length) {
          emitGlobalStatusFilterChanged(0)
          return { statuses: [] }
        }
        emitGlobalStatusFilterChanged(newSelection.length)
        return { statuses: newSelection }
      }
    })
  }, [dispatchFilters])

  const selectAllStatuses = useCallback(() => {
    dispatchFilters({ statuses: [] })
  }, [dispatchFilters])

  const deselectAllStatuses = useCallback(() => {
    dispatchFilters({ statuses: [NONE_SENTINEL as StatusLevel] })
  }, [dispatchFilters])

  const isAllStatusesSelected = selectedStatuses.length === 0
  const isStatusesFiltered = !isAllStatusesSelected

  // Get effective selected statuses (for filtering)
  const effectiveSelectedStatuses = isAllStatusesSelected ? STATUS_LEVELS : selectedStatuses

  return {
    setSelectedSeverities,
    toggleSeverity,
    selectAllSeverities,
    deselectAllSeverities,
    isAllSeveritiesSelected,
    isSeveritiesFiltered,
    effectiveSelectedSeverities,
    setSelectedStatuses,
    toggleStatus,
    selectAllStatuses,
    deselectAllStatuses,
    isAllStatusesSelected,
    isStatusesFiltered,
    effectiveSelectedStatuses,
  }
}
