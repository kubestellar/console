import { useState, useMemo, useCallback, useEffect } from 'react'
import { useClusters } from '../../hooks/useMCP'
import { StatusIndicator } from '../charts/StatusIndicator'
import { useToast } from '../ui/Toast'
import { RefreshCw, Box, Loader2, Package, Ship, Layers, Cog, ChevronDown, ExternalLink } from 'lucide-react'
import { cn } from '../../lib/cn'

// Release types
type ReleaseType = 'helm' | 'kustomize' | 'operator'

interface HelmRelease {
  type: 'helm'
  name: string
  namespace: string
  revision: string
  updated: string
  status: string
  chart: string
  app_version: string
  cluster?: string
}

interface Kustomization {
  type: 'kustomize'
  name: string
  namespace: string
  path: string
  sourceRef: string
  status: string
  lastApplied: string
  cluster?: string
}

interface Operator {
  type: 'operator'
  name: string
  namespace: string
  version: string
  status: string
  channel: string
  source: string
  cluster?: string
}

type Release = HelmRelease | Kustomization | Operator

// Type icons and labels
const TYPE_CONFIG: Record<ReleaseType, { icon: typeof Ship; label: string; color: string }> = {
  helm: { icon: Ship, label: 'Helm', color: 'text-blue-400 bg-blue-500/20' },
  kustomize: { icon: Layers, label: 'Kustomize', color: 'text-purple-400 bg-purple-500/20' },
  operator: { icon: Cog, label: 'Operator', color: 'text-orange-400 bg-orange-500/20' },
}

function getTimeAgo(timestamp: string | undefined): string {
  if (!timestamp) return 'Unknown'
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return `${diffDays}d ago`
  if (diffHours > 0) return `${diffHours}h ago`
  if (diffMins > 0) return `${diffMins}m ago`
  return 'Just now'
}

