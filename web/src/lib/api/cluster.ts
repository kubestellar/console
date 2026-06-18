/**
 * cluster.ts
 *
 * Cluster-focused API helpers for namespaces and RBAC queries.
 */

import { api, authFetch } from './core'

export interface ClusterQueryOptions {
  cluster: string
  namespace?: string
  includeSystem?: boolean
}

export interface ApiRequestOptions {
  timeout?: number
  signal?: AbortSignal
}

function buildClusterParams({ cluster, namespace, includeSystem }: ClusterQueryOptions): string {
  const params = new URLSearchParams()
  params.append('cluster', cluster)
  if (namespace) params.append('namespace', namespace)
  if (includeSystem) params.append('includeSystem', 'true')
  return params.toString()
}

export function getNamespaces(cluster: string, options?: Pick<ApiRequestOptions, 'signal'>): Promise<Response> {
  return authFetch(`/api/namespaces?cluster=${encodeURIComponent(cluster)}`, options?.signal ? { signal: options.signal } : undefined)
}

export function getRbacRoles<T = unknown>(query: ClusterQueryOptions, options?: ApiRequestOptions): Promise<{ data: T[] }> {
  return api.get<T[]>(`/api/rbac/roles?${buildClusterParams(query)}`, options)
}

export function getRbacRoleBindings<T = unknown>(query: ClusterQueryOptions, options?: ApiRequestOptions): Promise<{ data: T[] }> {
  return api.get<T[]>(`/api/rbac/bindings?${buildClusterParams(query)}`, options)
}

export function getRbacServiceAccounts<T = unknown>(query: ClusterQueryOptions, options?: ApiRequestOptions): Promise<{ data: T[] }> {
  return api.get<T[]>(`/api/rbac/service-accounts?${buildClusterParams(query)}`, options)
}

export function getRbacUsers<T = unknown>(cluster: string, options?: ApiRequestOptions): Promise<{ data: T[] }> {
  return api.get<T[]>(`/api/rbac/users?cluster=${encodeURIComponent(cluster)}`, options)
}
