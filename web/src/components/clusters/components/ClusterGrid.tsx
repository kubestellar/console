import { memo, useState, useEffect, useRef } from 'react'
import { Pencil, Globe, User, ShieldAlert, ChevronRight, Star, WifiOff, RefreshCw, ExternalLink, AlertCircle, Cpu, Box, Server, KeyRound, Copy, Check, GripVertical, Play, Square, RotateCcw, Trash2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
  arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { FlashingValue } from '../../ui/FlashingValue'
import { ClusterInfo } from '../../../hooks/useMCP'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { isClusterUnreachable, isClusterLoading, isClusterHealthy } from '../utils'
import { CloudProviderIcon, detectCloudProvider, getProviderLabel, getProviderColor, getConsoleUrl } from '../../ui/CloudProviderIcon'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../../ui/StatusBadge'
import { copyToClipboard } from '../../../lib/clipboard'
import { useLocalClusterTools } from '../../../hooks/useLocalClusterTools'
import type { CSSProperties } from 'react'

// Inline style constants
const CLUSTER_GRID_DIV_STYLE_1: CSSProperties = {
            opacity: 0.25,
            maskImage: 'linear-gradient(45deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 80%)',
            WebkitMaskImage: 'linear-gradient(45deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 80%)' }
const CLUSTER_GRID_DIV_STYLE_2: CSSProperties = {
            opacity: 0.15,
            maskImage: 'linear-gradient(to left, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 40%)',
            WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 40%)' }


/** Minimum duration (ms) the refresh spinner must stay visible for a full rotation */
const MIN_SPIN_DURATION_MS = 1_000

// Guarantees spinner runs for at least 1 full rotation (1s) even if data returns faster.
// Uses refs for condition checks to avoid stale closure issues when refreshing
// transitions true→false faster than React can commit the spinning state update.
function useMinSpin(refreshing: boolean, minDurationMs = MIN_SPIN_DURATION_MS): boolean {
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
function isTokenExpired(cluster: ClusterInfo): boolean {
  return cluster.errorType === 'auth'
}

// Auth method badge labels — intentionally subtle (muted text, no colored backgrounds)
const AUTH_BADGE_MAP: Record<string, { label: string; color: string }> = {
  exec: { label: 'IAM', color: 'bg-black/5 dark:bg-white/5 text-muted-foreground' },
  token: { label: 'token', color: 'bg-black/5 dark:bg-white/5 text-muted-foreground' },
  certificate: { label: 'cert', color: 'bg-black/5 dark:bg-white/5 text-muted-foreground' },
  'auth-provider': { label: 'IAM', color: 'bg-black/5 dark:bg-white/5 text-muted-foreground' } }

// Session refresh commands per exec-plugin CLI name
const IAM_REFRESH_COMMANDS: Record<string, string> = {
  aws: 'aws sso login',
  'aws-iam-authenticator': 'aws sso login',
  gcloud: 'gcloud auth login',
  gke: 'gcloud auth login',
  az: 'az login',
  kubelogin: 'az login',
  oc: 'oc login <api-server-url>' }

// Get a session refresh hint for IAM auth failures based on cluster user/name
function getIAMRefreshHint(cluster: ClusterInfo): string | null {
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

// Inline copy button — shows a checkmark briefly after copying
const COPY_FEEDBACK_MS = 1500
function CopyCmd({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    copyToClipboard(text)
    setCopied(true)
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
  }
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy command to clipboard"
      aria-label="Copy command to clipboard"
    >
      {copied ? <Check className="w-2.5 h-2.5 text-green-400" /> : <Copy className="w-2.5 h-2.5" />}
      <span aria-live="polite" className="sr-only">
        {copied ? 'Copied!' : ''}
      </span>
    </button>
  )
}

// Local cluster platforms that support lifecycle controls
const LOCAL_PLATFORMS = new Set(['kind', 'minikube', 'k3s'])

// Map cloud provider to the tool name used by the backend
function providerToTool(provider: string): string | null {
  switch (provider) {
    case 'kind': return 'kind'
    case 'minikube': return 'minikube'
    case 'k3s': return 'k3d' // k3s clusters detected from name may be k3d-managed
    default: return null
  }
}

// Inline play/stop/restart controls for local clusters
const LocalClusterControls = memo(function LocalClusterControls({
  clusterName,
  provider,
  unreachable }: {
  clusterName: string
  provider: string
  unreachable: boolean
}) {
  const { clusterLifecycle, clusters } = useLocalClusterTools()
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const tool = providerToTool(provider)

  if (!tool) return null

  // Try to find the cluster in local clusters list for accurate tool/name mapping
  const localCluster = clusters.find(c =>
    clusterName.includes(c.name) || c.name.includes(clusterName.replace(/^kind-/, ''))
  )
  const effectiveTool = localCluster?.tool || tool
  const effectiveName = localCluster?.name || clusterName.replace(/^kind-/, '')
  const isStopped = localCluster?.status === 'stopped' || unreachable

  const handleAction = async (action: 'start' | 'stop' | 'restart', e: React.MouseEvent) => {
    e.stopPropagation()
    setActionInProgress(action)
    await clusterLifecycle(effectiveTool, effectiveName, action)
    setActionInProgress(null)
  }

  return (
    <div className="flex items-center gap-0.5" role="presentation">
      {isStopped ? (
        <button
          onClick={(e) => handleAction('start', e)}
          disabled={!!actionInProgress}
          className={`p-2 min-h-11 min-w-11 flex items-center justify-center rounded transition-colors ${
            actionInProgress === 'start'
              ? 'text-green-400 bg-green-500/20'
              : 'text-muted-foreground hover:text-green-400 hover:bg-green-500/20'
          }`}
          title="Start cluster"
          aria-label="Start cluster"
        >
          <Play className={`w-3.5 h-3.5 ${actionInProgress === 'start' ? 'animate-pulse' : ''}`} aria-hidden="true" />
        </button>
      ) : (
        <button
          onClick={(e) => handleAction('stop', e)}
          disabled={!!actionInProgress}
          className={`p-2 min-h-11 min-w-11 flex items-center justify-center rounded transition-colors ${
            actionInProgress === 'stop'
              ? 'text-red-400 bg-red-500/20'
              : 'text-muted-foreground hover:text-red-400 hover:bg-red-500/20'
          }`}
          title="Stop cluster"
          aria-label="Stop cluster"
        >
          <Square className={`w-3 h-3 ${actionInProgress === 'stop' ? 'animate-pulse' : ''}`} aria-hidden="true" />
        </button>
      )}
      <button
        onClick={(e) => handleAction('restart', e)}
        disabled={!!actionInProgress}
        className={`p-2 min-h-11 min-w-11 flex items-center justify-center rounded transition-colors ${
          actionInProgress === 'restart'
            ? 'text-blue-400 bg-blue-500/20'
            : 'text-muted-foreground hover:text-blue-400 hover:bg-blue-500/20'
        }`}
        title="Restart cluster"
        aria-label="Restart cluster"
      >
        <RotateCcw className={`w-3.5 h-3.5 ${actionInProgress === 'restart' ? 'animate-spin' : ''}`} aria-hidden="true" />
      </button>
    </div>
  )
})

interface GPUInfo {
  total: number
  allocated: number
}

export type ClusterLayoutMode = 'grid' | 'list' | 'compact' | 'wide'

interface ClusterGridProps {
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
interface ClusterCardProps {
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

/**
 * Inline "Remove cluster" button shown only on offline/unreachable cluster cards (#5901).
 * Delegates confirmation + API call to the parent via `onRemoveCluster`.
 */
const RemoveClusterButton = memo(function RemoveClusterButton({
  onRemove,
  size = 'sm' }: {
  onRemove: () => void
  size?: 'sm' | 'xs'
}) {
  const { t } = useTranslation()
  const iconClass = size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'
  const btnClass = size === 'xs' ? 'p-1' : 'p-1.5'
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onRemove() }}
      className={`${btnClass} rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/20 transition-colors`}
      title={t('cluster.removeCluster')}
      aria-label={t('cluster.removeCluster')}
      data-testid="remove-cluster-button"
    >
      <Trash2 className={iconClass} aria-hidden="true" />
    </button>
  )
})

// Keyboard handler for clickable card divs: activates on Enter or Space
function handleCardKeyDown(callback: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      callback()
    }
  }
}

