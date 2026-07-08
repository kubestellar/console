import { useState, useEffect, useCallback } from 'react'
import { emitGlobalSeverityFilterChanged } from '../../lib/analytics'
import {
  NONE_SENTINEL,
  SEVERITY_LEVELS,
  SEVERITY_STORAGE_KEY,
} from './constants'
import type { SeverityLevel } from './types'
import { loadStoredSelection } from './utils'

export interface UseSeverityFilterReturn {
  rawSelectedSeverities: SeverityLevel[]
  selectedSeverities: SeverityLevel[]
  setSelectedSeverities: (severities: SeverityLevel[]) => void
  toggleSeverity: (severity: SeverityLevel) => void
  selectAllSeverities: () => void
  deselectAllSeverities: () => void
  isAllSeveritiesSelected: boolean
  isSeveritiesFiltered: boolean
  effectiveSelectedSeverities: SeverityLevel[]
}

export function useSeverityFilter(): UseSeverityFilterReturn {
  const [selectedSeverities, setSelectedSeveritiesState] = useState<SeverityLevel[]>(
    () => loadStoredSelection<SeverityLevel>(SEVERITY_STORAGE_KEY)
  )

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(SEVERITY_STORAGE_KEY, JSON.stringify(selectedSeverities.length === 0 ? null : selectedSeverities))
  }, [selectedSeverities])

  const setSelectedSeverities = useCallback((severities: SeverityLevel[]) => {
    setSelectedSeveritiesState(severities)
    emitGlobalSeverityFilterChanged(severities.length)
  }, [])

  const toggleSeverity = useCallback((severity: SeverityLevel) => {
    setSelectedSeveritiesState(prev => {
      if (prev.length === 0) {
        const next = SEVERITY_LEVELS.filter(s => s !== severity)
        emitGlobalSeverityFilterChanged(next.length)
        return next
      }
      if (prev.includes(severity)) {
        const newSelection = prev.filter(s => s !== severity)
        const result = newSelection.length === 0 ? [] : newSelection
        emitGlobalSeverityFilterChanged(result.length)
        return result
      } else {
        const newSelection = [...prev, severity]
        if (newSelection.length === SEVERITY_LEVELS.length) {
          emitGlobalSeverityFilterChanged(0)
          return []
        }
        emitGlobalSeverityFilterChanged(newSelection.length)
        return newSelection
      }
    })
  }, [])

  const selectAllSeverities = useCallback(() => setSelectedSeveritiesState([]), [])
  const deselectAllSeverities = useCallback(
    () => setSelectedSeveritiesState([NONE_SENTINEL as SeverityLevel]),
    []
  )

  const isAllSeveritiesSelected = selectedSeverities.length === 0
  const isSeveritiesFiltered = !isAllSeveritiesSelected
  const effectiveSelectedSeverities = isAllSeveritiesSelected ? SEVERITY_LEVELS : selectedSeverities

  return {
    rawSelectedSeverities: selectedSeverities,
    selectedSeverities: effectiveSelectedSeverities,
    setSelectedSeverities,
    toggleSeverity,
    selectAllSeverities,
    deselectAllSeverities,
    isAllSeveritiesSelected,
    isSeveritiesFiltered,
    effectiveSelectedSeverities,
  }
}
