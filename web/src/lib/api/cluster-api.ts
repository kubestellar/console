import { authFetch } from './client'
import { withQueryParams } from './utils'

export function listClusterNamespaces(cluster: string, init?: RequestInit) {
  return authFetch(withQueryParams('/api/namespaces', { cluster }), init)
}

export const clusterApi = {
  listClusterNamespaces,
}
