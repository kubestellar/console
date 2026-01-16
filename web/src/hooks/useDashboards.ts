import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

export interface Dashboard {
  id: string
  name: string
  is_default?: boolean
  created_at?: string
  updated_at?: string
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
    } catch (err) {
      console.error('Failed to load dashboards:', err)
      setError('Failed to load dashboards')
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
      console.error('Failed to create dashboard:', err)
      throw err
    }
  }, [])

  const updateDashboard = useCallback(async (id: string, updates: Partial<Dashboard>) => {
    try {
      const { data } = await api.put<Dashboard>(`/api/dashboards/${id}`, updates)
      setDashboards((prev) => prev.map((d) => (d.id === id ? data : d)))
      return data
    } catch (err) {
      console.error('Failed to update dashboard:', err)
      throw err
    }
  }, [])

  const deleteDashboard = useCallback(async (id: string) => {
    try {
      await api.delete(`/api/dashboards/${id}`)
      setDashboards((prev) => prev.filter((d) => d.id !== id))
    } catch (err) {
      console.error('Failed to delete dashboard:', err)
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
      console.error('Failed to move card:', err)
      throw err
    }
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
  }
}
