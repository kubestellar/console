/**
 * Stack Selector Component
 *
 * Dropdown for selecting an llm-d stack to focus visualizations on.
 * Shows stack health, component counts, namespace, and GPU usage.
 * Includes search, sort, and filter capabilities.
 */
import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronUp, Server, Layers, RefreshCw, Cpu, Search, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOptionalStack } from '../../../contexts/StackContext'
import type { LLMdStack } from '../../../hooks/useStackDiscovery'

const STATUS_COLORS = {
  healthy: 'bg-green-500',
  degraded: 'bg-amber-500',
  unhealthy: 'bg-red-500',
  unknown: 'bg-slate-500',
}

type SortField = 'name' | 'accelerators' | 'status' | 'replicas'
type SortDirection = 'asc' | 'desc'

type AcceleratorType = 'GPU' | 'TPU' | 'AIU' | 'XPU'

interface AcceleratorInfo {
  count: number
  type: string
  category: AcceleratorType
}

// Estimate accelerator count and type from replicas and cluster/model info
// Uses 1 accelerator per replica as conservative estimate
function estimateAccelerators(stack: LLMdStack): AcceleratorInfo {
  const prefillCount = stack.components.prefill.reduce((sum, c) => sum + c.replicas, 0)
  const decodeCount = stack.components.decode.reduce((sum, c) => sum + c.replicas, 0)
  const unifiedCount = stack.components.both.reduce((sum, c) => sum + c.replicas, 0)
  const total = prefillCount + decodeCount + unifiedCount

  // Infer accelerator type from cluster name, namespace, or model
  const cluster = stack.cluster.toLowerCase()
  const namespace = stack.namespace.toLowerCase()
  const model = stack.model?.toLowerCase() || ''

  // Check for TPU clusters (Google Cloud)
  if (cluster.includes('tpu') || namespace.includes('tpu')) {
    return { count: total, type: 'Google TPU v5p', category: 'TPU' }
  }

  // Check for AIU clusters (IBM)
  if (cluster.includes('aiu') || namespace.includes('aiu') || cluster.includes('ibm')) {
    return { count: total, type: 'IBM AIU', category: 'AIU' }
  }

  // Check for Intel XPU
  if (cluster.includes('intel') || cluster.includes('xpu')) {
    return { count: total, type: 'Intel Gaudi2', category: 'XPU' }
  }

  // Default: NVIDIA GPU - infer specific type from model size
  let gpuType = 'NVIDIA H100'
  if (model.includes('70b') || model.includes('65b')) {
    gpuType = 'NVIDIA H100 80GB'
  } else if (model.includes('13b') || model.includes('7b')) {
    gpuType = 'NVIDIA A100 40GB'
  } else if (model.includes('granite')) {
    gpuType = 'NVIDIA A100 80GB'
  }

  return { count: total, type: gpuType, category: 'GPU' }
}

function getStatusPriority(status: LLMdStack['status']): number {
  switch (status) {
    case 'healthy': return 0
    case 'degraded': return 1
    case 'unhealthy': return 2
    default: return 3
  }
}

interface StackOptionProps {
  stack: LLMdStack
  isSelected: boolean
  onSelect: () => void
}

