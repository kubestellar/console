import { useTranslation } from 'react-i18next'
import { useToast } from '../ui/Toast'
import { agentFetch } from '../../hooks/mcp/shared'
import { LOCAL_AGENT_HTTP_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'

export interface UseClusterMutationsParams {
  isConnected: boolean
  refetch: () => void
}

/**
 * Encapsulates the network mutations triggered from the Clusters page:
 * renaming a kubeconfig context and removing an offline cluster's context.
 * Extracted from Clusters.tsx (#21617) to reduce the component's hook count
 * and line count.
 */
export function useClusterMutations({ isConnected, refetch }: UseClusterMutationsParams) {
  const { t } = useTranslation()
  const { showToast } = useToast()

  const handleRenameContext = async (oldName: string, newName: string) => {
    if (!isConnected) throw new Error(t('cluster.renameNoAgent'))
    // Use agentFetch so the Authorization: Bearer <KC_AGENT_TOKEN> header
    // is injected — plain fetch() is rejected with 401 when the agent has
    // a token configured (#6133).
    const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/rename-context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName, newName }),
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string }
      // Fall back to HTTP status so users see e.g. "HTTP 401: Unauthorized"
      // instead of a silent generic error when the body has no message.
      const fallback = `HTTP ${response.status}: ${response.statusText || 'Failed to rename context'}`
      throw new Error(data.error || data.message || fallback)
    }
    refetch()
  }

  /**
   * Remove an offline cluster's kubeconfig context (#5901).
   * Backend: `RemoveContext` in pkg/k8s/client.go (added in #5658). The agent
   * exposes it at POST /kubeconfig/remove on the localhost-only HTTP server.
   *
   * Uses agentFetch() to inject the KC_AGENT_TOKEN Authorization header;
   * without this the kc-agent rejects the request with 401 Unauthorized
   * whenever a token is configured, which manifested as a silent "Failed
   * to remove cluster from kubeconfig" in the UI (#6133).
   */
  const handleRemoveCluster = async (contextName: string) => {
    if (!isConnected) throw new Error(t('cluster.removeClusterNoAgent'))
    const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/kubeconfig/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: contextName }),
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
    if (!response.ok) {
      // #6293: check for the 404-means-stale-agent case BEFORE attempting
      // to parse the body. An old kc-agent returns a plain-text Go
      // default 404 ("404 page not found") which is not JSON — reading
      // it first would be a wasted round-trip. Same reason #6288 added
      // the status-specific branch in the first place.
      if (response.status === 404) {
        throw new Error(t('cluster.removeClusterAgentTooOld'))
      }
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string }
      // Always surface the HTTP status if the body has no structured error,
      // so the user sees "HTTP 401: Unauthorized" instead of the generic
      // fallback — this was the root cause of #6133 being unactionable.
      const fallback = `HTTP ${response.status}: ${response.statusText || t('cluster.removeClusterError')}`
      throw new Error(data.error || data.message || fallback)
    }
    showToast(t('cluster.removeClusterSuccess', { name: contextName }), 'success')
    refetch()
  }

  return { handleRenameContext, handleRemoveCluster }
}
