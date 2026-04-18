/**
 * Pure async data-fetch helpers for MissionBrowser tree navigation.
 *
 * Extracted from MissionBrowser.tsx (#8624 part 5) to keep state management
 * (`toggleNode`, `selectNode`) separate from the network/transformation logic
 * for community / GitHub / Kubara catalog tree nodes.
 *
 * These functions are pure async: they take a `TreeNode` (and optional parent
 * id for child generation) and return data — no React state, no setters.
 */
import { api } from '../../../lib/api'
import { FETCH_EXTERNAL_TIMEOUT_MS } from '../../../lib/constants/network'
import type { BrowseEntry } from '../../../lib/missions/types'
import { isHiddenEntry, isMissionFile } from '../missionBrowserConstants'
import type { TreeNode } from './types'

/** Static curated Kubara chart catalog — list is curated and rarely changes,
 *  and the live GitHub Contents API path requires a per-user GitHub OAuth token
 *  that not every user has wired up. Without this fallback the kubara node was
 *  empty for non-demo users. */
const KUBARA_CHART_NAMES = [
  'kube-prometheus-stack', 'cert-manager', 'kyverno', 'kyverno-policies',
  'argo-cd', 'external-secrets', 'loki', 'longhorn', 'metallb', 'traefik',
] as const

/** Files surfaced for each Kubara chart node — Chart.yaml and values.yaml are
 *  loaded lazily as files; templates is a (synthetic) directory placeholder. */
const KUBARA_CHART_FILES = ['Chart.yaml', 'values.yaml', 'templates'] as const

const KUBARA_CHART_ROOT = 'go-binary/templates/embedded/managed-service-catalog/helm'
const KUBARA_REPO_OWNER = 'kubara-io'
const KUBARA_REPO_NAME = 'kubara'

/** Subset of the GitHub Contents API response we actually use. */
interface GitHubEntry {
  name: string
  path: string
  type: string
  size?: number
}

/** Subset of the GitHub Contents API single-file response we actually use. */
interface GitHubFile {
  content?: string
  encoding?: string
  download_url?: string
}

/** Owner/repo extracted from a node's `path` ("owner/repo[/sub/path]"). */
function splitOwnerRepo(node: TreeNode): { owner: string; repo: string; subPath: string } {
  if (node.repoOwner && node.repoName) {
    return { owner: node.repoOwner, repo: node.repoName, subPath: node.path }
  }
  const parts = node.path.split('/')
  return {
    owner: parts[0] ?? '',
    repo: parts[1] ?? '',
    subPath: parts.slice(2).join('/'),
  }
}

// ============================================================================
// Tree expansion — fetch children for a node
// ============================================================================

/**
 * Fetch children for a tree node when it is expanded.
 *
 * Used by `MissionBrowser.toggleNode`. Returns the new child nodes; the caller
 * is responsible for splicing them into the parent via `updateNodeInTree`.
 */
export async function fetchTreeChildren(node: TreeNode): Promise<TreeNode[]> {
  const nodeId = node.id

  if (node.source === 'community') {
    const { data: entries } = await api.get<BrowseEntry[]>(
      `/api/missions/browse?path=${encodeURIComponent(node.path)}`
    )
    // Backend already filters infra/metadata, but guard client-side too.
    // #6421 — filter ALL dot-prefixed entries (directories AND files).
    return entries
      .filter(e => !isHiddenEntry(e.name))
      .map((e) => ({
        id: `${nodeId}/${e.name}`,
        name: e.name,
        path: e.path,
        type: e.type,
        source: 'community' as const,
        loaded: e.type === 'file',
        description: e.description }))
  }

  if (node.source === 'github') {
    if (nodeId === 'github') {
      // Root "My Repositories" node — list user's repos
      const { data: repos } = await api.get<Array<{ name: string; full_name: string }>>(
        '/api/github/repos?hasMissionsDir=true'
      )
      return repos.map((r) => ({
        id: `github/${r.full_name}`,
        name: r.name,
        path: r.full_name,
        type: 'directory' as const,
        source: 'github' as const,
        loaded: false,
        description: r.full_name }))
    }

    if (nodeId === 'kubara') {
      // Static Kubara catalog (cached, no API calls). Used in demo mode AND
      // in real mode — see KUBARA_CHART_NAMES rationale above.
      return KUBARA_CHART_NAMES.map(name => ({
        id: `kubara/${name}`,
        name,
        path: `${KUBARA_CHART_ROOT}/${name}`,
        type: 'directory' as const,
        source: 'github' as const,
        repoOwner: KUBARA_REPO_OWNER,
        repoName: KUBARA_REPO_NAME,
        loaded: false,
      }))
    }

    if (nodeId.startsWith('kubara/')) {
      return KUBARA_CHART_FILES.map(fname => ({
        id: `${nodeId}/${fname}`,
        name: fname,
        path: `${node.path}/${fname}`,
        type: (fname === 'templates' ? 'directory' : 'file') as TreeNode['type'],
        source: 'github' as const,
        repoOwner: KUBARA_REPO_OWNER,
        repoName: KUBARA_REPO_NAME,
        loaded: fname !== 'templates',
      }))
    }

    // Specific repo node — list repo contents via GitHub Contents API
    const repoPath = node.path
    const { data: ghEntries } = await api.get<GitHubEntry[]>(
      `/api/github/repos/${repoPath}/contents`
    )
    return (ghEntries || [])
      .filter(e => e.type === 'dir' || isMissionFile(e.name))
      .map(e => ({
        id: `${nodeId}/${e.name}`,
        name: e.name,
        path: `${repoPath.split('/').slice(0, 2).join('/')}/${e.path}`,
        type: (e.type === 'dir' ? 'directory' : 'file') as TreeNode['type'],
        source: 'github' as const,
        loaded: e.type !== 'dir',
        description: e.size ? `${e.size} bytes` : undefined }))
  }

  return []
}

