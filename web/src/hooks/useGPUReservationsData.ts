import { useMemo } from 'react'
import type { GPUReservation } from './useGPUReservations'
import { useGlobalFilters } from './useGlobalFilters'
import { useAuth } from '../lib/auth'

interface GPUReservationsDataHookProps {
  allReservations: GPUReservation[] | undefined
  showOnlyMine: boolean
  searchTerm: string
}

export function useGPUReservationsData({
  allReservations,
  showOnlyMine,
  searchTerm,
}: GPUReservationsDataHookProps) {
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { user } = useAuth()

  const filteredReservations = useMemo(() => {
    let filtered = allReservations || []
    // Filter by cluster selection
    if (!isAllClustersSelected) {
      filtered = filtered.filter(r => selectedClusters.some(c => r.cluster.startsWith(c)))
    }
    // Filter by user
    if (showOnlyMine && user) {
      const login = user.github_login?.toLowerCase()
      filtered = filtered.filter(r => r.user_name.toLowerCase() === login)
    }
    // Filter by keyword search
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase()
      filtered = filtered.filter(r =>
        (r.title ?? '').toLowerCase().includes(term) ||
        (r.namespace ?? '').toLowerCase().includes(term) ||
        (r.user_name ?? '').toLowerCase().includes(term) ||
        (r.cluster ?? '').toLowerCase().includes(term) ||
        (r.status ?? '').toLowerCase().includes(term) ||
        (r.gpu_type && r.gpu_type.toLowerCase().includes(term)) ||
        (r.gpu_types && r.gpu_types.some(t => t.toLowerCase().includes(term))) ||
        (r.description && r.description.toLowerCase().includes(term)) ||
        (r.notes && r.notes.toLowerCase().includes(term))
      )
    }
    return filtered
  }, [allReservations, showOnlyMine, user, selectedClusters, isAllClustersSelected, searchTerm])

  return { filteredReservations }
}
