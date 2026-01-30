import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Server, Activity, Filter, Check, AlertTriangle, Plus, Folder, X, Trash2, WifiOff } from 'lucide-react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { useGlobalFilters, SEVERITY_LEVELS, SEVERITY_CONFIG, STATUS_LEVELS, STATUS_CONFIG } from '../../../hooks/useGlobalFilters'
import { cn } from '../../../lib/cn'

export function ClusterFilterPanel() {
  const { t } = useTranslation()
  const {
    selectedClusters,
    toggleCluster,
    selectAllClusters,
    deselectAllClusters,
    isAllClustersSelected,
    availableClusters,
    clusterInfoMap,
    clusterGroups,
    addClusterGroup,
    deleteClusterGroup,
    selectClusterGroup,
    selectedSeverities,
    toggleSeverity,
    selectAllSeverities,
    deselectAllSeverities,
    isAllSeveritiesSelected,
    selectedStatuses,
    toggleStatus,
    selectAllStatuses,
    deselectAllStatuses,
    isAllStatusesSelected,
    customFilter,
    setCustomFilter,
    clearCustomFilter,
    hasCustomFilter,
    isFiltered,
  } = useGlobalFilters()

  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupClusters, setNewGroupClusters] = useState<string[]>([])
  const clusterRef = useRef<HTMLDivElement>(null)

  // Helper to get cluster status tooltip
  const getClusterStatusTooltip = (clusterName: string) => {
    const info = clusterInfoMap[clusterName]
    if (!info) return 'Unknown status'
    if (info.healthy) return `Healthy - ${info.nodeCount || 0} nodes, ${info.podCount || 0} pods`
    if (info.errorMessage) return `Error: ${info.errorMessage}`
    if (info.errorType) {
      const errorMessages: Record<string, string> = {
        timeout: 'Connection timed out - cluster may be offline',
        auth: 'Authentication failed - check credentials',
        network: 'Network error - unable to reach cluster',
        certificate: 'Certificate error - check TLS configuration',
        unknown: 'Unknown error - check cluster status',
      }
      return errorMessages[info.errorType] || 'Cluster unavailable'
    }
    return 'Cluster unavailable'
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clusterRef.current && !clusterRef.current.contains(event.target as Node)) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <>
      {/* Clear Filters Button - shows when filters active */}
      {isFiltered && (
        <button
          onClick={() => {
            selectAllClusters()
            selectAllSeverities()
            selectAllStatuses()
            clearCustomFilter()
          }}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors text-xs font-medium"
          title={t('common:filters.clearAll', 'Clear all filters')}
        >
          <X className="w-3 h-3" />
          <span className="hidden sm:inline">{t('common:filters.clear', 'Clear')}</span>
        </button>
      )}

      {/* Global Filters */}
      <div className="relative" ref={clusterRef}>
        <button
          onClick={() => setShowClusterFilter(!showClusterFilter)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors',
            isFiltered
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
          )}
          title={isFiltered ? 'Filters active - click to modify' : 'No filters - click to filter'}
        >
          <Filter className="w-4 h-4" />
          <span className="text-xs font-medium hidden sm:inline">
            {isFiltered ? t('common:filters.active', 'Filtered') : t('common:filters.all', 'All')}
          </span>
          {isFiltered && (
            <span className="w-2 h-2 bg-purple-400 rounded-full" />
          )}
        </button>

        {/* Filter dropdown */}
        {showClusterFilter && (
          <div className="absolute top-full right-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-xl z-50 max-h-[80vh] overflow-y-auto">
            {/* Custom Text Filter */}
            <div className="p-3 border-b border-border">
              <div className="flex items-center gap-2 mb-2">
                <Search className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-foreground">{t('common:filters.customFilter', 'Custom Filter')}</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customFilter}
                  onChange={(e) => setCustomFilter(e.target.value)}
                  placeholder={t('common:filters.customFilterPlaceholder', 'Filter by name, namespace...')}
                  className="flex-1 px-2 py-1.5 text-sm bg-secondary/50 border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                {hasCustomFilter && (
                  <button
                    onClick={clearCustomFilter}
                    className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Severity Filter Section */}
            <div className="p-3 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-medium text-foreground">{t('common:filters.severity', 'Severity')}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllSeverities}
                    className="text-xs text-purple-400 hover:text-purple-300"
                  >
                    All
                  </button>
                  <button
                    onClick={deselectAllSeverities}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    None
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SEVERITY_LEVELS.map((severity) => {
                  const config = SEVERITY_CONFIG[severity]
                  const isSelected = isAllSeveritiesSelected || selectedSeverities.includes(severity)
                  return (
                    <button
                      key={severity}
                      onClick={() => toggleSeverity(severity)}
                      className={cn(
                        'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors',
                        isSelected
                          ? `${config.bgColor} ${config.color}`
                          : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                      {config.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Status Filter Section */}
            <div className="p-3 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-foreground">{t('common:filters.status', 'Status')}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllStatuses}
                    className="text-xs text-purple-400 hover:text-purple-300"
                  >
                    All
                  </button>
                  <button
                    onClick={deselectAllStatuses}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    None
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_LEVELS.map((status) => {
                  const config = STATUS_CONFIG[status]
                  const isSelected = isAllStatusesSelected || selectedStatuses.includes(status)
                  return (
                    <button
                      key={status}
                      onClick={() => toggleStatus(status)}
                      className={cn(
                        'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors',
                        isSelected
                          ? `${config.bgColor} ${config.color}`
                          : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                      {config.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Cluster Groups Section */}
            {clusterGroups.length > 0 && (
              <div className="p-3 border-b border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Folder className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium text-foreground">{t('common:filters.clusterGroups', 'Cluster Groups')}</span>
                </div>
                <div className="space-y-1">
                  {clusterGroups.map((group) => (
                    <div key={group.id} className="flex items-center gap-2">
                      <button
                        onClick={() => selectClusterGroup(group.id)}
                        className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                      >
                        <Folder className="w-3 h-3" />
                        <span className="truncate">{group.name}</span>
                        <span className="text-xs text-muted-foreground">({group.clusters.length})</span>
                      </button>
                      <button
                        onClick={() => deleteClusterGroup(group.id)}
                        className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cluster Filter Section */}
            <div className="p-3 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-foreground">{t('common:filters.clusters', 'Clusters')}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllClusters}
                    className="text-xs text-purple-400 hover:text-purple-300"
                  >
                    All
                  </button>
                  <button
                    onClick={deselectAllClusters}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    None
                  </button>
                </div>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {availableClusters.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    {t('common:filters.noClusters', 'No clusters available')}
                  </p>
                ) : (
                  availableClusters.map((cluster) => {
                    const isSelected = isAllClustersSelected || selectedClusters.includes(cluster)
                    const info = clusterInfoMap[cluster]
                    // Only show healthy if explicitly true, otherwise check other conditions
                    const isHealthy = info?.healthy === true
                    const statusTooltip = getClusterStatusTooltip(cluster)
                    // Determine if cluster is unreachable vs unhealthy
                    const isUnreachable = info
                      ? (info.reachable === false ||
                         (!info.nodeCount || info.nodeCount === 0) ||
                         (info.errorType && ['timeout', 'network', 'certificate'].includes(info.errorType)))
                      : false
                    // Check if health status is still loading (no info yet)
                    const isLoading = !info || (info.nodeCount === undefined && info.reachable === undefined)
                    return (
                      <button
                        key={cluster}
                        onClick={() => toggleCluster(cluster)}
                        className={cn(
                          'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors',
                          isSelected
                            ? 'bg-purple-500/20 text-foreground'
                            : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                        )}
                        title={statusTooltip}
                      >
                        <div className={cn(
                          'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                          isSelected
                            ? 'bg-purple-500 border-purple-500'
                            : 'border-muted-foreground'
                        )}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        {/* Status indicator - loading spinner, yellow wifi for unreachable, orange alert for unhealthy, green check for healthy */}
                        {isLoading ? (
                          <div className="w-3 h-3 border border-muted-foreground/50 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        ) : isUnreachable ? (
                          <WifiOff className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                        ) : isHealthy ? (
                          <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-3 h-3 text-orange-400 flex-shrink-0" />
                        )}
                        <span className={cn('text-sm truncate', isUnreachable ? 'text-yellow-400' : !isHealthy && !isLoading && 'text-orange-400')}>{cluster}</span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            {/* Create Cluster Group */}
            <div className="p-3">
              {showGroupForm ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Group name..."
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm bg-secondary/50 border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  <div className="text-xs text-muted-foreground mb-1">Select clusters for group:</div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {availableClusters.map((cluster) => {
                      const isInGroup = newGroupClusters.includes(cluster)
                      return (
                        <button
                          key={cluster}
                          onClick={() => {
                            if (isInGroup) {
                              setNewGroupClusters(prev => prev.filter(c => c !== cluster))
                            } else {
                              setNewGroupClusters(prev => [...prev, cluster])
                            }
                          }}
                          className={cn(
                            'w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs transition-colors',
                            isInGroup
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'text-muted-foreground hover:bg-secondary/50'
                          )}
                        >
                          <div className={cn(
                            'w-3 h-3 rounded border flex items-center justify-center flex-shrink-0',
                            isInGroup ? 'bg-blue-500 border-blue-500' : 'border-muted-foreground'
                          )}>
                            {isInGroup && <Check className="w-2 h-2 text-white" />}
                          </div>
                          <span className="truncate">{cluster}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => {
                        if (newGroupName && newGroupClusters.length > 0) {
                          addClusterGroup({ name: newGroupName, clusters: newGroupClusters })
                          setNewGroupName('')
                          setNewGroupClusters([])
                          setShowGroupForm(false)
                        }
                      }}
                      disabled={!newGroupName || newGroupClusters.length === 0}
                      className="flex-1 px-2 py-1 text-xs font-medium bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => {
                        setShowGroupForm(false)
                        setNewGroupName('')
                        setNewGroupClusters([])
                      }}
                      className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowGroupForm(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/50 rounded transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  {t('common:filters.createGroup', 'Create Cluster Group')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