// ============================================================================
// Directory selection — fetch BrowseEntry listing for a directory node
// ============================================================================

/**
 * Fetch listing entries for a directory node when the user selects it.
 *
 * Used by `MissionBrowser.selectNode`. Returns the entries to display in the
 * directory listing pane. Filters out hidden / non-mission entries.
 */
export async function fetchDirectoryEntries(node: TreeNode): Promise<BrowseEntry[]> {
  if (node.source === 'community') {
    const { data: entries } = await api.get<BrowseEntry[]>(
      `/api/missions/browse?path=${encodeURIComponent(node.path)}`
    )
    // #6421 — Hide dot-prefixed entries and the index.json manifest.
    // Only mission files or directories may appear in the listing.
    return entries.filter(e =>
      !isHiddenEntry(e.name) &&
      (e.type === 'directory' || isMissionFile(e.name))
    )
  }

  if (node.source === 'github') {
    // Fetch repo contents via GitHub Contents API proxy
    const { owner, repo, subPath } = splitOwnerRepo(node)
    const apiPath = subPath
      ? `/api/github/repos/${owner}/${repo}/contents/${subPath}`
      : `/api/github/repos/${owner}/${repo}/contents/`
    const { data: ghEntries } = await api.get<GitHubEntry[]>(apiPath)
    return (ghEntries || [])
      .filter(e => e.type === 'dir' || isMissionFile(e.name))
      .map(e => ({
        name: e.name,
        path: node.repoOwner ? e.path : `${owner}/${repo}/${e.path}`,
        type: e.type === 'dir' ? 'directory' as const : 'file' as const,
        size: e.size }))
  }

  return []
}

// ============================================================================
// File selection — fetch raw file content for a file node
// ============================================================================

/** Sample Chart.yaml content for Kubara catalog nodes. */
function kubaraSampleChartYaml(chartName: string): string {
  return `apiVersion: v2\nname: ${chartName}\ndescription: Production-tested ${chartName} Helm chart from Kubara\nversion: 1.0.0\ntype: application\nappVersion: "latest"\nmaintainers:\n  - name: kubara-io\n    url: https://github.com/kubara-io/kubara`
}

/** Sample values.yaml content for Kubara catalog nodes. */
function kubaraSampleValuesYaml(chartName: string): string {
  return `# ${chartName} — Kubara production values\n# These values are tested in production environments\n# See https://github.com/kubara-io/kubara for details\n\nreplicaCount: 2\n\nresources:\n  requests:\n    cpu: 100m\n    memory: 128Mi\n  limits:\n    cpu: 500m\n    memory: 512Mi\n\nserviceAccount:\n  create: true\n\npodSecurityContext:\n  runAsNonRoot: true\n  fsGroup: 65534\n\nmonitoring:\n  enabled: true\n  serviceMonitor:\n    enabled: true`
}

/** Build canned content for a kubara/* file node. Avoids per-file GitHub
 *  Contents API rate-limit burn when a user expands a chart tree. */
function getKubaraSampleContent(node: TreeNode): string {
  const chartName = node.id.split('/')[1] || 'chart'
  if (node.name === 'Chart.yaml') return kubaraSampleChartYaml(chartName)
  if (node.name === 'values.yaml') return kubaraSampleValuesYaml(chartName)
  return `# ${node.name}\n# Kubara template file`
}

/**
 * Fetch raw file content for a file node when the user selects it.
 *
 * Used by `MissionBrowser.selectNode`. Returns the raw text content. The caller
 * is responsible for parsing it (`parseFileContent` / `validateMissionExport`).
 *
 * Returns `null` for unsupported sources (e.g. `local`, which uses FileReader).
 */
export async function fetchNodeFileContent(node: TreeNode): Promise<string | null> {
  if (node.source === 'community') {
    const { data } = await api.get<string>(
      `/api/missions/file?path=${encodeURIComponent(node.path)}`
    )
    return typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  }

  if (node.source === 'github') {
    // Serve canned sample content for kubara/* nodes instead of hitting
    // the GitHub Contents API — avoids per-file rate-limit burn when a
    // user expands a chart tree.
    if (node.id.startsWith('kubara/')) {
      return getKubaraSampleContent(node)
    }

    // Fetch raw file content via GitHub Contents API proxy
    const parts = node.path.split('/')
    const owner = parts[0]
    const repo = parts[1]
    const filePath = parts.slice(2).join('/')
    const { data: ghFile } = await api.get<GitHubFile>(
      `/api/github/repos/${owner}/${repo}/contents/${filePath}`
    )
    // GitHub returns base64-encoded content for files
    if (ghFile.content && ghFile.encoding === 'base64') {
      return atob(ghFile.content.replace(/\n/g, ''))
    }
    if (ghFile.download_url) {
      const rawResp = await fetch(ghFile.download_url, {
        signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) })
      return await rawResp.text()
    }
    return JSON.stringify(ghFile)
  }

  return null
}