function StackOption({ stack, isSelected, onSelect }: StackOptionProps) {
  const prefillCount = stack.components.prefill.reduce((sum, c) => sum + c.replicas, 0)
  const decodeCount = stack.components.decode.reduce((sum, c) => sum + c.replicas, 0)
  const unifiedCount = stack.components.both.reduce((sum, c) => sum + c.replicas, 0)
  const gpuInfo = estimateAccelerators(stack)

  return (
    <button
      onClick={onSelect}
      className={`w-full px-3 py-2.5 text-left hover:bg-slate-700/50 transition-colors border-b border-slate-700/50 last:border-0 ${
        isSelected ? 'bg-slate-700/70' : ''
      }`}
    >
      {/* Row 1: Name and replica counts */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {/* Status indicator */}
          <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[stack.status]}`} />

          {/* Stack name */}
          <span className="text-sm font-medium text-white truncate max-w-[200px]">
            {stack.name}
          </span>
        </div>

        {/* Replica counts - show all non-zero counts */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          {prefillCount > 0 && (
            <span className="text-purple-400" title="Prefill replicas">
              P:{prefillCount}
            </span>
          )}
          {decodeCount > 0 && (
            <span className="text-green-400" title="Decode replicas">
              D:{decodeCount}
            </span>
          )}
          {unifiedCount > 0 && prefillCount === 0 && decodeCount === 0 && (
            <span title="Unified replicas">
              <Server className="w-3 h-3 inline mr-0.5" />
              {unifiedCount}
            </span>
          )}
          {prefillCount === 0 && decodeCount === 0 && unifiedCount === 0 && (
            <span className="text-slate-500 italic" title="No running pods - scaled to 0">
              0 pods
            </span>
          )}
        </div>
      </div>

      {/* Row 2: Namespace and metadata */}
      <div className="flex items-center gap-2 text-[10px]">
        {/* Namespace (primary context) */}
        <span className="px-1.5 py-0.5 rounded bg-slate-700/80 text-slate-300 font-medium">
          ns:{stack.namespace}
        </span>

        {/* Cluster */}
        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
          {stack.cluster}
        </span>

        {/* GPU count and type */}
        {gpuInfo.count > 0 && (
          <span
            className="flex items-center gap-1 text-cyan-400"
            title={`${gpuInfo.count}× ${gpuInfo.type}`}
          >
            <Cpu className="w-3 h-3" />
            <span>{gpuInfo.count}×</span>
            <span className="text-cyan-400/70 truncate max-w-[80px]">{gpuInfo.type.replace('NVIDIA ', '')}</span>
          </span>
        )}

        {/* Autoscaler indicator with value */}
        {stack.autoscaler && (
          <span
            className={`px-1 py-0.5 rounded font-medium ${
              stack.autoscaler.type === 'WVA' ? 'bg-purple-500/20 text-purple-400' :
              stack.autoscaler.type === 'HPA' ? 'bg-blue-500/20 text-blue-400' :
              'bg-green-500/20 text-green-400'
            }`}
            title={`${stack.autoscaler.type}: ${stack.autoscaler.name || 'enabled'}${
              stack.autoscaler.minReplicas !== undefined ? ` (min: ${stack.autoscaler.minReplicas}, max: ${stack.autoscaler.maxReplicas})` : ''
            }`}
          >
            {stack.autoscaler.type === 'VPA' ? 'VPA' : (
              `${stack.autoscaler.type}: ${stack.autoscaler.desiredReplicas ?? stack.autoscaler.currentReplicas ?? (
                stack.autoscaler.minReplicas !== undefined ? `${stack.autoscaler.minReplicas}-${stack.autoscaler.maxReplicas}` : '?'
              )}`
            )}
          </span>
        )}

        {/* Model name */}
        {stack.model && (
          <span className="text-slate-500 truncate max-w-[120px] ml-auto" title={`model: ${stack.model}`}>
            {stack.model}
          </span>
        )}
      </div>
    </button>
  )
}

export function StackSelector() {
  const stackContext = useOptionalStack()
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isOpen])

  // If no context, show placeholder
  if (!stackContext) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800/50 text-slate-500 text-sm">
        <Layers className="w-4 h-4" />
        <span>No stack data</span>
      </div>
    )
  }

  const { stacks, isLoading, selectedStack, selectedStackId, setSelectedStackId, refetch, isDemoMode } = stackContext

  // Filter and sort stacks
  const filteredAndSortedStacks = useMemo(() => {
    let result = stacks

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(stack => {
        const gpuInfo = estimateAccelerators(stack)
        return (
          stack.name.toLowerCase().includes(query) ||
          stack.namespace.toLowerCase().includes(query) ||
          stack.cluster.toLowerCase().includes(query) ||
          stack.model?.toLowerCase().includes(query) ||
          gpuInfo.type.toLowerCase().includes(query)
        )
      })
    }

    // Sort stacks with stable secondary sort by name
    result = [...result].sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'accelerators':
          comparison = estimateAccelerators(a).count - estimateAccelerators(b).count
          break
        case 'status':
          comparison = getStatusPriority(a.status) - getStatusPriority(b.status)
          break
        case 'replicas':
          comparison = a.totalReplicas - b.totalReplicas
          break
      }
      // Apply sort direction
      comparison = sortDirection === 'asc' ? comparison : -comparison
      // Stable secondary sort by name, then by id
      if (comparison === 0) {
        comparison = a.name.localeCompare(b.name)
      }
      if (comparison === 0) {
        comparison = a.id.localeCompare(b.id)
      }
      return comparison
    })

    return result
  }, [stacks, searchQuery, sortField, sortDirection])

  // Handle refetch with error tracking
  const handleRefetch = async () => {
    setFetchError(null)
    try {
      await refetch()
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to refresh stacks')
    }
  }

  // Group stacks by cluster
  const stacksByCluster = filteredAndSortedStacks.reduce((acc, stack) => {
    if (!acc[stack.cluster]) {
      acc[stack.cluster] = []
    }
    acc[stack.cluster].push(stack)
    return acc
  }, {} as Record<string, LLMdStack[]>)

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const totalAccelerators = stacks.reduce((sum, s) => sum + estimateAccelerators(s).count, 0)

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-all ${
          isOpen
            ? 'bg-slate-700 border-slate-600'
            : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
        }`}
      >
        {selectedStack ? (
          <>
            <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[selectedStack.status]}`} />
            <span className="text-sm font-medium text-white max-w-[140px] truncate">
              {selectedStack.name}
            </span>
            <span className="text-[10px] text-slate-500">ns:{selectedStack.namespace}</span>

            {/* P/D replica counts */}
            {(() => {
              const pCount = selectedStack.components.prefill.reduce((sum, c) => sum + c.replicas, 0)
              const dCount = selectedStack.components.decode.reduce((sum, c) => sum + c.replicas, 0)
              const hasDisagg = pCount > 0 || dCount > 0
              return hasDisagg ? (
                <span className="flex items-center gap-1 text-[10px]">
                  <span className="text-purple-400">P:{pCount}</span>
                  <span className="text-green-400">D:{dCount}</span>
                </span>
              ) : null
            })()}

            {/* Autoscaler indicator */}
            {selectedStack.autoscaler && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  selectedStack.autoscaler.type === 'WVA' ? 'bg-purple-500/20 text-purple-400' :
                  selectedStack.autoscaler.type === 'HPA' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-green-500/20 text-green-400'
                }`}
                title={`${selectedStack.autoscaler.name}: min=${selectedStack.autoscaler.minReplicas}, max=${selectedStack.autoscaler.maxReplicas}`}
              >
                {selectedStack.autoscaler.type}:{selectedStack.autoscaler.currentReplicas ?? 0}→{selectedStack.autoscaler.desiredReplicas ?? '?'}
              </span>
            )}

            {isDemoMode && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400">Demo</span>
            )}
          </>
        ) : (
          <>
            <Layers className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-400">Select stack</span>
          </>
        )}
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-1 w-[36rem] bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden"
          >
            {/* Header with search */}
            <div className="border-b border-slate-700">
              {/* Title */}
              <div className="px-3 pt-2 pb-1">
                <span className="text-sm font-medium text-white">
                  🎯 Focus on a Stack
                </span>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Select an inference stack to visualize its metrics
                </p>
              </div>

              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs font-medium text-slate-400">
                  {filteredAndSortedStacks.length} stack{filteredAndSortedStacks.length !== 1 ? 's' : ''}{searchQuery ? ` of ${stacks.length}` : ''}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRefetch()
                  }}
                  className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                  title="Refresh stacks"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Error message */}
              {fetchError && (
                <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex-1">{fetchError}</span>
                    <button
                      onClick={handleRefetch}
                      className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 transition-colors whitespace-nowrap"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {/* Search input */}
              <div className="px-3 pb-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search stacks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-8 py-1.5 text-sm bg-slate-900/50 border border-slate-700 rounded focus:outline-none focus:border-slate-600 text-white placeholder-slate-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-700 text-slate-500 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Sort options */}
              <div className="px-3 pb-2 flex items-center gap-1">
                <span className="text-[10px] text-slate-500 mr-1">Sort:</span>
                {(['status', 'name', 'accelerators', 'replicas'] as SortField[]).map(field => (
                  <button
                    key={field}
                    onClick={() => toggleSort(field)}
                    className={`px-2 py-0.5 text-[10px] rounded flex items-center gap-0.5 transition-colors ${
                      sortField === field
                        ? 'bg-slate-600 text-white'
                        : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {field === 'status' ? 'Health' : field === 'accelerators' ? 'GPUs/TPUs' : field.charAt(0).toUpperCase() + field.slice(1)}
                    {sortField === field && (
                      sortDirection === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Stack list - contains scroll to prevent page scroll */}
            <div className="max-h-80 overflow-y-auto overscroll-contain">
              {Object.entries(stacksByCluster).sort(([a], [b]) => a.localeCompare(b)).map(([cluster, clusterStacks]) => (
                <div key={cluster}>
                  {/* Cluster header */}
                  <div className="px-3 py-1.5 bg-slate-900/50 border-b border-slate-700 sticky top-0">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      {cluster}
                    </span>
                  </div>

                  {/* Stacks in cluster */}
                  {clusterStacks.map(stack => (
                    <StackOption
                      key={stack.id}
                      stack={stack}
                      isSelected={stack.id === selectedStackId}
                      onSelect={() => {
                        setSelectedStackId(stack.id)
                        setIsOpen(false)
                      }}
                    />
                  ))}
                </div>
              ))}

              {filteredAndSortedStacks.length === 0 && !isLoading && (
                <div className="px-3 py-4 text-center text-slate-500 text-sm">
                  {searchQuery ? 'No stacks match your search' : 'No llm-d stacks found'}
                </div>
              )}
            </div>

            {/* Footer stats */}
            <div className="px-3 py-2 border-t border-slate-700 bg-slate-900/50 flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-slate-400">
                    {stacks.filter(s => s.status === 'healthy').length} healthy
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  <span className="text-slate-400">
                    {stacks.filter(s => s.hasDisaggregation).length} disaggregated
                  </span>
                </span>
              </div>
              <span className="flex items-center gap-1 text-cyan-400" title="Estimated total accelerators (GPUs/TPUs/AIUs)">
                <Cpu className="w-3 h-3" />
                <span>~{totalAccelerators} accelerators</span>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default StackSelector
