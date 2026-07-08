import { useState, useEffect, useCallback } from 'react'
import {
  DISTRIBUTION_STORAGE_KEY,
  NONE_SENTINEL,
} from './constants'
import { loadStoredSelection } from './utils'

export interface UseDistributionFilterReturn {
  rawSelectedDistributions: string[]
  selectedDistributions: string[]
  setSelectedDistributions: (distributions: string[]) => void
  toggleDistribution: (distribution: string) => void
  selectAllDistributions: () => void
  deselectAllDistributions: () => void
  isAllDistributionsSelected: boolean
  isDistributionsFiltered: boolean
  effectiveSelectedDistributions: string[]
}

export function useDistributionFilter(availableDistributions: string[]): UseDistributionFilterReturn {
  const [selectedDistributions, setSelectedDistributionsState] = useState<string[]>(
    () => loadStoredSelection(DISTRIBUTION_STORAGE_KEY)
  )

  // Reconcile selected distributions against available ones; drop stale entries
  useEffect(() => {
    if (selectedDistributions.length === 0 || availableDistributions.length === 0) return
    if (selectedDistributions.includes(NONE_SENTINEL)) return
    const validSelections = selectedDistributions.filter(d => availableDistributions.includes(d))
    if (validSelections.length !== selectedDistributions.length) {
      setSelectedDistributionsState(validSelections.length === 0 ? [] : validSelections)
    }
  }, [availableDistributions, selectedDistributions])

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(DISTRIBUTION_STORAGE_KEY, JSON.stringify(selectedDistributions.length === 0 ? null : selectedDistributions))
  }, [selectedDistributions])

  const toggleDistribution = useCallback((distribution: string) => {
    setSelectedDistributionsState(prev => {
      if (prev.length === 0) {
        return availableDistributions.filter(d => d !== distribution)
      }
      if (prev.includes(distribution)) {
        const next = prev.filter(d => d !== distribution)
        return next.length === 0 ? [] : next
      } else {
        const next = [...prev, distribution]
        return next.length === availableDistributions.length ? [] : next
      }
    })
  }, [availableDistributions])

  const setSelectedDistributions = useCallback((distributions: string[]) => {
    setSelectedDistributionsState(distributions)
  }, [])

  const selectAllDistributions = useCallback(() => setSelectedDistributionsState([]), [])
  const deselectAllDistributions = useCallback(() => setSelectedDistributionsState([NONE_SENTINEL]), [])

  const isAllDistributionsSelected = selectedDistributions.length === 0
  const isDistributionsFiltered = !isAllDistributionsSelected
  const effectiveSelectedDistributions = isAllDistributionsSelected ? availableDistributions : selectedDistributions

  return {
    rawSelectedDistributions: selectedDistributions,
    selectedDistributions: effectiveSelectedDistributions,
    setSelectedDistributions,
    toggleDistribution,
    selectAllDistributions,
    deselectAllDistributions,
    isAllDistributionsSelected,
    isDistributionsFiltered,
    effectiveSelectedDistributions,
  }
}
