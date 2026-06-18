import { useState, useEffect, useCallback, useMemo } from 'react'
import { dashboardApi } from '../lib/api/dashboard-api'
import { emitDashboardCreated, emitDashboardDeleted, emitDashboardImported, emitDashboardExported } from '../lib/analytics'

export interface DashboardCard {
  id: string
  card_type: string
  title?: string
  config: Record<string, unknown>
  position: { x: number; y: number; w: number; h: number }
}

export interface Dashboard {
  id: string
  name: string
  is_default?: boolean
  created_at?: string
  updated_at?: string
  cards?: DashboardCard[]
}

export function useDashboards() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDashboards = useCallback(async () => {
    try {
      setIsLoading(true)
      const { data } = await dashboardApi.listDashboards<Dashboard>()
      setDashboards(Array.isArray(data) ? data : [])
      setError(null)
    } catch {
      // Silently fail - backend unavailability is expected in demo mode
      // The UI will work with localStorage-only persistence
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDashboards()
  }, [loadDashboards])

  const createDashboard = useCallback(async (name: string, isDefault?: boolean) => {
    const { data } = await dashboardApi.createDashboard<Dashboard>(name, isDefault)
    setDashboards((prev) => [...prev, data])
    emitDashboardCreated(name)
    return data
  }, [])

  const updateDashboard = useCallback(async (id: string, updates: Partial<Dashboard>) => {
    const { data } = await dashboardApi.updateDashboard<Dashboard>(id, updates)
    setDashboards((prev) => prev.map((d) => (d.id === id ? data : d)))
    return data
  }, [])

  const deleteDashboard = useCallback(async (id: string) => {
    await dashboardApi.deleteDashboard(id)
    setDashboards((prev) => prev.filter((d) => d.id !== id))
    emitDashboardDeleted()
  }, [])

  const moveCardToDashboard = useCallback(async (cardId: string, targetDashboardId: string) => {
    const { data } = await dashboardApi.moveCardToDashboard(cardId, targetDashboardId)
    return data
  }, [])

  const getDashboardWithCards = useCallback(async (dashboardId: string): Promise<Dashboard | null> => {
    try {
      const { data } = await dashboardApi.getDashboard<Dashboard>(dashboardId)
      return data
    } catch {
      // Silently fail - backend may be unavailable in demo mode
      return null
    }
  }, [])

  const getAllDashboardsWithCards = useCallback(async (): Promise<Dashboard[]> => {
    try {
      const { data: dashboardList } = await dashboardApi.listDashboards<Dashboard>()
      if (!dashboardList || dashboardList.length === 0) return []

      // Fetch cards for each dashboard
      const dashboardsWithCards = await Promise.all(
        dashboardList.map(async (d) => {
          const details = await getDashboardWithCards(d.id)
          return details || d
        })
      )
      return dashboardsWithCards
    } catch {
      // Silently fail - backend may be unavailable in demo mode
      return []
    }
  }, [getDashboardWithCards])

  const exportDashboard = useCallback(async (dashboardId: string) => {
    const { data } = await dashboardApi.exportDashboard(dashboardId)
    emitDashboardExported()
    return data
  }, [])

  const importDashboard = useCallback(async (exportJson: unknown) => {
    const { data } = await dashboardApi.importDashboard<Dashboard>(exportJson)
    if (data) {
      setDashboards((prev) => [...prev, data])
    }
    emitDashboardImported()
    return data
  }, [])

  return useMemo(() => ({
    dashboards,
    isLoading,
    error,
    loadDashboards,
    createDashboard,
    updateDashboard,
    deleteDashboard,
    moveCardToDashboard,
    getDashboardWithCards,
    getAllDashboardsWithCards,
    exportDashboard,
    importDashboard,
  }), [
    dashboards,
    isLoading,
    error,
    loadDashboards,
    createDashboard,
    updateDashboard,
    deleteDashboard,
    moveCardToDashboard,
    getDashboardWithCards,
    getAllDashboardsWithCards,
    exportDashboard,
    importDashboard,
  ])
}
