import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../../lib/api'
import { isDemoMode } from '../../lib/demoMode'
import { useDemoMode } from '../useDemoMode'
import { registerRefetch } from '../../lib/modeTransition'
import type { K8sRole, K8sRoleBinding, K8sServiceAccountInfo } from './types'

// Demo RBAC data for when demo mode is enabled
function getDemoK8sRoles(cluster?: string): K8sRole[] {
  const roles: K8sRole[] = [
    { name: 'admin', cluster: 'prod-east', namespace: 'default', isCluster: false, ruleCount: 12 },
    { name: 'edit', cluster: 'prod-east', namespace: 'default', isCluster: false, ruleCount: 8 },
    { name: 'view', cluster: 'prod-east', namespace: 'default', isCluster: false, ruleCount: 4 },
    { name: 'pod-reader', cluster: 'prod-east', namespace: 'default', isCluster: false, ruleCount: 2 },
    { name: 'cluster-admin', cluster: 'prod-east', isCluster: true, ruleCount: 20 },
    { name: 'cluster-view', cluster: 'prod-east', isCluster: true, ruleCount: 6 },
    { name: 'admin', cluster: 'staging', namespace: 'default', isCluster: false, ruleCount: 12 },
    { name: 'developer', cluster: 'staging', namespace: 'development', isCluster: false, ruleCount: 10 },
    { name: 'cluster-admin', cluster: 'staging', isCluster: true, ruleCount: 20 },
  ]
  return cluster ? roles.filter(r => r.cluster === cluster) : roles
}

function getDemoK8sRoleBindings(cluster?: string, namespace?: string): K8sRoleBinding[] {
  const bindings: K8sRoleBinding[] = [
    {
      name: 'admin-binding',
      cluster: 'prod-east',
      namespace: 'default',
      isCluster: false,
      roleName: 'admin',
      roleKind: 'Role',
      subjects: [
        { kind: 'User', name: 'admin-user' },
        { kind: 'Group', name: 'ops-team' },
      ],
    },
    {
      name: 'developer-binding',
      cluster: 'prod-east',
      namespace: 'default',
      isCluster: false,
      roleName: 'edit',
      roleKind: 'Role',
      subjects: [{ kind: 'Group', name: 'dev-team' }],
    },
    {
      name: 'readonly-binding',
      cluster: 'prod-east',
      namespace: 'default',
      isCluster: false,
      roleName: 'view',
      roleKind: 'Role',
      subjects: [{ kind: 'User', name: 'viewer' }],
    },
    {
      name: 'cluster-admin-binding',
      cluster: 'prod-east',
      isCluster: true,
      roleName: 'cluster-admin',
      roleKind: 'ClusterRole',
      subjects: [{ kind: 'User', name: 'super-admin' }],
    },
    {
      name: 'admin-binding',
      cluster: 'staging',
      namespace: 'default',
      isCluster: false,
      roleName: 'admin',
      roleKind: 'Role',
      subjects: [{ kind: 'ServiceAccount', name: 'deployer', namespace: 'default' }],
    },
  ]

  let result = bindings
  if (cluster) result = result.filter(b => b.cluster === cluster)
  if (namespace) result = result.filter(b => b.namespace === namespace || b.isCluster)
  return result
}

function getDemoK8sServiceAccounts(cluster?: string, namespace?: string): K8sServiceAccountInfo[] {
  const sas: K8sServiceAccountInfo[] = [
    { name: 'default', namespace: 'default', cluster: 'prod-east', secrets: ['default-token'] },
    { name: 'deployer', namespace: 'default', cluster: 'prod-east', secrets: ['deployer-token'], roles: ['admin'] },
    { name: 'monitoring', namespace: 'monitoring', cluster: 'prod-east', secrets: ['monitoring-token'], roles: ['view'] },
    { name: 'default', namespace: 'default', cluster: 'staging', secrets: ['default-token'] },
    { name: 'ci-bot', namespace: 'ci-cd', cluster: 'staging', secrets: ['ci-bot-token'], roles: ['edit'] },
  ]

  let result = sas
  if (cluster) result = result.filter(s => s.cluster === cluster)
  if (namespace) result = result.filter(s => s.namespace === namespace)
  return result
}

