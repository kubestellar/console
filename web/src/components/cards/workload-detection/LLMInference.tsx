import { useState, useMemo, useRef, useEffect } from 'react'
import {
  ExternalLink, Cpu, Layers, AlertCircle, Play, Pause, RefreshCw,
  Filter, ChevronDown, Server, Activity, Network, Box, Search
} from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { CardControls, SortDirection } from '../../ui/CardControls'
import { usePagination, Pagination } from '../../ui/Pagination'
import { useClusters } from '../../../hooks/useMCP'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useCachedLLMdServers } from '../../../hooks/useCachedData'
import type { LLMdServer, LLMdComponentType } from '../../../hooks/useLLMd'
import { LLMD_CLUSTERS } from './shared'

interface LLMInferenceProps {
  config?: Record<string, unknown>
}

type LLMdSortByOption = 'name' | 'status' | 'namespace' | 'type' | 'component'

const LLMD_SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'namespace' as const, label: 'Namespace' },
  { value: 'type' as const, label: 'Type' },
  { value: 'component' as const, label: 'Component' },
]

const COMPONENT_FILTERS: { value: LLMdComponentType | 'all' | 'autoscale', label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'model', label: 'Models' },
  { value: 'epp', label: 'EPP' },
  { value: 'gateway', label: 'Gateway' },
  { value: 'prometheus', label: 'Prometheus' },
  { value: 'autoscale', label: 'Auto-scale' },
]

