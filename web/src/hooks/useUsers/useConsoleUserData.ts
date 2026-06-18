import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { getDemoMode } from '../useDemoMode'
import { getDemoConsoleUsers, getDemoUserManagementSummary } from './demoData'
import type { ConsoleUser, UserManagementSummary, UserRole } from '../../types/users'

export function useConsoleUsers() {
  const [users, setUsers] = useState<ConsoleUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    if (getDemoMode()) {
      setUsers(getDemoConsoleUsers())
      setIsLoading(false)
      setIsRefreshing(false)
      setError(null)
      return
    }

    setIsRefreshing(true)
    setUsers(prev => {
      if (prev.length === 0) {
        setIsLoading(true)
      }
      return prev
    })
    setError(null)

    try {
      const { data } = await api.get<ConsoleUser[]>('/api/users')
      setUsers(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
      setUsers([])
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const updateUserRole = async (userId: string, role: UserRole) => {
    await api.put(`/api/users/${userId}/role`, { role })
    setUsers(prev => prev.map(user => user.id === userId ? { ...user, role } : user))
    return true
  }

  const deleteUser = async (userId: string) => {
    await api.delete(`/api/users/${userId}`)
    setUsers(prev => prev.filter(user => user.id !== userId))
    return true
  }

  return { users, isLoading, isRefreshing, error, refetch: fetchUsers, updateUserRole, deleteUser }
}

export function useUserManagementSummary() {
  const [summary, setSummary] = useState<UserManagementSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSummary = useCallback(async () => {
    if (getDemoMode()) {
      setSummary(getDemoUserManagementSummary())
      setIsLoading(false)
      setIsRefreshing(false)
      setError(null)
      return
    }

    setIsRefreshing(true)
    setSummary(prev => {
      if (prev === null) {
        setIsLoading(true)
      }
      return prev
    })
    setError(null)

    try {
      const { data } = await api.get<UserManagementSummary>('/api/users/summary')
      setSummary(data)
    } catch {
      setSummary(getDemoUserManagementSummary())
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  return { summary, isLoading, isRefreshing, error, refetch: fetchSummary }
}