export function GitOps() {
  const { clusters } = useClusters()
  const { showToast } = useToast()
  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<ReleaseType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [releases, setReleases] = useState<Release[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showTypeDropdown, setShowTypeDropdown] = useState(false)

  // Fetch GitOps releases
  const fetchReleases = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const clusterParam = selectedCluster ? `?cluster=${encodeURIComponent(selectedCluster)}` : ''

      // Fetch all release types in parallel
      const [helmRes, kustomizeRes, operatorRes] = await Promise.allSettled([
        fetch(`/api/gitops/helm-releases${clusterParam}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        }),
        fetch(`/api/gitops/kustomizations${clusterParam}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        }),
        fetch(`/api/gitops/operators${clusterParam}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        }),
      ])

      const allReleases: Release[] = []

      // Process Helm releases
      if (helmRes.status === 'fulfilled' && helmRes.value.ok) {
        const data = await helmRes.value.json()
        const helmReleases = (data.releases || []).map((r: Omit<HelmRelease, 'type'>) => ({
          ...r,
          type: 'helm' as const,
        }))
        allReleases.push(...helmReleases)
      }

      // Process Kustomizations
      if (kustomizeRes.status === 'fulfilled' && kustomizeRes.value.ok) {
        const data = await kustomizeRes.value.json()
        const kustomizations = (data.kustomizations || []).map((k: Omit<Kustomization, 'type'>) => ({
          ...k,
          type: 'kustomize' as const,
        }))
        allReleases.push(...kustomizations)
      }

      // Process Operators
      if (operatorRes.status === 'fulfilled' && operatorRes.value.ok) {
        const data = await operatorRes.value.json()
        const operators = (data.operators || []).map((o: Omit<Operator, 'type'>) => ({
          ...o,
          type: 'operator' as const,
        }))
        allReleases.push(...operators)
      }

      setReleases(allReleases)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch GitOps releases')
      setReleases([])
    } finally {
      setIsLoading(false)
    }
  }, [selectedCluster])

  // Fetch releases on mount and when cluster changes
  useEffect(() => {
    fetchReleases()
  }, [fetchReleases])

  // Handle refresh
  const handleRefresh = useCallback(() => {
    fetchReleases()
    showToast('Refreshing GitOps releases...', 'info')
  }, [fetchReleases, showToast])

  const filteredReleases = useMemo(() => {
    return releases.filter(release => {
      // Filter by type
      if (typeFilter !== 'all' && release.type !== typeFilter) return false

      // Filter by status
      if (statusFilter === 'deployed' && release.status !== 'deployed' && release.status !== 'Ready') return false
      if (statusFilter === 'failed' && release.status !== 'failed' && release.status !== 'Failed') return false
      if (statusFilter === 'pending' && !release.status.toLowerCase().includes('pending') && !release.status.toLowerCase().includes('progressing')) return false
      return true
    })
  }, [releases, typeFilter, statusFilter])

  const stats = useMemo(() => {
    const helmReleases = releases.filter(r => r.type === 'helm')
    const kustomizations = releases.filter(r => r.type === 'kustomize')
    const operators = releases.filter(r => r.type === 'operator')

    return {
      total: releases.length,
      helm: helmReleases.length,
      kustomize: kustomizations.length,
      operators: operators.length,
      deployed: releases.filter(r => r.status === 'deployed' || r.status === 'Ready' || r.status === 'Succeeded').length,
      failed: releases.filter(r => r.status === 'failed' || r.status === 'Failed').length,
    }
  }, [releases])

  const getStatusColor = (status: string) => {
    const s = status.toLowerCase()
    if (['deployed', 'ready', 'succeeded', 'running'].includes(s)) return 'text-green-400 bg-green-500/20'
    if (['failed', 'error'].includes(s)) return 'text-red-400 bg-red-500/20'
    if (['pending', 'progressing', 'installing'].includes(s)) return 'text-blue-400 bg-blue-500/20'
    if (['superseded', 'unknown'].includes(s)) return 'text-muted-foreground bg-card/50'
    return 'text-muted-foreground bg-card'
  }

  const getHealthStatus = (status: string): 'healthy' | 'warning' | 'error' => {
    const s = status.toLowerCase()
    if (['deployed', 'ready', 'succeeded', 'running'].includes(s)) return 'healthy'
    if (['failed', 'error'].includes(s)) return 'error'
    return 'warning'
  }

  const getBorderColor = (release: Release) => {
    const status = getHealthStatus(release.status)
    if (status === 'healthy') return 'border-l-green-500'
    if (status === 'error') return 'border-l-red-500'
    return 'border-l-blue-500'
  }

  const renderRelease = (release: Release, index: number) => {
    const TypeIcon = TYPE_CONFIG[release.type].icon
    const typeConfig = TYPE_CONFIG[release.type]

    return (
      <div
        key={`${release.type}-${release.namespace}-${release.name}-${index}`}
        className={cn(
          'glass p-4 rounded-lg border-l-4 cursor-pointer hover:bg-secondary/30 transition-colors',
          getBorderColor(release)
        )}
        onClick={() => {
          // Drill-down handler would go here
          console.log('Open drill-down for:', release)
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <StatusIndicator status={getHealthStatus(release.status)} size="lg" />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-foreground">{release.name}</span>
                <span className={cn('text-xs px-2 py-0.5 rounded flex items-center gap-1', typeConfig.color)}>
                  <TypeIcon className="w-3 h-3" />
                  {typeConfig.label}
                </span>
                <span className={cn('text-xs px-2 py-0.5 rounded capitalize', getStatusColor(release.status))}>
                  {release.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                <span className="flex items-center gap-1" title="Kubernetes Namespace">
                  <Box className="w-3 h-3" />
                  <span>{release.namespace}</span>
                </span>
                {release.type === 'helm' && (
                  <span className="flex items-center gap-1" title="Revision">
                    <span className="text-muted-foreground/50">rev</span>
                    <span>{(release as HelmRelease).revision}</span>
                  </span>
                )}
                {release.cluster && (
                  <span className="flex items-center gap-1" title="Cluster">
                    <span className="text-muted-foreground/50">@</span>
                    <span>{release.cluster}</span>
                  </span>
                )}
              </div>
              {release.type === 'helm' && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1" title="Helm Chart">
                  <Package className="w-3 h-3 text-purple-400" />
                  <span className="font-mono">{(release as HelmRelease).chart}</span>
                  {(release as HelmRelease).app_version && (
                    <span className="text-muted-foreground/70">v{(release as HelmRelease).app_version}</span>
                  )}
                </div>
              )}
              {release.type === 'kustomize' && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1" title="Path">
                  <Layers className="w-3 h-3 text-purple-400" />
                  <span className="font-mono">{(release as Kustomization).path}</span>
                </div>
              )}
              {release.type === 'operator' && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1" title="Operator">
                  <Cog className="w-3 h-3 text-orange-400" />
                  <span className="font-mono">{(release as Operator).source}</span>
                  <span className="text-muted-foreground/70">({(release as Operator).channel})</span>
                </div>
              )}
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground flex items-center gap-2">
            <span>
              {release.type === 'helm' && `Updated: ${getTimeAgo((release as HelmRelease).updated)}`}
              {release.type === 'kustomize' && `Applied: ${getTimeAgo((release as Kustomization).lastApplied)}`}
              {release.type === 'operator' && `v${(release as Operator).version}`}
            </span>
            <ExternalLink className="w-3 h-3 opacity-50" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-16">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">GitOps Releases</h1>
          <p className="text-muted-foreground">Helm, Kustomize, and Operator deployments across your clusters</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="px-4 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card transition-colors flex items-center gap-2"
        >
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-foreground">{stats.total}</div>
          <div className="text-sm text-muted-foreground">Total</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-blue-400">{stats.helm}</div>
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <Ship className="w-3 h-3" /> Helm
          </div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-purple-400">{stats.kustomize}</div>
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <Layers className="w-3 h-3" /> Kustomize
          </div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-orange-400">{stats.operators}</div>
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <Cog className="w-3 h-3" /> Operators
          </div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-green-400">{stats.deployed}</div>
          <div className="text-sm text-muted-foreground">Deployed</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-red-400">{stats.failed}</div>
          <div className="text-sm text-muted-foreground">Failed</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        {/* Cluster filter */}
        <select
          value={selectedCluster}
          onChange={(e) => setSelectedCluster(e.target.value)}
          className="px-4 py-2 rounded-lg bg-card/50 border border-border text-foreground text-sm"
        >
          <option value="">All Clusters</option>
          {clusters.map((cluster) => (
            <option key={cluster.name} value={cluster.context || cluster.name.split('/').pop()}>
              {cluster.context || cluster.name.split('/').pop()}
            </option>
          ))}
        </select>

        {/* Type filter dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowTypeDropdown(!showTypeDropdown)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              typeFilter !== 'all'
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            )}
          >
            {typeFilter === 'all' ? (
              <>All Types</>
            ) : (
              <>
                {(() => { const T = TYPE_CONFIG[typeFilter].icon; return <T className="w-4 h-4" /> })()}
                {TYPE_CONFIG[typeFilter].label}
              </>
            )}
            <ChevronDown className="w-4 h-4" />
          </button>
          {showTypeDropdown && (
            <div className="absolute top-full left-0 mt-1 w-40 bg-card border border-border rounded-lg shadow-xl z-10 py-1">
              <button
                onClick={() => { setTypeFilter('all'); setShowTypeDropdown(false) }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm transition-colors',
                  typeFilter === 'all' ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                )}
              >
                All Types
              </button>
              {(Object.keys(TYPE_CONFIG) as ReleaseType[]).map((type) => {
                const Icon = TYPE_CONFIG[type].icon
                return (
                  <button
                    key={type}
                    onClick={() => { setTypeFilter(type); setShowTypeDropdown(false) }}
                    className={cn(
                      'w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors',
                      typeFilter === type ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {TYPE_CONFIG[type].label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Status filter */}
        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              statusFilter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            )}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter('deployed')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              statusFilter === 'deployed'
                ? 'bg-green-500 text-white'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            )}
          >
            Deployed
          </button>
          <button
            onClick={() => setStatusFilter('failed')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              statusFilter === 'failed'
                ? 'bg-red-500 text-white'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            )}
          >
            Failed
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              statusFilter === 'pending'
                ? 'bg-blue-500 text-white'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            )}
          >
            Pending
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-lg text-foreground">Loading GitOps releases...</p>
        </div>
      ) : filteredReleases.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg text-foreground">No GitOps releases found</p>
          <p className="text-sm text-muted-foreground">
            {typeFilter !== 'all'
              ? `No ${TYPE_CONFIG[typeFilter].label} releases found. Try changing the filter.`
              : 'Install Helm charts, Kustomizations, or Operators to see them here'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReleases.map((release, i) => renderRelease(release, i))}
        </div>
      )}

      {/* Info */}
      <div className="mt-8 p-4 rounded-lg bg-card/30 border border-border">
        <h3 className="text-lg font-semibold text-foreground mb-3">GitOps Release Management</h3>
        <p className="text-sm text-muted-foreground mb-3">
          This page shows all GitOps-managed resources across your clusters:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <Ship className="w-4 h-4 text-blue-400 mt-0.5" />
            <div>
              <span className="font-medium text-foreground">Helm Releases</span>
              <p className="text-muted-foreground text-xs">Charts deployed via helm install/upgrade</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Layers className="w-4 h-4 text-purple-400 mt-0.5" />
            <div>
              <span className="font-medium text-foreground">Kustomizations</span>
              <p className="text-muted-foreground text-xs">Flux/ArgoCD managed overlays</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Cog className="w-4 h-4 text-orange-400 mt-0.5" />
            <div>
              <span className="font-medium text-foreground">Operators</span>
              <p className="text-muted-foreground text-xs">OLM-managed operator subscriptions</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
