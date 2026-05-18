import { useState, useEffect, useRef } from 'react'
import { ClusterInfo } from '../../../hooks/useMCP'
import type { CSSProperties } from 'react'

// Inline style constants
export const CLUSTER_GRID_DIV_STYLE_1: CSSProperties = {
  opacity: 0.25,
  maskImage: 'linear-gradient(45deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 80%)',
  WebkitMaskImage: 'linear-gradient(45deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 80%)',
}
export const CLUSTER_GRID_DIV_STYLE_2: CSSProperties = {
  opacity: 0.15,
  maskImage: 'linear-gradient(to left, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 40%)',
  WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 40%)',
}

/** Minimum duration (ms) the refresh spinner must stay visible for a full rotation */
const MIN_SPIN_DURATION_MS = 1_000
export const DISABLED_CLUSTER_ACTION_CLASS = 'bg-secondary/30 text-muted-foreground/50 cursor-not-allowed opacity-60'

/**
 * Guarantees spinner runs for at least 1 full rotation (1s) even if data returns faster.
 * Uses refs for condition checks to avoid stale closure issues when refreshing
 * transitions true→false faster than React can commit the spinning state update.
 */
export function useMinSpin(refreshing: boolean, minDurationMs = MIN_SPIN_DURATION_MS): boolean {
  const [spinning, setSpinning] = useState(false)
  const spinningRef = useRef(false)
  const spinStartRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (refreshing) {
      clearTimeout(timerRef.current)
      if (!spinningRef.current) {
        spinStartRef.current = Date.now()
        spinningRef.current = true
        setSpinning(true)
      }
    } else if (spinningRef.current) {
      const elapsed = Date.now() - spinStartRef.current
      const remaining = Math.max(0, minDurationMs - elapsed)
      timerRef.current = setTimeout(() => {
        spinningRef.current = false
        setSpinning(false)
      }, remaining)
    }
  }, [refreshing, minDurationMs])

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  return spinning
}

// Helper to detect token/auth expiration errors
export function isTokenExpired(cluster: ClusterInfo): boolean {
  return cluster.errorType === 'auth'
}

// Auth method badge labels — intentionally subtle (muted text, no colored backgrounds)
export const AUTH_BADGE_MAP: Record<string, { label: string; color: string }> = {
  exec: { label: 'IAM', color: 'bg-black/5 dark:bg-white/5 text-muted-foreground' },
  token: { label: 'token', color: 'bg-black/5 dark:bg-white/5 text-muted-foreground' },
  certificate: { label: 'cert', color: 'bg-black/5 dark:bg-white/5 text-muted-foreground' },
  'auth-provider': { label: 'IAM', color: 'bg-black/5 dark:bg-white/5 text-muted-foreground' },
}

// Session refresh commands per exec-plugin CLI name
const IAM_REFRESH_COMMANDS: Record<string, string> = {
  aws: 'aws sso login',
  'aws-iam-authenticator': 'aws sso login',
  gcloud: 'gcloud auth login',
  gke: 'gcloud auth login',
  az: 'az login',
  kubelogin: 'az login',
  oc: 'oc login <api-server-url>',
}

// Get a session refresh hint for IAM auth failures based on cluster user/name
export function getIAMRefreshHint(cluster: ClusterInfo): string | null {
  if (cluster.authMethod !== 'exec') return null
  const userLower = (cluster.user || '').toLowerCase()
  const nameLower = (cluster.name || '').toLowerCase()
  for (const [key, cmd] of Object.entries(IAM_REFRESH_COMMANDS)) {
    if (userLower.includes(key) || nameLower.includes(key)) return cmd
  }
  // Guess from name patterns
  if (nameLower.includes('eks') || nameLower.includes('aws')) return 'aws sso login'
  if (nameLower.includes('gke') || nameLower.includes('gcp')) return 'gcloud auth login'
  if (nameLower.includes('aks') || nameLower.includes('azure')) return 'az login'
  if (nameLower.includes('openshift') || nameLower.includes('ocp')) return 'oc login <api-server-url>'
  return null
}

// Local cluster platforms that support lifecycle controls
export const LOCAL_PLATFORMS = new Set(['kind', 'minikube', 'k3s'])

// Map cloud provider to the tool name used by the backend
export function providerToTool(provider: string): string | null {
  switch (provider) {
    case 'kind': return 'kind'
    case 'minikube': return 'minikube'
    case 'k3s': return 'k3d' // k3s clusters detected from name may be k3d-managed
    default: return null
  }
}

// Keyboard handler for clickable card divs: activates on Enter or Space
export function handleCardKeyDown(callback: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      callback()
    }
  }
}

export interface GPUInfo {
  total: number
  allocated: number
}

export type ClusterLayoutMode = 'grid' | 'list' | 'compact' | 'wide'

export interface ClusterGridProps {
  clusters: ClusterInfo[]
  gpuByCluster: Record<string, GPUInfo>
  isConnected: boolean
  permissionsLoading: boolean
  isClusterAdmin: (clusterName: string) => boolean
  onSelectCluster: (clusterName: string) => void
  onRenameCluster: (clusterName: string) => void
  onRefreshCluster?: (clusterName: string) => void
  /** Invoked when the user clicks "Remove cluster" on an offline cluster card (#5901) */
  onRemoveCluster?: (clusterName: string) => void
  onReorder?: (clusterNames: string[]) => void
  layoutMode?: ClusterLayoutMode
}

// Shared props for individual cluster cards
export interface ClusterCardProps {
  cluster: ClusterInfo
  gpuInfo?: GPUInfo
  isConnected: boolean
  permissionsLoading: boolean
  isClusterAdmin: boolean
  onSelectCluster: () => void
  onRenameCluster: () => void
  onRefreshCluster?: () => void
  /** Invoked when the user clicks "Remove cluster" — only rendered when `unreachable` (#5901) */
  onRemoveCluster?: () => void
  dragHandle?: React.ReactNode
  layoutMode: ClusterLayoutMode
}
