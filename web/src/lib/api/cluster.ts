/**
 * api/cluster.ts — Cluster and namespace API operations.
 * Created per issue #19013 to split api.ts by domain.
 */
import { api } from './client'

export interface NamespaceAccessBinding {
  subject: string
  role: string
}

export interface NamespaceAccessResponse {
  bindings: NamespaceAccessBinding[]
}

/**
 * Get namespace access bindings for a specific namespace in a cluster.
 */
export async function getNamespaceAccess(
  cluster: string,
  namespace: string
): Promise<NamespaceAccessResponse> {
  const { data } = await api.get<NamespaceAccessResponse>(
    `/api/namespaces/${encodeURIComponent(namespace)}/access?cluster=${encodeURIComponent(cluster)}`
  )
  return data
}

/**
 * Get list of namespaces from backend.
 */
export async function getNamespaces(): Promise<unknown> {
  const { data } = await api.get('/api/namespaces')
  return data
}