export function LLMInference({ config: _config }: LLMInferenceProps) {
  const { servers, isLoading, isRefreshing, refetch, isFailed, consecutiveFailures, error } = useCachedLLMdServers(LLMD_CLUSTERS)

  // Debug logging
  console.log('[LLMInference] render:', { serversCount: servers.length, isLoading, isRefreshing, isFailed, error })
  const { deduplicatedClusters: allClusters } = useClusters()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [sortBy, setSortBy] = useState<LLMdSortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [componentFilter, setComponentFilter] = useState<LLMdComponentType | 'all' | 'autoscale'>('all')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kubestellar-card-filter:llm-inference')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const [showComponentFilter, setShowComponentFilter] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const clusterFilterRef = useRef<HTMLDivElement>(null)
  const componentFilterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(event.target as Node)) {
        setShowClusterFilter(false)
      }
      if (componentFilterRef.current && !componentFilterRef.current.contains(event.target as Node)) {
        setShowComponentFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    localStorage.setItem('kubestellar-card-filter:llm-inference', JSON.stringify(localClusterFilter))
  }, [localClusterFilter])

  const toggleClusterFilter = (clusterName: string) => {
    setLocalClusterFilter(prev => prev.includes(clusterName) ? prev.filter(c => c !== clusterName) : [...prev, clusterName])
  }
  const clearClusterFilter = () => setLocalClusterFilter([])

  const availableClustersForFilter = useMemo(() => {
    const reachable = allClusters.filter(c => c.reachable !== false)
    if (isAllClustersSelected) return reachable
    return reachable.filter(c => globalSelectedClusters.includes(c.name))
  }, [allClusters, globalSelectedClusters, isAllClustersSelected])

  const filteredServers = useMemo(() => {
    let result = localClusterFilter.length === 0 ? servers : servers.filter(s => localClusterFilter.includes(s.cluster))

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.namespace.toLowerCase().includes(q) ||
        s.cluster.toLowerCase().includes(q) ||
        s.status.toLowerCase().includes(q) ||
        s.componentType.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q) ||
        (s.model && s.model.toLowerCase().includes(q))
      )
    }

    // Apply component filter
    if (componentFilter !== 'all') {
      if (componentFilter === 'autoscale') {
        result = result.filter(s => s.hasAutoscaler)
      } else {
        result = result.filter(s => s.componentType === componentFilter)
      }
    }

    // Sort by selected field
    const statusOrder: Record<string, number> = { running: 0, scaling: 1, stopped: 2, error: 3 }
    const componentOrder: Record<string, number> = { model: 0, epp: 1, gateway: 2, prometheus: 3, autoscaler: 4, other: 5 }
    result = [...result].sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case 'status':
          cmp = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
          break
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'namespace':
          cmp = a.namespace.localeCompare(b.namespace)
          break
        case 'component':
          cmp = (componentOrder[a.componentType] ?? 99) - (componentOrder[b.componentType] ?? 99)
          break
        case 'type':
          cmp = a.type.localeCompare(b.type)
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })

    return result
  }, [servers, localClusterFilter, searchQuery, componentFilter, sortBy, sortDirection])

  const effectivePerPage = limit === 'unlimited' ? 100 : limit
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, needsPagination } = usePagination(filteredServers, effectivePerPage)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 flex items-center gap-1"><Play className="w-2.5 h-2.5" /> Running</span>
      case 'scaling':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 flex items-center gap-1"><RefreshCw className="w-2.5 h-2.5 animate-spin" /> Scaling</span>
      case 'stopped':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400 flex items-center gap-1"><Pause className="w-2.5 h-2.5" /> Stopped</span>
      default:
        return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">{status}</span>
    }
  }

  const getTypeBadge = (type: LLMdServer['type']) => {
    const colors: Record<string, string> = {
      'vllm': 'bg-purple-500/20 text-purple-400',
      'tgi': 'bg-blue-500/20 text-blue-400',
      'llm-d': 'bg-cyan-500/20 text-cyan-400',
      'triton': 'bg-green-500/20 text-green-400',
      'unknown': 'bg-gray-500/20 text-gray-400',
    }
    return colors[type] || 'bg-gray-500/20 text-gray-400'
  }

  const getTypeLabel = (type: LLMdServer['type']) => {
    const labels: Record<string, string> = {
      'vllm': 'vLLM',
      'tgi': 'TGI',
      'llm-d': 'llm-d',
      'triton': 'Triton',
      'unknown': 'Unknown',
    }
    return labels[type] || type
  }

  const getComponentBadge = (componentType: LLMdComponentType) => {
    const config: Record<LLMdComponentType, { bg: string, text: string, label: string }> = {
      'model': { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Model' },
      'epp': { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: 'EPP' },
      'gateway': { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Gateway' },
      'prometheus': { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Prometheus' },
      'autoscaler': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Autoscaler' },
      'other': { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Other' },
    }
    return config[componentType] || config['other']
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={50} />
        <Skeleton variant="rounded" height={50} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClustersForFilter.length}
            </span>
          )}
          {componentFilter !== 'all' && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Box className="w-3 h-3" />
              {COMPONENT_FILTERS.find(f => f.value === componentFilter)?.label}
            </span>
          )}
          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
            {filteredServers.filter(s => s.status === 'running').length} running
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Component type filter */}
          <div ref={componentFilterRef} className="relative">
            <button
              onClick={() => setShowComponentFilter(!showComponentFilter)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                componentFilter !== 'all'
                  ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400'
                  : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
              }`}
              title="Filter by component type"
            >
              <Box className="w-3 h-3" />
              <ChevronDown className="w-3 h-3" />
            </button>
            {showComponentFilter && (
              <div className="absolute top-full right-0 mt-1 w-40 rounded-lg bg-card border border-border shadow-lg z-50">
                <div className="p-1">
                  {COMPONENT_FILTERS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setComponentFilter(opt.value)
                        setShowComponentFilter(false)
                      }}
                      className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                        componentFilter === opt.value
                          ? 'bg-cyan-500/20 text-cyan-400'
                          : 'hover:bg-secondary text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Cluster filter */}
          {availableClustersForFilter.length >= 1 && (
            <div ref={clusterFilterRef} className="relative">
              <button
                onClick={() => setShowClusterFilter(!showClusterFilter)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                  localClusterFilter.length > 0
                    ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
                title="Filter by cluster"
              >
                <Filter className="w-3 h-3" />
                <ChevronDown className="w-3 h-3" />
              </button>
              {showClusterFilter && (
                <div className="absolute top-full right-0 mt-1 w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50">
                  <div className="p-1">
                    <button onClick={clearClusterFilter} className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'}`}>All clusters</button>
                    {availableClustersForFilter.map(cluster => (
                      <button key={cluster.name} onClick={() => toggleClusterFilter(cluster.name)} className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${localClusterFilter.includes(cluster.name) ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'}`}>{cluster.name}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            sortOptions={LLMD_SORT_OPTIONS}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
        </div>
      </div>

      {/* Search input */}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search servers..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs mb-4">
        <AlertCircle className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-purple-400 font-medium">llm-d Inference Detection</p>
          <p className="text-muted-foreground">
            Auto-detects vLLM, TGI, LLM-d, and Triton inference servers.{' '}
            <a href="https://docs.vllm.ai/en/latest/getting_started/installation.html" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
              vLLM docs <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>
        </div>
      </div>

      {/* Server list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {paginatedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Cpu className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">{error ? `Error: ${error}` : 'No inference servers found'}</p>
            <p className="text-xs">
              {isFailed ? `Failed after ${consecutiveFailures} attempts` : 'Scanning vllm-d and platform-eval clusters'}
            </p>
            {servers.length === 0 && !isLoading && !error && (
              <button onClick={() => refetch()} className="mt-2 text-xs text-purple-400 hover:underline">
                Retry
              </button>
            )}
          </div>
        ) : paginatedItems.map((server) => {
          const compBadge = getComponentBadge(server.componentType)
          return (
            <div key={server.id} className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-foreground truncate" title={server.name}>{server.name}</span>
                  {/* Component type badge */}
                  <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${compBadge.bg} ${compBadge.text}`}>
                    {compBadge.label}
                  </span>
                  {/* Server type badge (vLLM, TGI, etc.) for model components */}
                  {server.componentType === 'model' && server.type !== 'unknown' && (
                    <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${getTypeBadge(server.type)}`}>
                      {getTypeLabel(server.type)}
                    </span>
                  )}
                  {/* Autoscaler badge */}
                  {server.hasAutoscaler && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 flex-shrink-0" title={server.autoscalerType === 'va' ? 'VariantAutoscaling' : server.autoscalerType === 'both' ? 'HPA + VariantAutoscaling' : 'HorizontalPodAutoscaler'}>
                      {server.autoscalerType === 'va' ? 'VA' : server.autoscalerType === 'both' ? 'HPA+VA' : 'HPA'}
                    </span>
                  )}
                </div>
                {getStatusBadge(server.status)}
              </div>
              <div className="flex items-center gap-2 text-xs mb-2">
                <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{server.namespace}</span>
                <span className="text-muted-foreground/60">on {server.cluster}</span>
                {/* Gateway status indicator */}
                {server.gatewayStatus && (
                  <span
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                      server.gatewayStatus === 'running'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                    title={`Gateway (${server.gatewayType || 'envoy'}): ${server.gatewayStatus}`}
                  >
                    <Network className="w-3 h-3" />
                    {server.gatewayType === 'istio' ? 'Istio' : server.gatewayType === 'kgateway' ? 'KGateway' : 'GW'}
                  </span>
                )}
                {/* Prometheus status indicator */}
                {server.prometheusStatus && (
                  <span
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                      server.prometheusStatus === 'running'
                        ? 'bg-orange-500/20 text-orange-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                    title={`Prometheus: ${server.prometheusStatus}`}
                  >
                    <Activity className="w-3 h-3" />
                    Prom
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  {server.componentType === 'model' && (
                    <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> {server.model}</span>
                  )}
                  {server.gpu && server.gpuCount && (
                    <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> {server.gpuCount}x {server.gpu}</span>
                  )}
                </div>
                <span className="text-muted-foreground/60">{server.readyReplicas}/{server.replicas} replicas</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={effectivePerPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}
