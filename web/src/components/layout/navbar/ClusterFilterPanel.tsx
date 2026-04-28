import { useState, useRef, useEffect, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Server, Activity, Filter, Check, AlertTriangle, Save, X, Trash2, WifiOff, Globe } from 'lucide-react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { useGlobalFilters, SEVERITY_LEVELS, SEVERITY_CONFIG, STATUS_LEVELS, STATUS_CONFIG } from '../../../hooks/useGlobalFilters'
import { useModalState } from '../../../lib/modals'
import { cn } from '../../../lib/cn'
import { Tooltip } from '../../ui/Tooltip'

/** Color palette for saved filter sets */
const FILTER_SET_COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899']

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
  const { t } = useTranslation()
  return (
    <div className="p-3 border-b border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onSelectAll} className="text-xs text-purple-400 hover:text-purple-300">
            {t('common.all')}
          </button>
          <button onClick={onDeselectAll} className="text-xs text-muted-foreground hover:text-foreground">
            {t('common.none')}
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
    clearAllFilters,
    selectedDistributions,
    toggleDistribution,
    selectAllDistributions,
    deselectAllDistributions,
    isAllDistributionsSelected,
    availableDistributions,
    savedFilterSets,
    saveCurrentFilters,
    applySavedFilterSet,
    deleteSavedFilterSet,
    activeFilterSetId,
  } = useGlobalFilters()

  const { isOpen: showDropdown, close: closeDropdown, toggle: toggleDropdown } = useModalState()
  const { isOpen: showSaveForm, open: openSaveForm, close: closeSaveForm } = useModalState()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(FILTER_SET_COLORS[0])
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Helper to get cluster status tooltip
  const getClusterStatusTooltip = (clusterName: string) => {
    const info = clusterInfoMap[clusterName]
    if (!info) return t('layout.navbar.unknownStatus')
    if (info.healthy) return t('layout.navbar.healthyStatus', { nodeCount: info.nodeCount || 0, podCount: info.podCount || 0 })
    if (info.errorMessage) return `${t('common.error')}: ${info.errorMessage}`
    if (info.errorType) {
      const errorMessages: Record<string, string> = {
        timeout: t('layout.navbar.errorTimeout'),
        auth: t('layout.navbar.errorAuth'),
        network: t('layout.navbar.errorNetwork'),
        certificate: t('layout.navbar.errorCertificate'),
        unknown: t('layout.navbar.errorUnknown'),
      }
      return errorMessages[info.errorType] || t('layout.navbar.clusterUnavailable')
    }
    return t('layout.navbar.clusterUnavailable')
  }

  const handleSave = () => {
    if (!newName.trim()) return
    saveCurrentFilters(newName.trim(), newColor)
    setNewName('')
    setNewColor(FILTER_SET_COLORS[0])
    closeSaveForm()
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        closeDropdown()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [closeDropdown])

  // Get active filter set for the indicator
  const activeSet = activeFilterSetId
    ? savedFilterSets.find(fs => fs.id === activeFilterSetId)
    : null

  return (
    <>
      {/* Filter icon button — isolate creates a stacking context to prevent
           the glow shadow from bleeding into adjacent header controls (#4380) */}
      <div className="relative isolate" ref={dropdownRef}>
        <Tooltip content={t('help.globalClusterFilter')} side="bottom">
          <button
            onClick={() => toggleDropdown()}
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors',
              isFiltered
                ? 'bg-purple-500/20 text-purple-400 shadow-[0_0_6px_rgba(139,92,246,0.2)]'
                : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
            )}
            aria-label={isFiltered ? t('layout.navbar.filtersActive') : t('layout.navbar.noFilters')}
          >
            <Filter className="w-4 h-4" />
            {/* Color dot from active filter set, or generic purple dot */}
            {isFiltered && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-card"
                style={{ backgroundColor: activeSet?.color || '#a78bfa' }}
              />
            )}
          </button>
        </Tooltip>

        {/* Filter dropdown */}
        {showDropdown && (
          <div className="absolute top-full right-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-xl z-dropdown max-h-[80vh] overflow-y-auto">

            {/* Clear All — shown at top when filters are active */}
            {isFiltered && (
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {t('common:filters.filtersActive', 'Filters active')}
                </span>
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                >
                  {t('common:filters.clearAll', 'Clear All')}
                </button>
              </div>
            )}

            {/* Saved Filter Sets */}
            {savedFilterSets.length > 0 && (
              <div className="p-3 border-b border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Save className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-foreground">
                    {t('common:filters.savedFilters', 'Saved Filters')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {savedFilterSets.map(fs => {
                    const isActive = activeFilterSetId === fs.id
                    return (
                      <div key={fs.id} className="flex items-center group/fs">
                        <button
                          onClick={() => applySavedFilterSet(fs.id)}
                          className={cn(
                            'flex items-center gap-1.5 px-2 py-1 rounded-l text-xs font-medium transition-colors',
                            isActive
                              ? 'bg-purple-500/20 text-purple-400'
                              : 'bg-secondary/50 text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: fs.color }}
                          />
                          <span className="max-w-[100px] truncate">{fs.name}</span>
                          {isActive && <Check className="w-3 h-3" />}
                        </button>
                        <button
                          onClick={() => deleteSavedFilterSet(fs.id)}
                          className={cn(
                            'flex items-center justify-center px-1 py-1 rounded-r text-muted-foreground transition-all',
                            isActive
                              ? 'bg-purple-500/20 hover:text-red-400'
                              : 'bg-secondary/50 opacity-0 group-hover/fs:opacity-100 hover:text-red-400',
                          )}
                          title={t('common:filters.deleteFilter', 'Delete filter set')}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

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
                  className="flex-1 px-2 py-1.5 text-sm bg-secondary/50 border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500"
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

            {/* Distribution Filter Section */}
            {availableDistributions.length > 0 && (
              <div className="p-3 border-b border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-medium text-foreground">{t('common:filters.distribution', 'Distribution')}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={selectAllDistributions} className="text-xs text-purple-400 hover:text-purple-300">
                      {t('common.all')}
                    </button>
                    <button onClick={deselectAllDistributions} className="text-xs text-muted-foreground hover:text-foreground">
                      {t('common.none')}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {availableDistributions.map((dist) => {
                    const isSelected = isAllDistributionsSelected || selectedDistributions.includes(dist)
                    return (
                      <button
                        key={dist}
                        onClick={() => toggleDistribution(dist)}
                        className={cn(
                          'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors capitalize',
                          isSelected
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                        {dist}
                      </button>
                    )
                  })}
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
                    {t('common.all')}
                  </button>
                  <button
                    onClick={deselectAllClusters}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t('common.none')}
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
                          'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                          isSelected
                            ? 'bg-purple-500 border-purple-500'
                            : 'border-muted-foreground'
                        )}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        {isLoading ? (
                          <div className="w-3 h-3 border border-muted-foreground/50 border-t-transparent rounded-full animate-spin shrink-0" />
                        ) : isUnreachable ? (
                          <WifiOff className="w-3 h-3 text-yellow-400 shrink-0" />
                        ) : isHealthy ? (
                          <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                        ) : (
                          <AlertCircle className="w-3 h-3 text-orange-400 shrink-0" />
                        )}
                        <span className={cn('text-sm truncate', isUnreachable ? 'text-yellow-400' : !isHealthy && !isLoading && 'text-orange-400')}>{cluster}</span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            {/* Save Current Filters */}
            <div className="p-3">
              {showSaveForm ? (
                <div className="space-y-2 p-2 bg-secondary/20 rounded">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={t('common:filters.filterSetName', 'Filter set name...')}
                    className="w-full px-2 py-1.5 text-sm bg-secondary/50 border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {t('common:filters.color', 'Color:')}
                    </span>
                    {FILTER_SET_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setNewColor(c)}
                        className={cn(
                          'w-5 h-5 rounded-full border-2 transition-all',
                          newColor === c ? 'border-foreground scale-110' : 'border-transparent',
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleSave}
                      disabled={!newName.trim()}
                      className="flex-1 px-2 py-1 text-xs font-medium bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {t('common:filters.save', 'Save')}
                    </button>
                    <button
                      onClick={() => { closeSaveForm(); setNewName('') }}
                      className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {t('common:filters.cancel', 'Cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => openSaveForm()}
                  disabled={!isFiltered}
                  className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/50 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Save className="w-3 h-3" />
                  {t('common:filters.saveCurrentFilters', 'Save Current Filters')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
