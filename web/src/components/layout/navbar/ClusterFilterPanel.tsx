import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, Filter, AlertTriangle } from 'lucide-react'
import { useGlobalFilters, SEVERITY_LEVELS, SEVERITY_CONFIG, STATUS_LEVELS, STATUS_CONFIG } from '../../../hooks/useGlobalFilters'
import { useModalState } from '../../../lib/modals'
import { cn } from '../../../lib/cn'
import { NAVBAR_FILTER_PANEL_GAP_PX, NAVBAR_FILTER_PANEL_OFFSET_CSS_VAR } from '../../../lib/constants/ui'
import { Tooltip } from '../../ui/Tooltip'
import { FilterSection } from './FilterSection'
import { ClusterCheckboxList } from './ClusterCheckboxList'
import { DistributionFilterSection } from './DistributionFilterSection'
import { NamespaceFilterRow } from './NamespaceFilterRow'
import { SaveFilterSection } from './SaveFilterSection'
import { SavedFilterChips } from './SavedFilterChips'

const FILTER_SET_COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899']
const FILTER_PANEL_ID = 'navbar-cluster-filter-panel'
const CUSTOM_FILTER_INPUT_ID = 'navbar-cluster-filter-input'
const SAVE_FILTER_NAME_INPUT_ID = 'navbar-save-filter-name'

interface ClusterFilterPanelProps {
  /** Force label text to be visible (used in overflow menu) */
  showLabel?: boolean
}

export function ClusterFilterPanel({ showLabel = false }: ClusterFilterPanelProps) {
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
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

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

  const closePanelAndRestoreFocus = useCallback(() => {
    closeDropdown()
    triggerRef.current?.focus()
  }, [closeDropdown])

  useEffect(() => {
    if (!showDropdown) return

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        closePanelAndRestoreFocus()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePanelAndRestoreFocus()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showDropdown, closePanelAndRestoreFocus])

  const activeSet = activeFilterSetId
    ? savedFilterSets.find(fs => fs.id === activeFilterSetId)
    : null

  useLayoutEffect(() => {
    const rootStyle = document.documentElement.style

    if (!showDropdown || showLabel) {
      rootStyle.removeProperty(NAVBAR_FILTER_PANEL_OFFSET_CSS_VAR)
      return undefined
    }

    const updatePanelOffset = () => {
      const panelHeight = panelRef.current?.offsetHeight ?? 0
      rootStyle.setProperty(
        NAVBAR_FILTER_PANEL_OFFSET_CSS_VAR,
        `${panelHeight + NAVBAR_FILTER_PANEL_GAP_PX}px`
      )
    }

    updatePanelOffset()
    window.addEventListener('resize', updatePanelOffset)

    let resizeObserver: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined' && panelRef.current) {
      resizeObserver = new ResizeObserver(() => updatePanelOffset())
      resizeObserver.observe(panelRef.current)
    }

    return () => {
      window.removeEventListener('resize', updatePanelOffset)
      resizeObserver?.disconnect()
      rootStyle.removeProperty(NAVBAR_FILTER_PANEL_OFFSET_CSS_VAR)
    }
  }, [showDropdown, showLabel])

  return (
    <>
      <div className="relative isolate" ref={dropdownRef}>
        <Tooltip content={t('help.globalClusterFilter')} side="bottom">
          <button
            ref={triggerRef}
            data-testid="navbar-cluster-filter-btn"
            onClick={() => toggleDropdown()}
            className={cn(
              'relative flex items-center rounded-lg transition-colors',
              showLabel ? 'gap-2 px-3 py-1.5 h-9' : 'justify-center w-9 h-9',
              isFiltered
                ? 'bg-purple-500/20 text-purple-400 shadow-purple-glow-sm'
                : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
            )}
            aria-label={isFiltered ? t('layout.navbar.filtersActive') : t('layout.navbar.noFilters')}
            aria-expanded={showDropdown}
            aria-haspopup="dialog"
            aria-controls={showDropdown ? FILTER_PANEL_ID : undefined}
          >
            <Filter className="w-4 h-4 shrink-0" />
            {showLabel && (
              <span className="text-sm font-medium">{t('navbar.clusterFilter')}</span>
            )}
            {isFiltered && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-card"
                style={{ backgroundColor: activeSet?.color || '#a78bfa' }}
              />
            )}
          </button>
        </Tooltip>

        {showDropdown && (
          <div
            id={FILTER_PANEL_ID}
            ref={panelRef}
            data-testid="navbar-cluster-filter-dropdown"
            className="absolute top-full right-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-xl z-toast max-h-64 overflow-y-auto"
            role="dialog"
            aria-label={t('navbar.clusterFilter')}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                closePanelAndRestoreFocus()
              }
            }}
          >
            {isFiltered && (
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {t('common:filters.filtersActive', 'Filters active')}
                </span>
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                  aria-label={t('common:filters.clearAll', 'Clear All')}
                >
                  {t('common:filters.clearAll', 'Clear All')}
                </button>
              </div>
            )}

            <SavedFilterChips savedFilterSets={savedFilterSets} activeFilterSetId={activeFilterSetId} applySavedFilterSet={applySavedFilterSet} deleteSavedFilterSet={deleteSavedFilterSet} />
            <NamespaceFilterRow inputId={CUSTOM_FILTER_INPUT_ID} customFilter={customFilter} setCustomFilter={setCustomFilter} hasCustomFilter={hasCustomFilter} clearCustomFilter={clearCustomFilter} />

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

            <DistributionFilterSection availableDistributions={availableDistributions} selectedDistributions={selectedDistributions} isAllDistributionsSelected={isAllDistributionsSelected} selectAllDistributions={selectAllDistributions} deselectAllDistributions={deselectAllDistributions} toggleDistribution={toggleDistribution} />

            <ClusterCheckboxList availableClusters={availableClusters} selectedClusters={selectedClusters} isAllClustersSelected={isAllClustersSelected} clusterInfoMap={clusterInfoMap} selectAllClusters={selectAllClusters} deselectAllClusters={deselectAllClusters} toggleCluster={toggleCluster} getClusterStatusTooltip={getClusterStatusTooltip} />

            <SaveFilterSection showSaveForm={showSaveForm} saveNameInputId={SAVE_FILTER_NAME_INPUT_ID} newName={newName} setNewName={setNewName} newColor={newColor} setNewColor={setNewColor} handleSave={handleSave} closeSaveForm={closeSaveForm} openSaveForm={openSaveForm} isFiltered={isFiltered} colors={FILTER_SET_COLORS} />
          </div>
        )}
      </div>
    </>
  )
}