// Full/default card (used for 'grid' and 'wide' modes)
const FullClusterCard = memo(function FullClusterCard({
  cluster,
  gpuInfo,
  isConnected,
  permissionsLoading,
  isClusterAdmin,
  onSelectCluster,
  onRenameCluster,
  onRefreshCluster,
  onRemoveCluster,
  dragHandle }: Omit<ClusterCardProps, 'layoutMode'>) {
  const { t } = useTranslation()
  const loading = isClusterLoading(cluster)
  const unreachable = isClusterUnreachable(cluster)
  const hasCachedData = cluster.nodeCount !== undefined && cluster.nodeCount > 0
  const initialLoading = loading && !hasCachedData
  const refreshing = cluster.refreshing === true
  const spinning = useMinSpin(refreshing)
  // No per-card lastUpdated timestamp — freshness is indicated by the spinning
  // refresh icon (useMinSpin) when polling is in progress for this cluster.

  const provider = (cluster.distribution as ReturnType<typeof detectCloudProvider>) ||
    detectCloudProvider(cluster.name, cluster.server, cluster.namespaces, cluster.user)
  const providerLabel = getProviderLabel(provider)
  const providerColor = getProviderColor(provider)
  const themeColor = 'var(--ks-purple)'
  const consoleUrl = getConsoleUrl(provider, cluster.name, cluster.server)

  return (
    <div
      onClick={onSelectCluster}
      onKeyDown={handleCardKeyDown(onSelectCluster)}
      role="button"
      tabIndex={0}
      aria-label={`Select cluster ${cluster.context || cluster.name}`}
      className="relative p-px rounded-lg cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 overflow-hidden h-full"
      style={{
        /* Card view: prominent gradient — provider at 50%, theme at 38% */
        background: `linear-gradient(135deg, color-mix(in srgb, ${providerColor} 50%, transparent) 0%, color-mix(in srgb, ${themeColor} 38%, transparent) 100%)` }}
    >
      <div className="relative glass p-5 rounded-lg h-full overflow-hidden">
        {/* Background provider icon */}
        <div
          className="absolute -bottom-2 -left-2 pointer-events-none"
          style={CLUSTER_GRID_DIV_STYLE_1}
        >
          <CloudProviderIcon provider={provider} size={100} />
        </div>
        <div className="flex items-start justify-between mb-4 relative z-10">
          <div className="flex items-center gap-3">
            {dragHandle}
            {/* Status indicator with refresh button below */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              {initialLoading ? (
                <StatusIndicator status="loading" size="lg" showLabel={false} />
              ) : isTokenExpired(cluster) ? (
                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center" title={t('common.tokenExpired')}>
                  <KeyRound className="w-4 h-4 text-red-400" />
                </div>
              ) : unreachable ? (
                <div
                  className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center"
                  title={
                    // Surface the reason for unreachability directly in
                    // the status icon tooltip (#5925).
                    cluster.errorMessage
                      ? `Offline (${cluster.errorType || 'error'}): ${cluster.errorMessage}`
                      : cluster.errorType
                        ? `Offline: ${cluster.errorType}`
                        : 'Offline - check network connection'
                  }
                >
                  <WifiOff className="w-4 h-4 text-yellow-400" />
                </div>
              ) : !isClusterHealthy(cluster) ? (
                <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center" title="Degraded - some nodes not ready">
                  <AlertCircle className="w-4 h-4 text-orange-400" />
                </div>
              ) : (
                <StatusIndicator status="healthy" size="lg" showLabel={false} />
              )}
              {onRefreshCluster && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRefreshCluster() }}
                  disabled={spinning}
                  className={`flex items-center p-1 rounded transition-colors ${
                    spinning ? 'bg-blue-500/20 text-blue-400' :
                    unreachable ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' :
                    'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                  title={spinning ? t('common.refreshing') : unreachable ? t('common.retryConnection') : t('common.refreshClusterData')}
                  aria-label={spinning ? t('common.refreshing') : unreachable ? t('common.retryConnection') : t('common.refreshClusterData')}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`} aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="shrink-0" title={providerLabel}>
                  <CloudProviderIcon provider={provider} size={18} />
                </span>
                <h3
                  className="font-semibold text-foreground truncate"
                  title={cluster.aliases && cluster.aliases.length > 0
                    ? `${cluster.context || cluster.name}\n\naka: ${cluster.aliases.join(', ')}`
                    : cluster.context || cluster.name
                  }
                >
                  {cluster.context || cluster.name.split('/').pop()}
                </h3>
                {cluster.authMethod && AUTH_BADGE_MAP[cluster.authMethod] && (
                  <span
                    className={`text-2xs px-1.5 py-0.5 rounded shrink-0 ${AUTH_BADGE_MAP[cluster.authMethod].color}`}
                    title={cluster.authMethod === 'exec'
                      ? `Auth: IAM (exec plugin)${getIAMRefreshHint(cluster) ? `\nLogin: ${getIAMRefreshHint(cluster)}` : ''}`
                      : `Auth: ${cluster.authMethod}`}
                  >
                    {AUTH_BADGE_MAP[cluster.authMethod].label}
                  </span>
                )}
                {cluster.aliases && cluster.aliases.length > 0 && (
                  <span title={`Also known as: ${cluster.aliases.join(', ')}`}>
                    <StatusBadge color="purple" size="xs" className="shrink-0">
                      +{cluster.aliases.length} alias{cluster.aliases.length > 1 ? 'es' : ''}
                    </StatusBadge>
                  </span>
                )}
                {isConnected && (cluster.source === 'kubeconfig' || !cluster.source) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRenameCluster() }}
                    className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground shrink-0"
                    title={t('common.renameContext')}
                    aria-label={t('common.renameContext')}
                  >
                    <Pencil className="w-3 h-3" aria-hidden="true" />
                  </button>
                )}
                {/* Remove cluster button — only for unreachable clusters (#5901) */}
                {isConnected && unreachable && onRemoveCluster && (cluster.source === 'kubeconfig' || !cluster.source) && (
                  <RemoveClusterButton onRemove={onRemoveCluster} size="xs" />
                )}
              </div>
              <div className="flex flex-col gap-1 mt-1">
                {cluster.server && (
                  <span
                    className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-default truncate max-w-[220px]"
                    title={`Server: ${cluster.server}`}
                  >
                    <Globe className="w-3 h-3 shrink-0" />
                    <span className="truncate">{cluster.server.replace(/^https?:\/\//, '')}</span>
                  </span>
                )}
                {cluster.user && (
                  <span
                    className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-default truncate max-w-[220px]"
                    title={`User: ${cluster.user}`}
                  >
                    <User className="w-3 h-3 shrink-0" />
                    <span className="truncate">{cluster.user}</span>
                  </span>
                )}
                {/* Actionable login hint for IAM clusters that are unreachable or have auth errors */}
                {cluster.authMethod === 'exec' && (isTokenExpired(cluster) || cluster.reachable === false) && (() => {
                  const hint = getIAMRefreshHint(cluster)
                  return hint ? (
                    <span className="flex items-center gap-1 text-2xs text-muted-foreground mt-0.5">
                      Login: <code className="bg-black/5 dark:bg-white/5 px-1 rounded">{hint}</code>
                      <CopyCmd text={hint} />
                    </span>
                  ) : null
                })()}
                {isTokenExpired(cluster) && cluster.authMethod !== 'exec' && (
                  <span className="text-2xs text-muted-foreground mt-0.5">
                    {t('cluster.authErrorTokenHint')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-1 shrink-0">
            {cluster.isCurrent && (
              <span className="flex items-center px-1.5 py-0.5 rounded bg-primary/20 text-primary" title={t('common.currentContext')}>
                <Star className="w-3.5 h-3.5 fill-current" />
              </span>
            )}
            {!permissionsLoading && !isClusterAdmin && !unreachable && (
              <StatusBadge color="yellow" title="You have limited permissions on this cluster" icon={<ShieldAlert className="w-3.5 h-3.5" />} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 text-center relative z-10 cursor-default">
          <div title={unreachable ? 'Nodes: Cluster offline' : hasCachedData && cluster.nodeCount !== undefined ? `Nodes: ${cluster.nodeCount} worker nodes in cluster` : 'Nodes: Loading...'}>
            <div className={`text-lg font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData && cluster.nodeCount !== undefined ? cluster.nodeCount : '-'} />
            </div>
            <div className="text-xs text-muted-foreground">{t('common.nodes')}</div>
          </div>
          <div title={unreachable ? 'CPU: Cluster offline' : hasCachedData && cluster.cpuCores !== undefined ? `CPU: ${cluster.cpuCores} total CPU cores` : 'CPU: Loading...'}>
            <div className={`text-lg font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData && cluster.cpuCores !== undefined ? cluster.cpuCores : '-'} />
            </div>
            <div className="text-xs text-muted-foreground">{t('common.cpus')}</div>
          </div>
          <div title={unreachable ? 'Pods: Cluster offline' : hasCachedData && cluster.podCount !== undefined ? `Pods: ${cluster.podCount} running pods` : 'Pods: Loading...'}>
            <div className={`text-lg font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData && cluster.podCount !== undefined ? cluster.podCount : '-'} />
            </div>
            <div className="text-xs text-muted-foreground">{t('common.pods')}</div>
          </div>
          <div title={unreachable ? 'GPU: Cluster offline' : gpuInfo ? `GPU: ${gpuInfo.allocated}/${gpuInfo.total} GPUs allocated` : 'GPU: No GPUs detected'}>
            <div className={`text-lg font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData && !unreachable ? (gpuInfo ? gpuInfo.total : 0) : '-'} />
            </div>
            <div className="text-xs text-muted-foreground">{t('common.gpus')}</div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border relative z-10 cursor-default">
          {consoleUrl && (
            <div className="flex justify-center mb-3">
              <a
                href={consoleUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/70 hover:bg-secondary text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title={`Open ${providerLabel} console`}
              >
                <span>console</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Source: {cluster.source || 'kubeconfig'}</span>
            <div className="flex items-center gap-2">
              {LOCAL_PLATFORMS.has(provider) && (
                <LocalClusterControls
                  clusterName={cluster.name}
                  provider={provider}
                  unreachable={unreachable}
                />
              )}
              <span title={t('common.viewDetails')}><ChevronRight className="w-4 h-4 text-primary" /></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

// List card (horizontal, single row per cluster)
const ListClusterCard = memo(function ListClusterCard({
  cluster,
  gpuInfo,
  permissionsLoading,
  isClusterAdmin,
  isConnected,
  onSelectCluster,
  onRefreshCluster,
  onRemoveCluster,
  dragHandle }: Omit<ClusterCardProps, 'layoutMode' | 'onRenameCluster'>) {
  const { t } = useTranslation()
  const loading = isClusterLoading(cluster)
  const unreachable = isClusterUnreachable(cluster)
  const hasCachedData = cluster.nodeCount !== undefined && cluster.nodeCount > 0
  const initialLoading = loading && !hasCachedData
  const refreshing = cluster.refreshing === true
  const spinning = useMinSpin(refreshing)

  const provider = (cluster.distribution as ReturnType<typeof detectCloudProvider>) ||
    detectCloudProvider(cluster.name, cluster.server, cluster.namespaces, cluster.user)
  const providerColor = getProviderColor(provider)
  const themeColor = 'var(--ks-purple)'

  return (
    <div
      onClick={onSelectCluster}
      onKeyDown={handleCardKeyDown(onSelectCluster)}
      role="button"
      tabIndex={0}
      aria-label={`Select cluster ${cluster.context || cluster.name}`}
      className="relative p-px rounded-lg cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 overflow-hidden"
      style={{
        /* List view: subtle gradient — provider at 38%, theme at 25% */
        background: `linear-gradient(90deg, color-mix(in srgb, ${providerColor} 38%, transparent) 0%, color-mix(in srgb, ${themeColor} 25%, transparent) 100%)` }}
    >
      <div className="relative glass px-4 py-3 rounded-lg h-full overflow-hidden">
        {/* Vendor watermark on right side - large with gradient fade */}
        <div
          className="absolute -right-4 top-1/2 -translate-y-1/2 pointer-events-none"
          style={CLUSTER_GRID_DIV_STYLE_2}
        >
          <CloudProviderIcon provider={provider} size={64} />
        </div>
        <div className="flex items-center gap-4">
          {dragHandle}
          {/* Status indicator */}
          <div className="shrink-0">
            {initialLoading ? (
              <StatusIndicator status="loading" size="md" showLabel={false} />
            ) : isTokenExpired(cluster) ? (
              <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center" title="Token Expired">
                <KeyRound className="w-3 h-3 text-red-400" />
              </div>
            ) : unreachable ? (
              <div className="w-6 h-6 rounded-full bg-yellow-500/20 flex items-center justify-center" title="Offline">
                <WifiOff className="w-3 h-3 text-yellow-400" />
              </div>
            ) : !isClusterHealthy(cluster) ? (
              <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center" title="Unhealthy">
                <AlertCircle className="w-3 h-3 text-orange-400" />
              </div>
            ) : (
              <StatusIndicator status="healthy" size="md" showLabel={false} />
            )}
          </div>

          {/* Provider and name */}
          <div className="flex items-center gap-2 min-w-0 shrink-0 w-48">
            <CloudProviderIcon provider={provider} size={16} />
            <span
              className="font-medium text-foreground truncate"
              title={cluster.aliases && cluster.aliases.length > 0
                ? `${cluster.context || cluster.name}\n\naka: ${cluster.aliases.join(', ')}`
                : cluster.context || cluster.name
              }
            >
              {cluster.context || cluster.name.split('/').pop()}
            </span>
            {cluster.authMethod && AUTH_BADGE_MAP[cluster.authMethod] && (
              <span
                className={`text-[9px] px-1 py-0.5 rounded shrink-0 ${AUTH_BADGE_MAP[cluster.authMethod].color}`}
                title={cluster.authMethod === 'exec'
                  ? `Auth: IAM (exec plugin)${getIAMRefreshHint(cluster) ? `\nLogin: ${getIAMRefreshHint(cluster)}` : ''}`
                  : `Auth: ${cluster.authMethod}`}
              >
                {AUTH_BADGE_MAP[cluster.authMethod].label}
              </span>
            )}
            {cluster.aliases && cluster.aliases.length > 0 && (
              <span title={`Also known as: ${cluster.aliases.join(', ')}`}>
                <StatusBadge color="purple" size="xs" className="shrink-0">
                  +{cluster.aliases.length}
                </StatusBadge>
              </span>
            )}
            {cluster.isCurrent && (
              <span title="Current context"><Star className="w-3 h-3 text-primary fill-current shrink-0" /></span>
            )}
          </div>

          {/* Server */}
          <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 flex-1 max-w-xs">
            <Globe className="w-3 h-3 shrink-0" />
            <span className="truncate">{cluster.server?.replace(/^https?:\/\//, '') || '-'}</span>
          </div>

          {/* Login hint for unreachable IAM clusters */}
          {cluster.authMethod === 'exec' && (isTokenExpired(cluster) || cluster.reachable === false) && (() => {
            const hint = getIAMRefreshHint(cluster)
            return hint ? (
              <span className="hidden md:flex items-center gap-1 text-2xs text-muted-foreground shrink-0">
                <code className="bg-black/5 dark:bg-white/5 px-1 rounded">{hint}</code>
                <CopyCmd text={hint} />
              </span>
            ) : null
          })()}

          {/* Metrics */}
          <div className="flex items-center gap-4 text-sm shrink-0">
            <div className="flex items-center gap-1.5" title={unreachable ? 'Nodes: Cluster offline' : hasCachedData ? `Nodes: ${cluster.nodeCount} worker nodes in cluster` : 'Nodes: Loading...'}>
              <Server className="w-3.5 h-3.5 text-muted-foreground" />
              <FlashingValue
                value={hasCachedData ? cluster.nodeCount : '-'}
                className={refreshing ? 'text-muted-foreground' : 'text-foreground'}
              />
            </div>
            <div className="flex items-center gap-1.5" title={unreachable ? 'CPU: Cluster offline' : hasCachedData ? `CPU: ${cluster.cpuCores} total CPU cores` : 'CPU: Loading...'}>
              <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
              <FlashingValue
                value={hasCachedData ? cluster.cpuCores : '-'}
                className={refreshing ? 'text-muted-foreground' : 'text-foreground'}
              />
            </div>
            <div className="flex items-center gap-1.5" title={unreachable ? 'Pods: Cluster offline' : hasCachedData ? `Pods: ${cluster.podCount} running pods` : 'Pods: Loading...'}>
              <Box className="w-3.5 h-3.5 text-muted-foreground" />
              <FlashingValue
                value={hasCachedData ? cluster.podCount : '-'}
                className={refreshing ? 'text-muted-foreground' : 'text-foreground'}
              />
            </div>
            {gpuInfo && gpuInfo.total > 0 && !unreachable && (
              <div className="flex items-center gap-1.5" title={`GPU: ${gpuInfo.allocated}/${gpuInfo.total} GPUs allocated`}>
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                <FlashingValue
                  value={gpuInfo.total}
                  className={refreshing ? 'text-muted-foreground' : 'text-foreground'}
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {LOCAL_PLATFORMS.has(provider) && (
              <LocalClusterControls
                clusterName={cluster.name}
                provider={provider}
                unreachable={unreachable}
              />
            )}
            {onRefreshCluster && (
              <button
                onClick={(e) => { e.stopPropagation(); onRefreshCluster() }}
                disabled={spinning}
                className={`p-1.5 rounded transition-colors ${
                  spinning ? 'text-blue-400' :
                  unreachable ? 'text-yellow-400 hover:bg-yellow-500/20' :
                  'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
                title={spinning ? t('common.refreshing') : t('common.refresh')}
                aria-label={spinning ? t('common.refreshing') : t('common.refresh')}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`} aria-hidden="true" />
              </button>
            )}
            {/* Remove cluster button — only for unreachable clusters (#5901) */}
            {isConnected && unreachable && onRemoveCluster && (cluster.source === 'kubeconfig' || !cluster.source) && (
              <RemoveClusterButton onRemove={onRemoveCluster} />
            )}
            {!permissionsLoading && !isClusterAdmin && !unreachable && (
              <span title="Limited permissions">
                <ShieldAlert className="w-3.5 h-3.5 text-yellow-400" />
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-primary" />
          </div>
        </div>
      </div>
    </div>
  )
})

// Compact card (minimal, just key metrics)
const CompactClusterCard = memo(function CompactClusterCard({
  cluster,
  gpuInfo,
  isConnected,
  onSelectCluster,
  onRemoveCluster,
  dragHandle }: Omit<ClusterCardProps, 'layoutMode' | 'permissionsLoading' | 'isClusterAdmin' | 'onRenameCluster' | 'onRefreshCluster'>) {
  const { t } = useTranslation()
  const unreachable = isClusterUnreachable(cluster)
  const hasCachedData = cluster.nodeCount !== undefined && cluster.nodeCount > 0
  const refreshing = cluster.refreshing === true

  const provider = (cluster.distribution as ReturnType<typeof detectCloudProvider>) ||
    detectCloudProvider(cluster.name, cluster.server, cluster.namespaces, cluster.user)
  const providerColor = getProviderColor(provider)
  const themeColor = 'var(--ks-purple)'

  return (
    <div
      onClick={onSelectCluster}
      onKeyDown={handleCardKeyDown(onSelectCluster)}
      role="button"
      tabIndex={0}
      aria-label={`Select cluster ${cluster.context || cluster.name}`}
      className="relative p-px rounded-lg cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 overflow-hidden"
      style={{
        /* Grid view: subtle gradient — provider at 38%, theme at 25% */
        background: `linear-gradient(135deg, color-mix(in srgb, ${providerColor} 38%, transparent) 0%, color-mix(in srgb, ${themeColor} 25%, transparent) 100%)` }}
    >
      <div className="relative glass p-3 rounded-lg h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          {dragHandle}
          {isTokenExpired(cluster) ? (
            <span title="Token Expired"><KeyRound className="w-3 h-3 text-red-400" /></span>
          ) : unreachable ? (
            <WifiOff className="w-3 h-3 text-yellow-400" />
          ) : !isClusterHealthy(cluster) ? (
            <AlertCircle className="w-3 h-3 text-orange-400" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-green-400" />
          )}
          <CloudProviderIcon provider={provider} size={14} />
          <span
            className="text-xs font-medium text-foreground truncate flex-1"
            title={cluster.aliases && cluster.aliases.length > 0
              ? `${cluster.context || cluster.name}\n\naka: ${cluster.aliases.join(', ')}`
              : cluster.context || cluster.name
            }
          >
            {cluster.context || cluster.name.split('/').pop()}
          </span>
          {cluster.aliases && cluster.aliases.length > 0 && (
            <span title={`Also known as: ${cluster.aliases.join(', ')}`}>
              <StatusBadge color="purple" size="xs" className="shrink-0">
                +{cluster.aliases.length}
              </StatusBadge>
            </span>
          )}
          {cluster.isCurrent && (
            <Star className="w-3 h-3 text-primary fill-current shrink-0" />
          )}
          {/* Remove cluster button — only for unreachable clusters (#5901) */}
          {isConnected && unreachable && onRemoveCluster && (cluster.source === 'kubeconfig' || !cluster.source) && (
            <RemoveClusterButton onRemove={onRemoveCluster} size="xs" />
          )}
        </div>

        {/* Metrics in 2x2 grid */}
        <div className="grid grid-cols-2 gap-1 text-center">
          <div className="p-1 rounded bg-secondary/30" title={unreachable ? 'Nodes: Cluster offline' : hasCachedData ? `Nodes: ${cluster.nodeCount} worker nodes` : 'Nodes: Loading...'}>
            <div className={`text-sm font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData ? cluster.nodeCount : '-'} />
            </div>
            <div className="text-2xs text-muted-foreground">{t('common.nodes')}</div>
          </div>
          <div className="p-1 rounded bg-secondary/30" title={unreachable ? 'CPU: Cluster offline' : hasCachedData ? `CPU: ${cluster.cpuCores} cores` : 'CPU: Loading...'}>
            <div className={`text-sm font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData ? cluster.cpuCores : '-'} />
            </div>
            <div className="text-2xs text-muted-foreground">{t('common.cpus')}</div>
          </div>
          <div className="p-1 rounded bg-secondary/30" title={unreachable ? 'Pods: Cluster offline' : hasCachedData ? `Pods: ${cluster.podCount} running` : 'Pods: Loading...'}>
            <div className={`text-sm font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData ? cluster.podCount : '-'} />
            </div>
            <div className="text-2xs text-muted-foreground">{t('common.pods')}</div>
          </div>
          <div className="p-1 rounded bg-secondary/30" title={unreachable ? 'GPU: Cluster offline' : gpuInfo ? `GPU: ${gpuInfo.allocated}/${gpuInfo.total} allocated` : 'GPU: None detected'}>
            <div className={`text-sm font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData && !unreachable ? (gpuInfo?.total || 0) : '-'} />
            </div>
            <div className="text-2xs text-muted-foreground">{t('common.gpus')}</div>
          </div>
        </div>
      </div>
    </div>
  )
})

// Sortable wrapper for individual cluster items
function SortableClusterItem({ id, children, onReorder }: { id: string; children: (dragHandle: React.ReactNode) => React.ReactNode; onReorder?: (names: string[]) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 10 : undefined }

  const dragHandle = onReorder ? (
    <button
      {...attributes}
      {...listeners}
      className="p-0.5 rounded hover:bg-secondary/80 cursor-grab active:cursor-grabbing shrink-0 touch-none"
      title="Drag to reorder"
    >
      <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />
    </button>
  ) : null

  return (
    <div ref={setNodeRef} style={style} data-testid={`cluster-row-${id}`}>
      {children(dragHandle)}
    </div>
  )
}

export const ClusterGrid = memo(function ClusterGrid({
  clusters,
  gpuByCluster,
  isConnected,
  permissionsLoading,
  isClusterAdmin,
  onSelectCluster,
  onRenameCluster,
  onRefreshCluster,
  onRemoveCluster,
  onReorder,
  layoutMode = 'grid' }: ClusterGridProps) {
  const { t } = useTranslation()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !onReorder) return
    const oldIndex = clusters.findIndex(c => c.name === active.id)
    const newIndex = clusters.findIndex(c => c.name === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(clusters, oldIndex, newIndex)
    onReorder(reordered.map(c => c.name))
  }

  if (clusters.length === 0) {
    return (
      <div className="text-center py-12 mb-6">
        <p className="text-muted-foreground">{t('cluster.noClustersMatchFilter')}</p>
      </div>
    )
  }

  // Grid layout classes based on mode
  const gridClasses = {
    grid: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4',
    list: 'flex flex-col gap-3',
    compact: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3',
    wide: 'grid grid-cols-1 lg:grid-cols-2 gap-4' }

  const sortingStrategy = layoutMode === 'list' ? verticalListSortingStrategy : rectSortingStrategy
  const clusterIds = clusters.map(c => c.name)

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={clusterIds} strategy={sortingStrategy}>
        <div className={`${gridClasses[layoutMode]} mb-6 pt-1`}>
          {clusters.map((cluster) => {
            const clusterKey = cluster.name.split('/')[0]
            const gpuInfo = gpuByCluster[clusterKey] || gpuByCluster[cluster.name]
            const clusterIsAdmin = isClusterAdmin(cluster.name)

            return (
              <SortableClusterItem key={cluster.name} id={cluster.name} onReorder={onReorder}>
                {(dragHandle) => {
                  const removeHandler = onRemoveCluster ? () => onRemoveCluster(cluster.name) : undefined
                  if (layoutMode === 'list') {
                    return (
                      <ListClusterCard
                        cluster={cluster}
                        gpuInfo={gpuInfo}
                        isConnected={isConnected}
                        permissionsLoading={permissionsLoading}
                        isClusterAdmin={clusterIsAdmin}
                        onSelectCluster={() => onSelectCluster(cluster.name)}
                        onRefreshCluster={onRefreshCluster ? () => onRefreshCluster(cluster.name) : undefined}
                        onRemoveCluster={removeHandler}
                        dragHandle={dragHandle}
                      />
                    )
                  }

                  if (layoutMode === 'compact') {
                    return (
                      <CompactClusterCard
                        cluster={cluster}
                        gpuInfo={gpuInfo}
                        isConnected={isConnected}
                        onSelectCluster={() => onSelectCluster(cluster.name)}
                        onRemoveCluster={removeHandler}
                        dragHandle={dragHandle}
                      />
                    )
                  }

                  // grid and wide use the full card
                  return (
                    <FullClusterCard
                      cluster={cluster}
                      gpuInfo={gpuInfo}
                      isConnected={isConnected}
                      permissionsLoading={permissionsLoading}
                      isClusterAdmin={clusterIsAdmin}
                      onSelectCluster={() => onSelectCluster(cluster.name)}
                      onRenameCluster={() => onRenameCluster(cluster.name)}
                      onRefreshCluster={onRefreshCluster ? () => onRefreshCluster(cluster.name) : undefined}
                      onRemoveCluster={removeHandler}
                      dragHandle={dragHandle}
                    />
                  )
                }}
              </SortableClusterItem>
            )
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
})
