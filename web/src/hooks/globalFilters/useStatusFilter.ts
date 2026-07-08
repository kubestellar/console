import { useState, useEffect, useCallback } from 'react'
import { emitGlobalStatusFilterChanged } from '../../lib/analytics'
import {
  NONE_SENTINEL,
  STATUS_LEVELS,
  STATUS_STORAGE_KEY,
} from './constants'
import type { StatusLevel } from './types'
import { loadStoredSelection } from './utils'

export interface UseStatusFilterReturn {
  rawSelectedStatuses: StatusLevel[]
  selectedStatuses: StatusLevel[]
  setSelectedStatuses: (statuses: StatusLevel[]) => void
  toggleStatus: (status: StatusLevel) => void
  selectAllStatuses: () => void
  deselectAllStatuses: () => void
  isAllStatusesSelected: boolean
  isStatusesFiltered: boolean
  effectiveSelectedStatuses: StatusLevel[]
}

export function useStatusFilter(): UseStatusFilterReturn {
  const [selectedStatuses, setSelectedStatusesState] = useState<StatusLevel[]>(
    () => loadStoredSelection<StatusLevel>(STATUS_STORAGE_KEY)
  )

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(selectedStatuses.length === 0 ? null : selectedStatuses))
  }, [selectedStatuses])

  const setSelectedStatuses = useCallback((statuses: StatusLevel[]) => {
    setSelectedStatusesState(statuses)
    emitGlobalStatusFilterChanged(statuses.length)
  }, [])

  const toggleStatus = useCallback((status: StatusLevel) => {
    setSelectedStatusesState(prev => {
      if (prev.length === 0) {
        const next = STATUS_LEVELS.filter(s => s !== status)
        emitGlobalStatusFilterChanged(next.length)
        return next
      }
      if (prev.includes(status)) {
        const newSelection = prev.filter(s => s !== status)
        const result = newSelection.length === 0 ? [] : newSelection
        emitGlobalStatusFilterChanged(result.length)
        return result
      } else {
        const newSelection = [...prev, status]
        if (newSelection.length === STATUS_LEVELS.length) {
          emitGlobalStatusFilterChanged(0)
          return []
        }
        emitGlobalStatusFilterChanged(newSelection.length)
        return newSelection
      }
    })
  }, [])

  const selectAllStatuses = useCallback(() => setSelectedStatusesState([]), [])
  const deselectAllStatuses = useCallback(
    () => setSelectedStatusesState([NONE_SENTINEL as StatusLevel]),
    []
  )

  const isAllStatusesSelected = selectedStatuses.length === 0
  const isStatusesFiltered = !isAllStatusesSelected
  const effectiveSelectedStatuses = isAllStatusesSelected ? STATUS_LEVELS : selectedStatuses

  return {
    rawSelectedStatuses: selectedStatuses,
    selectedStatuses: effectiveSelectedStatuses,
    setSelectedStatuses,
    toggleStatus,
    selectAllStatuses,
    deselectAllStatuses,
    isAllStatusesSelected,
    isStatusesFiltered,
    effectiveSelectedStatuses,
  }
}
