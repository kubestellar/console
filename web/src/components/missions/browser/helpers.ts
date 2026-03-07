import type { MissionExport } from '../../../lib/missions/types'
import { getMissionRoute } from '../../../config/routes'
import type { TreeNode } from './types'

/**
 * Generate a stable, URL-safe slug for any mission.
 * - Installers with cncfProject: `install-<cncfProject>` (e.g. `install-prometheus`)
 * - All others: slugified title (lowercase, non-alphanum → hyphens, dedupe, trim)
 */
export function getMissionSlug(mission: MissionExport): string {
  if (mission.missionClass === 'install' && mission.cncfProject) {
    return `install-${mission.cncfProject.toLowerCase()}`
  }
  return (mission.title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** UTM parameters appended to share-button URLs for GA4 campaign attribution */
const SHARE_UTM_PARAMS = 'utm_source=mission-explorer&utm_medium=share-link&utm_campaign=mission-sharing'

/** Build a full shareable URL for a mission (includes UTM campaign params) */
export function getMissionShareUrl(mission: MissionExport): string {
  return `${window.location.origin}${getMissionRoute(getMissionSlug(mission))}?${SHARE_UTM_PARAMS}`
}

export function updateNodeInTree(
  nodes: TreeNode[],
  nodeId: string,
  updates: Partial<TreeNode>
): TreeNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return { ...node, ...updates }
    }
    if (node.children) {
      return { ...node, children: updateNodeInTree(node.children, nodeId, updates) }
    }
    return node
  })
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Normalize kc-mission-v1 JSON (nested format) into flat MissionExport shape.
 *  Kept for on-demand file loading when user selects a mission from the sidebar. */
export function normalizeMission(raw: Record<string, unknown>): MissionExport | null {
  // Already flat MissionExport — ensure required string fields have defaults
  if (raw.title && raw.type && raw.tags) {
    const flat = raw as unknown as MissionExport
    if (!flat.description) flat.description = ''
    if (!flat.version) flat.version = 'unknown'
    if (!flat.steps) flat.steps = []
    return flat
  }

  // kc-mission-v1 nested format: { version|format, mission: { ... }, metadata: { ... } }
  const m = raw.mission as Record<string, unknown> | undefined
  if (!m) return null

  const meta = raw.metadata as Record<string, unknown> | undefined
  const tags = (meta?.tags as string[]) ?? []
  const cncfProjects = (meta?.cncfProjects as string[]) ?? []

  // Derive CNCF category from tags if not set explicitly
  const knownCategories = ['observability', 'orchestration', 'runtime', 'provisioning', 'security',
    'service mesh', 'app definition', 'serverless', 'storage', 'streaming', 'networking']
  const categoryFromTags = tags.find(t => knownCategories.includes(t.toLowerCase()))
  const category = (meta?.category as string)
    ?? (categoryFromTags ? categoryFromTags.charAt(0).toUpperCase() + categoryFromTags.slice(1) : undefined)

  const resolution = m.resolution as Record<string, unknown> | undefined
  const sourceUrls = meta?.sourceUrls as Record<string, string> | undefined

  return {
    version: (raw.version as string) ?? (raw.format as string) ?? 'kc-mission-v1',
    title: (m.title as string) ?? '',
    description: (m.description as string) ?? '',
    type: (m.type as string) ?? 'troubleshoot',
    tags,
    category,
    cncfProject: cncfProjects[0] ?? undefined,
    missionClass: (raw.missionClass as string) ?? ((m.type as string) === 'install' ? 'install' : undefined),
    author: (raw.author as string) ?? undefined,
    authorGithub: (raw.authorGithub as string) ?? undefined,
    difficulty: (meta?.difficulty as string) ?? undefined,
    installMethods: (meta?.installMethods as string[]) ?? undefined,
    steps: (m.steps as MissionExport['steps']) ?? [],
    uninstall: (m.uninstall as MissionExport['uninstall']) ?? undefined,
    upgrade: (m.upgrade as MissionExport['upgrade']) ?? undefined,
    troubleshooting: (m.troubleshooting as MissionExport['troubleshooting']) ?? undefined,
    resolution: resolution ? {
      summary: (resolution.summary as string) ?? '',
      steps: (resolution.steps as string[]) ?? [],
    } : undefined,
    metadata: {
      source: sourceUrls?.issue ?? sourceUrls?.source ?? (meta?.sourceIssue as string) ?? (meta?.sourceRepo as string) ?? undefined,
      createdAt: (raw.exportedAt as string) ?? undefined,
    },
  } as MissionExport
}
