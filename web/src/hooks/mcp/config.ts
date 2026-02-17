import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../../lib/api'
import { fetchSSE } from '../../lib/sseClient'
import { reportAgentDataSuccess, isAgentUnavailable } from '../useLocalAgent'
import { isDemoMode } from '../../lib/demoMode'
import { useDemoMode } from '../useDemoMode'
import { registerRefetch } from '../../lib/modeTransition'
import { STORAGE_KEY_TOKEN } from '../../lib/constants'
import { LOCAL_AGENT_URL } from './shared'
import type { ConfigMap, Secret, ServiceAccount } from './types'

export function useConfigMaps(cluster?: string, namespace?: string) {
  const [configmaps, setConfigMaps] = useState<ConfigMap[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const refetch = useCallback(async () => {
    // If demo mode is enabled, use demo data
    if (isDemoMode()) {
      const demoConfigMaps = getDemoConfigMaps().filter(cm =>
        (!cluster || cm.cluster === cluster) && (!namespace || cm.namespace === namespace)
      )
      setConfigMaps(demoConfigMaps)
      setIsLoading(false)
      setError(null)
      return
    }
    setIsLoading(true)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(`${LOCAL_AGENT_URL}/configmaps?${params}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const data = await response.json()
          setConfigMaps(data.configmaps || [])
          setError(null)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch {
        // Fall through to API
      }
    }
    // Try SSE streaming for progressive display
    const token = localStorage.getItem(STORAGE_KEY_TOKEN)
    if (token && token !== 'demo-token') {
      try {
        const sseParams: Record<string, string> = {}
        if (cluster) sseParams.cluster = cluster
        if (namespace) sseParams.namespace = namespace
        const accumulated: ConfigMap[] = []
        const result = await fetchSSE<ConfigMap>({
          url: '/api/mcp/configmaps/stream',
          params: sseParams,
          itemsKey: 'configmaps',
          onClusterData: (_clusterName, items) => {
            accumulated.push(...items)
            setConfigMaps([...accumulated])
            setIsLoading(false)
          },
        })
        setConfigMaps(result)
        setError(null)
        setIsLoading(false)
        return
      } catch {
        // SSE failed, fall through to REST
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ configmaps: ConfigMap[] }>(`/api/mcp/configmaps?${params}`)
      setConfigMaps(data.configmaps || [])
      setError(null)
    } catch {
      // Don't show error - ConfigMaps are optional
      setError(null)
      setConfigMaps(getDemoConfigMaps().filter(cm =>
        (!cluster || cm.cluster === cluster) && (!namespace || cm.namespace === namespace)
      ))
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`configmaps:${cluster || 'all'}:${namespace || 'all'}`, refetch)
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

  return { configmaps, isLoading, error, refetch }
}

// Hook to get Secrets
export function useSecrets(cluster?: string, namespace?: string) {
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const refetch = useCallback(async () => {
    if (isDemoMode()) {
      const demoSecrets = getDemoSecrets().filter(s =>
        (!cluster || s.cluster === cluster) && (!namespace || s.namespace === namespace)
      )
      setSecrets(demoSecrets)
      setIsLoading(false)
      setError(null)
      return
    }
    setIsLoading(true)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(`${LOCAL_AGENT_URL}/secrets?${params}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const data = await response.json()
          setSecrets(data.secrets || [])
          setError(null)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch {
        // Fall through to API
      }
    }
    // Try SSE streaming for progressive display
    const token = localStorage.getItem(STORAGE_KEY_TOKEN)
    if (token && token !== 'demo-token') {
      try {
        const sseParams: Record<string, string> = {}
        if (cluster) sseParams.cluster = cluster
        if (namespace) sseParams.namespace = namespace
        const accumulated: Secret[] = []
        const result = await fetchSSE<Secret>({
          url: '/api/mcp/secrets/stream',
          params: sseParams,
          itemsKey: 'secrets',
          onClusterData: (_clusterName, items) => {
            accumulated.push(...items)
            setSecrets([...accumulated])
            setIsLoading(false)
          },
        })
        setSecrets(result)
        setError(null)
        setIsLoading(false)
        return
      } catch {
        // SSE failed, fall through to REST
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ secrets: Secret[] }>(`/api/mcp/secrets?${params}`)
      setSecrets(data.secrets || [])
      setError(null)
    } catch {
      // Don't show error - Secrets are optional
      setError(null)
      setSecrets(getDemoSecrets().filter(s =>
        (!cluster || s.cluster === cluster) && (!namespace || s.namespace === namespace)
      ))
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`secrets:${cluster || 'all'}:${namespace || 'all'}`, refetch)
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

  return { secrets, isLoading, error, refetch }
}

// Hook to get service accounts
export function useServiceAccounts(cluster?: string, namespace?: string) {
  const [serviceAccounts, setServiceAccounts] = useState<ServiceAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const refetch = useCallback(async () => {
    if (isDemoMode()) {
      const demoSAs = getDemoServiceAccounts().filter(sa =>
        (!cluster || sa.cluster === cluster) && (!namespace || sa.namespace === namespace)
      )
      setServiceAccounts(demoSAs)
      setIsLoading(false)
      setError(null)
      return
    }
    setIsLoading(true)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(`${LOCAL_AGENT_URL}/serviceaccounts?${params}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const data = await response.json()
          setServiceAccounts(data.serviceaccounts || [])
          setError(null)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch {
        // Fall through to API
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ serviceAccounts: ServiceAccount[] }>(`/api/mcp/serviceaccounts?${params}`)
      setServiceAccounts(data.serviceAccounts || [])
      setError(null)
    } catch {
      // Don't show error - ServiceAccounts are optional
      setError(null)
      setServiceAccounts(getDemoServiceAccounts().filter(sa =>
        (!cluster || sa.cluster === cluster) && (!namespace || sa.namespace === namespace)
      ))
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`serviceaccounts:${cluster || 'all'}:${namespace || 'all'}`, refetch)
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

function getDemoConfigMaps(): ConfigMap[] {
  return [
    { name: 'kube-root-ca.crt', namespace: 'default', cluster: 'prod-east', dataCount: 1, age: '45d' },
    { name: 'app-config', namespace: 'production', cluster: 'prod-east', dataCount: 5, age: '30d' },
    { name: 'nginx-config', namespace: 'web', cluster: 'prod-east', dataCount: 3, age: '25d' },
    { name: 'prometheus-config', namespace: 'monitoring', cluster: 'staging', dataCount: 2, age: '20d' },
    { name: 'grafana-dashboards', namespace: 'monitoring', cluster: 'staging', dataCount: 12, age: '20d' },
    { name: 'model-config', namespace: 'ml', cluster: 'vllm-d', dataCount: 8, age: '15d' },
    { name: 'coredns', namespace: 'kube-system', cluster: 'kind-local', dataCount: 2, age: '7d' },
  ]
}

function getDemoSecrets(): Secret[] {
  return [
    { name: 'default-token', namespace: 'default', cluster: 'prod-east', type: 'kubernetes.io/service-account-token', dataCount: 3, age: '45d' },
    { name: 'db-credentials', namespace: 'data', cluster: 'prod-east', type: 'Opaque', dataCount: 2, age: '40d' },
    { name: 'tls-cert', namespace: 'production', cluster: 'prod-east', type: 'kubernetes.io/tls', dataCount: 2, age: '30d' },
    { name: 'api-keys', namespace: 'production', cluster: 'prod-east', type: 'Opaque', dataCount: 4, age: '30d' },
    { name: 'grafana-admin', namespace: 'monitoring', cluster: 'staging', type: 'Opaque', dataCount: 1, age: '20d' },
    { name: 'ml-api-token', namespace: 'ml', cluster: 'vllm-d', type: 'Opaque', dataCount: 1, age: '15d' },
    { name: 'registry-credentials', namespace: 'default', cluster: 'kind-local', type: 'kubernetes.io/dockerconfigjson', dataCount: 1, age: '7d' },
  ]
}

function getDemoServiceAccounts(): ServiceAccount[] {
  return [
    { name: 'default', namespace: 'default', cluster: 'prod-east', secrets: ['default-token'], age: '45d' },
    { name: 'api-server', namespace: 'production', cluster: 'prod-east', secrets: ['api-server-token'], imagePullSecrets: ['registry-credentials'], age: '30d' },
    { name: 'prometheus', namespace: 'monitoring', cluster: 'staging', secrets: ['prometheus-token'], age: '20d' },
    { name: 'grafana', namespace: 'monitoring', cluster: 'staging', secrets: ['grafana-token'], age: '20d' },
    { name: 'ml-worker', namespace: 'ml', cluster: 'vllm-d', secrets: ['ml-worker-token'], imagePullSecrets: ['registry-credentials'], age: '15d' },
    { name: 'default', namespace: 'kube-system', cluster: 'kind-local', secrets: ['default-token'], age: '7d' },
  ]
}
