/**
 * api/agent.ts — Agent and MCP API operations.
 * Created per issue #19013 to split api.ts by domain.
 */
import { api } from './client'

export interface ResourceYAMLResponse {
  yaml: string
}

export interface GitHubEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  download_url?: string
}

export interface BrowseEntry {
  name: string
  path: string
  type: 'file' | 'dir'
}

/**
 * Get YAML representation of a Kubernetes resource via MCP.
 */
export async function getResourceYAML(params: URLSearchParams, signal?: AbortSignal): Promise<string> {
  const { data } = await api.get<ResourceYAMLResponse>(
    `/api/mcp/resource-yaml?${params}`,
    { signal }
  )
  return data.yaml
}

/**
 * Get mission file content.
 */
export async function getMissionFile(path: string): Promise<string> {
  const { data } = await api.get<string>(`/api/missions/file?path=${encodeURIComponent(path)}`)
  return data
}

/**
 * Browse mission entries.
 */
export async function browseMissions(params?: Record<string, string>): Promise<BrowseEntry[]> {
  const query = params ? '?' + new URLSearchParams(params).toString() : ''
  const { data } = await api.get<BrowseEntry[]>(`/api/missions/browse${query}`)
  return data
}

/**
 * Get GitHub repository entries.
 */
export async function getGitHubEntries(apiPath: string, signal?: AbortSignal): Promise<GitHubEntry[]> {
  const { data } = await api.get<GitHubEntry[]>(apiPath, signal ? { signal } : undefined)
  return data
}

/**
 * Submit feedback/feature request.
 */
export async function submitFeatureRequest(request: {
  title: string
  description: string
  target_repo?: string
  [key: string]: unknown
}): Promise<unknown> {
  const { data } = await api.post('/api/feedback/requests', request)
  return data
}

/**
 * Check issue linking capabilities for feedback.
 */
export async function checkIssueLinkCapabilities(targetRepo: string): Promise<{ can_link_parent?: boolean }> {
  const { data } = await api.get<{ can_link_parent?: boolean }>(
    `/api/feedback/issue-link-capabilities?target_repo=${targetRepo}`,
    { timeout: 5000 }
  )
  return data
}
