import { createElement, type ReactNode } from 'react'
import { ArrowUp, CheckCircle, AlertTriangle, WifiOff, Loader2 } from 'lucide-react'
import { commonComparators } from '../../lib/cards/cardHooks'

export type SortByOption = 'status' | 'version' | 'cluster'

export interface UpgradeItem {
  name: string
  currentVersion: string
  targetVersion: string
  status: 'unreachable' | 'loading' | 'available' | 'current'
  progress: number
  isUnreachable: boolean
  isLoading: boolean
}

export const SORT_OPTIONS: Array<{ value: SortByOption; label: string }> = [
  { value: 'status', label: 'Status' },
  { value: 'version', label: 'Version' },
  { value: 'cluster', label: 'Cluster' },
]

export const STATUS_ORDER: Record<string, number> = {
  available: 0,
  loading: 1,
  unreachable: 2,
  current: 3,
}

export const UPGRADE_SORT_COMPARATORS: Record<SortByOption, (a: UpgradeItem, b: UpgradeItem) => number> = {
  status: commonComparators.statusOrder<UpgradeItem>('status', STATUS_ORDER),
  version: commonComparators.string<UpgradeItem>('currentVersion'),
  cluster: commonComparators.string<UpgradeItem>('name'),
}

// Demo versions keyed by cluster name keywords
export const DEMO_VERSIONS: Record<string, string> = {
  eks: 'v1.31.2',
  aks: 'v1.30.4',
  gke: 'v1.31.0',
  openshift: 'v1.28.11',
  oci: 'v1.30.1',
  kind: 'v1.32.0',
  k3s: 'v1.31.1',
  minikube: 'v1.31.3',
  rancher: 'v1.29.6',
}

// Derive the latest known Kubernetes minor version from cluster data.
// Falls back to a hardcoded value when no cluster versions are available.
export const FALLBACK_LATEST_MINOR = 33

export function deriveLatestMinor(versions: Record<string, string>): number {
  let maxMinor = 0
  for (const version of Object.values(versions)) {
    const match = version.match(/v?(\d+)\.(\d+)\.(\d+)/)
    if (match) {
      const minor = parseInt(match[2], 10)
      if (minor > maxMinor) maxMinor = minor
    }
  }
  // The latest available minor is at least one ahead of the highest observed,
  // since clusters are rarely all on the very latest release.
  // If no versions were parsed, fall back to the hardcoded value.
  return maxMinor > 0 ? maxMinor + 1 : FALLBACK_LATEST_MINOR
}

// Check if a newer stable version is available
export function getRecommendedUpgrade(currentVersion: string, latestMinor: number): string | null {
  if (!currentVersion || currentVersion === '-' || currentVersion === 'loading...') return null

  // Parse version (e.g., "v1.28.5" -> { major: 1, minor: 28, patch: 5 })
  const match = currentVersion.match(/v?(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null

  const minor = parseInt(match[2], 10)
  const patch = parseInt(match[3], 10)

  if (minor < latestMinor - 2) {
    // More than 2 minor versions behind - suggest next minor
    return `v1.${minor + 1}.0`
  }

  if (minor < latestMinor && patch < 10) {
    // Behind on minor, suggest latest patch of current minor
    return `v1.${minor}.${patch + 1}`
  }

  return null // Up to date
}

export function getStatusIcon(status: string): ReactNode {
  switch (status) {
    case 'current':
      return createElement(CheckCircle, { className: 'w-4 h-4 text-green-400' })
    case 'available':
      return createElement(ArrowUp, { className: 'w-4 h-4 text-yellow-400' })
    case 'failed':
      return createElement(AlertTriangle, { className: 'w-4 h-4 text-red-400' })
    case 'unreachable':
      return createElement(WifiOff, { className: 'w-4 h-4 text-yellow-400' })
    case 'loading':
      return createElement(Loader2, { className: 'w-4 h-4 text-muted-foreground animate-spin' })
    default:
      return null
  }
}

export function getDemoVersionForCluster(name: string): string {
  const lower = name.toLowerCase()
  for (const [keyword, version] of Object.entries(DEMO_VERSIONS)) {
    if (lower.includes(keyword)) return version
  }

  // Deterministic fallback based on name length
  const versions = ['v1.30.2', 'v1.31.1', 'v1.29.8', 'v1.32.0', 'v1.30.5']
  return versions[name.length % versions.length]
}

export function buildUpgradePrompt(clusterName: string, currentVersion: string, targetVersion: string): string {
  return `I want to upgrade the Kubernetes cluster "${clusterName}" from version ${currentVersion} to ${targetVersion}.

Please help me with this upgrade by:
1. First checking the cluster's current state and any prerequisites
2. Reviewing the upgrade path and potential breaking changes
3. Creating a backup/rollback plan
4. Performing the upgrade with proper monitoring
5. Validating the upgrade was successful

Please proceed step by step and ask for confirmation before making any changes.`
}