// Hook to fetch K8s roles from a cluster
export function useK8sRoles(cluster?: string, namespace?: string, includeSystem = false) {
  const [roles, setRoles] = useState<K8sRole[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const refetch = useCallback(async () => {
    // Demo mode returns demo data
    if (isDemoMode()) {
      setRoles(getDemoK8sRoles(cluster))
      setIsLoading(false)
      setError(null)
      return
    }

    if (!cluster) {
      setRoles([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      if (includeSystem) params.append('includeSystem', 'true')

      const { data } = await api.get<K8sRole[]>(`/api/rbac/roles?${params}`, { timeout: 60000 })
      setRoles(data || [])
      setError(null)
    } catch (err) {
      // Don't show error - roles are optional
      setError(null)
      // Fall back to demo data on error
      setRoles(getDemoK8sRoles(cluster))
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace, includeSystem])

  useEffect(() => {
    refetch()

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`k8s-roles:${cluster || 'all'}:${namespace || 'all'}`, refetch)
    return () => unregisterRefetch()
  }, [refetch, cluster, namespace])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    refetch()
  }, [demoMode, refetch])

  return { roles, isLoading, error, refetch }
}

// Hook to fetch K8s role bindings from a cluster
export function useK8sRoleBindings(cluster?: string, namespace?: string, includeSystem = false) {
  const [bindings, setBindings] = useState<K8sRoleBinding[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const refetch = useCallback(async () => {
    // Demo mode returns demo data
    if (isDemoMode()) {
      setBindings(getDemoK8sRoleBindings(cluster, namespace))
      setIsLoading(false)
      setError(null)
      return
    }

    if (!cluster) {
      setBindings([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      if (includeSystem) params.append('includeSystem', 'true')

      const { data } = await api.get<K8sRoleBinding[]>(`/api/rbac/bindings?${params}`, { timeout: 60000 })
      setBindings(data || [])
      setError(null)
    } catch (err) {
      // Don't show error - role bindings are optional
      setError(null)
      // Fall back to demo data on error
      setBindings(getDemoK8sRoleBindings(cluster, namespace))
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace, includeSystem])

  useEffect(() => {
    refetch()

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`k8s-role-bindings:${cluster || 'all'}:${namespace || 'all'}`, refetch)
    return () => unregisterRefetch()
  }, [refetch, cluster, namespace])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    refetch()
  }, [demoMode, refetch])

  return { bindings, isLoading, error, refetch }
}

// Hook to fetch K8s service accounts for RBAC view
export function useK8sServiceAccounts(cluster?: string, namespace?: string) {
  const [serviceAccounts, setServiceAccounts] = useState<K8sServiceAccountInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const refetch = useCallback(async () => {
    // Demo mode returns demo data
    if (isDemoMode()) {
      setServiceAccounts(getDemoK8sServiceAccounts(cluster, namespace))
      setIsLoading(false)
      setError(null)
      return
    }

    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)

      const { data } = await api.get<K8sServiceAccountInfo[]>(`/api/rbac/service-accounts?${params}`, { timeout: 60000 })
      setServiceAccounts(data || [])
      setError(null)
    } catch (err) {
      // Don't show error - service accounts are optional
      setError(null)
      // Fall back to demo data on error
      setServiceAccounts(getDemoK8sServiceAccounts(cluster, namespace))
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`k8s-service-accounts:${cluster || 'all'}:${namespace || 'all'}`, refetch)
    return () => unregisterRefetch()
  }, [refetch, cluster, namespace])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    refetch()
  }, [demoMode, refetch])

  return { serviceAccounts, isLoading, error, refetch }
}
