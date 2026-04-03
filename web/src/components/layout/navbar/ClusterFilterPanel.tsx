import { useState, useRef, useEffect, useMemo, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Server, Activity, Filter, Check, AlertTriangle, Plus, FolderKanban, X, Trash2, WifiOff } from 'lucide-react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { useGlobalFilters, SEVERITY_LEVELS, SEVERITY_CONFIG, STATUS_LEVELS, STATUS_CONFIG } from '../../../hooks/useGlobalFilters'
import { Button } from '../../ui/Button'
import { cn } from '../../../lib/cn'

/** Color palette for project/cluster groups */
const GROUP_COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899']

interface FilterSectionConfig {
  label: string
  color: string
  bgColor: string
}

function FilterSection<T extends string>({
  icon,
  title,
  levels,
  configMap,
  selectedItems,
  isAllSelected,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: {
  icon: ReactNode
  title: string
  levels: T[]
  configMap: Record<T, FilterSectionConfig>
  selectedItems: T[]
  isAllSelected: boolean
  onToggle: (item: T) => void
  onSelectAll: () => void
  onDeselectAll: () => void
}) {
  return (
    <div className="p-3 border-b border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onSelectAll} className="text-xs text-purple-400 hover:text-purple-300">
            All
          </button>
          <button onClick={onDeselectAll} className="text-xs text-muted-foreground hover:text-foreground">
            None
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {levels.map((item) => {
          const config = configMap[item]
          const isSelected = isAllSelected || selectedItems.includes(item)
          return (
            <button
              key={item}
              onClick={() => onToggle(item)}
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
  )
}

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
  const [newGroupColor, setNewGroupColor] = useState(GROUP_COLORS[0])
  const [newGroupClusters, setNewGroupClusters] = useState<string[]>([])
  const clusterRef = useRef<HTMLDivElement>(null)

  // Detect which group (if any) matches the current cluster selection
  const activeGroup = useMemo(() => {
    if (isAllClustersSelected || selectedClusters.length === 0) return null
    const selected = new Set(selectedClusters)
    return clusterGroups.find(g => {
      if (g.clusters.length !== selected.size) return false
      return g.clusters.every(c => selected.has(c))
    }) || null
  }, [clusterGroups, selectedClusters, isAllClustersSelected])

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

  const handleCreateGroup = () => {
    if (!newGroupName.trim() || newGroupClusters.length === 0) return
    addClusterGroup({ name: newGroupName.trim(), clusters: newGroupClusters, color: newGroupColor })
    setNewGroupName('')
    setNewGroupClusters([])
    setNewGroupColor(GROUP_COLORS[0])
    setShowGroupForm(false)
  }

  const handleCancelCreate = () => {
    setShowGroupForm(false)
    setNewGroupName('')
    setNewGroupClusters([])
    setNewGroupColor(GROUP_COLORS[0])
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

  // Build trigger label
  const triggerLabel = activeGroup
    ? activeGroup.name
    : isFiltered
      ? t('common:filters.active', 'Filtered')
      : t('common:filters.all', 'All')

  return (
    <>
      {/* Clear Filters Button - shows when filters active */}
      {isFiltered && (
        <Button
          variant="accent"
          size="sm"
          onClick={() => {
            selectAllClusters()
            selectAllSeverities()
            selectAllStatuses()
            clearCustomFilter()
          }}
          icon={<X className="w-3 h-3" />}
          title={t('common:filters.clearAll', 'Clear all filters')}
        >
          <span className="hidden sm:inline">{t('common:filters.clear', 'Clear')}</span>
        </Button>
      )}

      {/* Unified Filter Button */}
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
          {activeGroup?.color && (
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: activeGroup.color }}
            />
          )}
          <Filter className="w-4 h-4" />
          <span className="text-xs font-medium hidden sm:inline max-w-[120px] truncate">
            {triggerLabel}
          </span>
          {isFiltered && !activeGroup && (
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

            {/* Projects / Cluster Groups Section */}
            <div className="p-3 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FolderKanban className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-foreground">
                    {t('common:filters.projects', 'Projects')}
                  </span>
                </div>
                {activeGroup && (
                  <button
                    onClick={selectAllClusters}
                    className="text-xs text-purple-400 hover:text-purple-300"
                  >
                    {t('common:filters.showAll', 'Show All')}
                  </button>
                )}
              </div>

              {clusterGroups.length === 0 && !showGroupForm ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  {t('common:filters.noProjects', 'No projects defined yet')}
                </p>
              ) : (
                <div className="space-y-1">
                  {clusterGroups.map((group) => {
                    const isActive = activeGroup?.id === group.id
                    return (
                      <div key={group.id} className="flex items-center gap-2 group/item">
                        <button
                          onClick={() => selectClusterGroup(group.id)}
                          className={cn(
                            'flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors',
                            isActive
                              ? 'bg-purple-500/20 text-purple-400'
                              : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                          )}
                        >
                          {group.color ? (
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: group.color }}
                            />
                          ) : (
                            <FolderKanban className="w-3 h-3 flex-shrink-0" />
                          )}
                          <span className="truncate">{group.name}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            ({group.clusters.length})
                          </span>
                          {isActive && <Check className="w-3 h-3 text-purple-400 flex-shrink-0 ml-auto" />}
                        </button>
                        <button
                          onClick={() => deleteClusterGroup(group.id)}
                          className="p-1 text-muted-foreground hover:text-red-400 opacity-0 group-hover/item:opacity-100 transition-all flex-shrink-0"
                          title={t('common:filters.deleteGroup', 'Delete group')}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Create Group Form */}
              <div className="mt-2">
                {showGroupForm ? (
                  <div className="space-y-2 p-2 bg-secondary/20 rounded">
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder={t('common:filters.groupNamePlaceholder', 'Project name...')}
                      className="w-full px-2 py-1.5 text-sm bg-secondary/50 border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
                      autoFocus
                    />

                    {/* Color picker */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {t('common:filters.color', 'Color:')}
                      </span>
                      {GROUP_COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => setNewGroupColor(c)}
                          className={cn(
                            'w-5 h-5 rounded-full border-2 transition-all',
                            newGroupColor === c ? 'border-foreground scale-110' : 'border-transparent',
                          )}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>

                    {/* Cluster multi-select */}
                    <div className="text-xs text-muted-foreground">
                      {t('common:filters.selectClusters', 'Select clusters:')}
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {(availableClusters || []).map(cluster => {
                        const checked = newGroupClusters.includes(cluster)
                        return (
                          <button
                            key={cluster}
                            onClick={() => {
                              if (checked) {
                                setNewGroupClusters(prev => prev.filter(c => c !== cluster))
                              } else {
                                setNewGroupClusters(prev => [...prev, cluster])
                              }
                            }}
                            className={cn(
                              'w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs transition-colors',
                              checked
                                ? 'bg-purple-500/20 text-purple-400'
                                : 'text-muted-foreground hover:bg-secondary/50',
                            )}
                          >
                            <div
                              className={cn(
                                'w-3 h-3 rounded border flex items-center justify-center flex-shrink-0',
                                checked
                                  ? 'bg-purple-500 border-purple-500'
                                  : 'border-muted-foreground',
                              )}
                            >
                              {checked && <Check className="w-2 h-2 text-white" />}
                            </div>
                            <span className="truncate">{cluster}</span>
                          </button>
                        )
                      })}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleCreateGroup}
                        disabled={!newGroupName.trim() || newGroupClusters.length === 0}
                        className="flex-1 px-2 py-1 text-xs font-medium bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {t('common:filters.create', 'Create')}
                      </button>
                      <button
                        onClick={handleCancelCreate}
                        className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {t('common:filters.cancel', 'Cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowGroupForm(true)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/50 rounded transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    {t('common:filters.createProject', 'Create Project')}
                  </button>
                )}
              </div>
            </div>

            {/* Severity Filter Section */}
            <FilterSection
              icon={<AlertTriangle className="w-4 h-4 text-orange-400" />}
              title={t('common:filters.severity', 'Severity')}
              levels={SEVERITY_LEVELS}
              configMap={SEVERITY_CONFIG}
              selectedItems={selectedSeverities}
              isAllSelected={isAllSeveritiesSelected}
              onToggle={toggleSeverity}
              onSelectAll={selectAllSeverities}
              onDeselectAll={deselectAllSeverities}
            />

            {/* Status Filter Section */}
            <FilterSection
              icon={<Activity className="w-4 h-4 text-green-400" />}
              title={t('common:filters.status', 'Status')}
              levels={STATUS_LEVELS}
              configMap={STATUS_CONFIG}
              selectedItems={selectedStatuses}
              isAllSelected={isAllStatusesSelected}
              onToggle={toggleStatus}
              onSelectAll={selectAllStatuses}
              onDeselectAll={deselectAllStatuses}
            />

            {/* Cluster Filter Section */}
            <div className="p-3">
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
                    const isHealthy = info?.healthy === true
                    const statusTooltip = getClusterStatusTooltip(cluster)
                    const isUnreachable = info
                      ? (info.reachable === false ||
                         (!info.nodeCount || info.nodeCount === 0) ||
                         (info.errorType && ['timeout', 'network', 'certificate'].includes(info.errorType)))
                      : false
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
          </div>
        )}
      </div>
    </>
  )
}
