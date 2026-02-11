import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

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
      const { data } = await api.get<Dashboard[]>('/api/dashboards')
      setDashboards(data || [])
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
    try {
      const { data } = await api.post<Dashboard>('/api/dashboards', { name, is_default: isDefault })
      setDashboards((prev) => [...prev, data])
      return data
    } catch (err) {
      // Silently fail - backend may be unavailable in demo mode
      throw err
    }
  }, [])

  const updateDashboard = useCallback(async (id: string, updates: Partial<Dashboard>) => {
    try {
      const { data } = await api.put<Dashboard>(`/api/dashboards/${id}`, updates)
      setDashboards((prev) => prev.map((d) => (d.id === id ? data : d)))
      return data
    } catch (err) {
      // Silently fail - backend may be unavailable in demo mode
      throw err
    }
  }, [])

  const deleteDashboard = useCallback(async (id: string) => {
    try {
      await api.delete(`/api/dashboards/${id}`)
      setDashboards((prev) => prev.filter((d) => d.id !== id))
    } catch (err) {
      // Silently fail - backend may be unavailable in demo mode
      throw err
    }
  }, [])

  const moveCardToDashboard = useCallback(async (cardId: string, targetDashboardId: string) => {
    try {
      const { data } = await api.post(`/api/cards/${cardId}/move`, {
        target_dashboard_id: targetDashboardId,
      })
      return data
    } catch (err) {
      // Silently fail - backend may be unavailable in demo mode
      throw err
    }
  }, [])

  const getDashboardWithCards = useCallback(async (dashboardId: string): Promise<Dashboard | null> => {
    try {
      const { data } = await api.get<Dashboard>(`/api/dashboards/${dashboardId}`)
      return data
    } catch {
      // Silently fail - backend may be unavailable in demo mode
      return null
    }
  }, [])

  const getAllDashboardsWithCards = useCallback(async (): Promise<Dashboard[]> => {
    try {
      const { data: dashboardList } = await api.get<Dashboard[]>('/api/dashboards')
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
    const { data } = await api.get(`/api/dashboards/${dashboardId}/export`)
    return data
  }, [])

  const importDashboard = useCallback(async (exportJson: unknown) => {
    const { data } = await api.post<Dashboard>('/api/dashboards/import', exportJson)
    if (data) {
      setDashboards((prev) => [...prev, data])
    }
    return data
  }, [])

  return {
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
  }
}
