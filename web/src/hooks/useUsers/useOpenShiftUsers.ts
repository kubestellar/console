import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { mapSettledWithConcurrency } from '../../lib/utils/concurrency'
import { getDemoOpenShiftUsers } from './demoData'
import type { OpenShiftUser } from '../../types/users'

export function useOpenShiftUsers(cluster?: string) {
  const [users, setUsers] = useState<OpenShiftUser[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    if (!cluster) {
      setUsers([])
      return
    }

    setUsers([])
    setIsLoading(true)
    setError(null)
    try {
      const { data } = await api.get<OpenShiftUser[]>(`/api/openshift/users?cluster=${cluster}`)
      setUsers(Array.isArray(data) ? data : [])
    } catch {
      setUsers(getDemoOpenShiftUsers(cluster))
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  return { users, isLoading, error, refetch: fetchUsers }
}

export function useAllOpenShiftUsers(clusters: Array<{ name: string }>) {
  const [users, setUsers] = useState<OpenShiftUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedClusters, setFailedClusters] = useState<string[]>([])

  const fetchAllUsers = useCallback(async () => {
    if (clusters.length === 0) {
      setUsers([])
      setIsLoading(false)
      return
    }

    setUsers(prev => {
      if (prev.length === 0) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }
      return prev
    })
    setError(null)
    setFailedClusters([])

    const allUsers: OpenShiftUser[] = []
    const failed: string[] = []
    const results = await mapSettledWithConcurrency(clusters, async cluster => {
      try {
        const { data } = await api.get<OpenShiftUser[]>(`/api/openshift/users?cluster=${cluster.name}`)
        return { cluster: cluster.name, users: Array.isArray(data) ? data : [] }
      } catch {
        return { cluster: cluster.name, users: [] as OpenShiftUser[], failed: true }
      }
    })

    results.forEach(result => {
      if (result.status !== 'fulfilled') return
      const { cluster, users: clusterUsers, failed: clusterFailed } = result.value as { cluster: string; users: OpenShiftUser[]; failed?: boolean }
      if (clusterFailed) {
        failed.push(cluster)
        allUsers.push(...getDemoOpenShiftUsers(cluster))
      } else {
        allUsers.push(...clusterUsers)
      }
    })

    setUsers(allUsers)
    setFailedClusters(failed)
    setIsLoading(false)
    setIsRefreshing(false)
  }, [clusters])

  useEffect(() => {
    fetchAllUsers()
  }, [fetchAllUsers])

  return { users, isLoading, isRefreshing, error, failedClusters, refetch: fetchAllUsers }
}
