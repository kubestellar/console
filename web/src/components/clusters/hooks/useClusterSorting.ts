import { useMemo, useState } from 'react'

interface Cluster {
  name: string
  gpuCount: number
  allocated: number
}

type SortField = 'name' | 'gpuCount' | 'allocated'

export function useClusterSorting(clusters: Cluster[], initialSort: SortField = 'name') {
  const [sortField, setSortField] = useState<SortField>(initialSort)
  const [sortAscending, setSortAscending] = useState(true)

  const sortedClusters = useMemo(() => {
    const sorted = [...clusters].sort((a, b) => {
      let aVal: string | number
      let bVal: string | number

      switch (sortField) {
        case 'name':
          aVal = a.name
          bVal = b.name
          break
        case 'gpuCount':
          aVal = a.gpuCount
          bVal = b.gpuCount
          break
        case 'allocated':
          aVal = a.allocated
          bVal = b.allocated
          break
      }

      if (aVal < bVal) return sortAscending ? -1 : 1
      if (aVal > bVal) return sortAscending ? 1 : -1
      return 0
    })
    return sorted
  }, [clusters, sortField, sortAscending])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAscending(!sortAscending)
    } else {
      setSortField(field)
      setSortAscending(true)
    }
  }

  return {
    sortedClusters,
    sortField,
    sortAscending,
    toggleSort,
  }
}
