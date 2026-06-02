import { memo, useEffect, type KeyboardEvent, type RefObject } from 'react'

// Split helper component; parent card owns useCardLoadingState.
import { AlertCircle, AlertTriangle, BellOff, Clock, List, MoreVertical, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CardControlsRow, CardSearchInput } from '../../lib/cards/CardComponents'
import { SNOOZE_DURATIONS, type SnoozeDuration } from '../../hooks/useSnoozedAlerts'
import { useKeyboardNav } from '../../hooks/useKeyboardNav'
import { cn } from '../../lib/cn'
import { StatusBadge } from '../ui/StatusBadge'
import { CARD_UI_STRINGS } from './strings'
import type { SortField, ViewMode } from './HardwareHealthCard.types'

interface HardwareHealthCardHeaderProps {
  criticalCount: number
  warningCount: number
  deduplicatedNodeCount: number
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  tabListProps: {
    role: 'tablist'
    'aria-orientation': 'horizontal'
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  }
  getTabProps: (tab: ViewMode) => {
    id: string
    role: 'tab'
    tabIndex: number
    'data-tab-id': ViewMode
    'aria-selected': boolean
    'aria-controls': string
    onClick: () => void
  }
  deduplicatedInventoryCount: number
  activeAlertCount: number
  snoozedAlertCount: number
  showSnoozed: boolean
  onToggleShowSnoozed: () => void
  visibleAlertIds: string[]
  snoozeAllMenuOpen: boolean
  onToggleSnoozeAllMenu: () => void
  onSnoozeAll: (duration: SnoozeDuration) => void
  onClearAllSnoozed: () => void
  snoozeAllMenuRef: RefObject<HTMLDivElement | null>
  availableClustersForFilter: string[]
  localClusterFilter: string[]
  toggleClusterFilter: (cluster: string) => void
  clearClusterFilter: () => void
  showClusterFilter: boolean
  setShowClusterFilter: (open: boolean) => void
  clusterFilterRef: RefObject<HTMLDivElement | null>
  itemsPerPage: number | 'unlimited'
  setItemsPerPage: (value: number | 'unlimited') => void
  sortField: SortField
  currentSortOptions: Array<{ value: SortField; label: string }>
  setSortField: (field: SortField) => void
  sortDirection: 'asc' | 'desc'
  setSortDirection: (direction: 'asc' | 'desc') => void
  search: string
  setSearch: (value: string) => void
  fetchError?: string | null
  retryError?: string | null
  handleRetry: () => void
  isRetrying: boolean
  isRefreshing: boolean
  isDemoData: boolean
}

export const HardwareHealthCardHeader = memo(function HardwareHealthCardHeader({
  criticalCount,
  warningCount,
  deduplicatedNodeCount,
  viewMode,
  onViewModeChange,
  tabListProps,
  getTabProps,
  deduplicatedInventoryCount,
  activeAlertCount,
  snoozedAlertCount,
  showSnoozed,
  onToggleShowSnoozed,
  visibleAlertIds,
  snoozeAllMenuOpen,
  onToggleSnoozeAllMenu,
  onSnoozeAll,
  onClearAllSnoozed,
  snoozeAllMenuRef,
  availableClustersForFilter,
  localClusterFilter,
  toggleClusterFilter,
  clearClusterFilter,
  showClusterFilter,
  setShowClusterFilter,
  clusterFilterRef,
  itemsPerPage,
  setItemsPerPage,
  sortField,
  currentSortOptions,
  setSortField,
  sortDirection,
  setSortDirection,
  search,
  setSearch,
  fetchError,
  retryError,
  handleRetry,
  isRetrying,
  isRefreshing,
  isDemoData,
}: HardwareHealthCardHeaderProps) {
  const { t } = useTranslation(['cards', 'common'])
  const snoozeMenuNav = useKeyboardNav({ selector: '[role="menuitem"]:not([disabled])', orientation: 'vertical', onEscape: onToggleSnoozeAllMenu })

  useEffect(() => {
    if (!snoozeAllMenuOpen) return
    snoozeMenuNav.focusMatchingItem({ fallbackSelector: '[role="menuitem"]:not([disabled])' })
  }, [snoozeAllMenuOpen, snoozeMenuNav])

  return (
    <>
      {(fetchError || retryError) && (
        <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{retryError || fetchError}</span>
            </div>
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-500/20 hover:bg-red-500/30 transition-colors whitespace-nowrap disabled:opacity-50"
              aria-label={t('cards:hardwareHealth.retryFetchAria')}
            >
              <RefreshCw className={cn('w-3 h-3', (isRefreshing || isRetrying) && 'animate-spin')} />
              {isRetrying ? t('common:common.loading', 'Loading…') : t('common:common.retry', 'Retry')}
            </button>
          </div>
        </div>
      )}

      <div className="mb-3 flex items-center justify-end">
        {isDemoData && <StatusBadge color="yellow" size="xs">{t('common:common.demo')}</StatusBadge>}
      </div>

      <div className="grid grid-cols-2 @md:grid-cols-3 gap-1.5 @md:gap-2 mb-4">
        <div className={cn('p-2 rounded-lg border', criticalCount > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-green-500/10 border-green-500/20')}>
          <div className="text-xl font-bold text-foreground">{criticalCount}</div>
          <div className={cn('text-2xs', criticalCount > 0 ? 'text-red-400' : 'text-green-400')}>{t('common:common.critical', 'Critical')}</div>
        </div>
        <div className={cn('p-2 rounded-lg border', warningCount > 0 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-green-500/10 border-green-500/20')}>
          <div className="text-xl font-bold text-foreground">{warningCount}</div>
          <div className={cn('text-2xs', warningCount > 0 ? 'text-yellow-400' : 'text-green-400')}>{t('common:common.warning', 'Warning')}</div>
        </div>
        <button
          onClick={() => onViewModeChange('inventory')}
          className="p-2 rounded-lg border bg-muted/20 border-muted/30 hover:bg-muted/40 transition-colors cursor-pointer text-left"
          aria-label={t('cards:hardwareHealth.viewNodesInventoryAria')}
        >
          <div className="text-xl font-bold text-foreground">{deduplicatedNodeCount}</div>
          <div className="text-2xs text-muted-foreground">{t('cards:hardwareHealth.nodesTracked', 'Nodes Tracked')}</div>
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <div {...tabListProps} className="flex flex-1 min-w-0 bg-muted/30 rounded-lg p-0.5">
          <button
            {...getTabProps('inventory')}
            className={cn('flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors', viewMode === 'inventory' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
            aria-label={t('cards:hardwareHealth.switchToInventoryAria')}
          >
            <List className="w-3.5 h-3.5" />
            {t('cards:hardwareHealth.inventory', 'Inventory')}
            {deduplicatedInventoryCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-2xs font-semibold rounded-full bg-muted text-muted-foreground">{deduplicatedInventoryCount}</span>
            )}
          </button>
          <button
            {...getTabProps('alerts')}
            className={cn('flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors', viewMode === 'alerts' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
            aria-label={t('cards:hardwareHealth.switchToAlertsAria')}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            {t('cards:hardwareHealth.alerts', 'Alerts')}
            {activeAlertCount > 0 && (
              <span className={cn('ml-1 px-1.5 py-0.5 text-2xs font-semibold rounded-full', criticalCount > 0 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400')}>{activeAlertCount}</span>
            )}
          </button>
        </div>

        {viewMode === 'alerts' && (
          <div className="flex items-center gap-1">
            {snoozedAlertCount > 0 && (
              <button
                onClick={onToggleShowSnoozed}
                className={cn('flex items-center gap-1 px-2 py-1.5 text-xs rounded-md transition-colors', showSnoozed ? 'bg-yellow-500/20 text-yellow-400' : 'bg-muted/30 text-muted-foreground hover:text-foreground')}
                title={showSnoozed ? t('cards:hardwareHealth.hideSnoozedAlerts') : t('cards:hardwareHealth.showSnoozedAlerts')}
                aria-label={showSnoozed ? t('cards:hardwareHealth.hideSnoozedAlerts') : t('cards:hardwareHealth.showSnoozedAlerts')}
                aria-pressed={showSnoozed}
              >
                <BellOff className="w-3.5 h-3.5" />
                <span className="font-medium">{snoozedAlertCount}</span>
              </button>
            )}

            {visibleAlertIds.length > 0 && (
              <div className="relative" ref={snoozeAllMenuRef}>
                <button
                  onClick={onToggleSnoozeAllMenu}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
                  title={t('cards:hardwareHealth.snoozeAllVisible')}
                  aria-label={t('cards:hardwareHealth.snoozeAllVisible')}
                  aria-haspopup="menu"
                  aria-expanded={snoozeAllMenuOpen}
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {snoozeAllMenuOpen && (
                  <div
                    ref={(node) => {
                      snoozeMenuNav.containerRef.current = node
                    }}
                    role="menu"
                    className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
                    onKeyDown={snoozeMenuNav.handleKeyDown}
                  >
                    <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border mb-1">{t('cards:hardwareHealth.snoozeAllVisibleCount', 'Snooze All ({{count}})', { count: visibleAlertIds.length })}</div>
                    {(Object.keys(SNOOZE_DURATIONS) as SnoozeDuration[]).map(duration => (
                      <button
                        key={duration}
                        role="menuitem"
                        onClick={() => onSnoozeAll(duration)}
                        className="w-full px-3 py-1.5 text-xs text-left hover:bg-muted/50 transition-colors flex items-center gap-2"
                        aria-label={t('cards:hardwareHealth.snoozeAllForAria', { duration })}
                      >
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        {duration}
                      </button>
                    ))}
                    {snoozedAlertCount > 0 && (
                      <>
                        <div className="border-t border-border my-1" />
                        <button
                          role="menuitem"
                          onClick={onClearAllSnoozed}
                          className="w-full px-3 py-1.5 text-xs text-left text-yellow-400 hover:bg-muted/50 transition-colors"
                          aria-label={t('cards:hardwareHealth.clearAllSnoozesAria')}
                        >
                          {t('cards:hardwareHealth.clearAllSnoozes', 'Clear all snoozes')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <CardControlsRow
        clusterFilter={{
          availableClusters: availableClustersForFilter.map(c => ({ name: c })),
          selectedClusters: localClusterFilter,
          onToggle: toggleClusterFilter,
          onClear: clearClusterFilter,
          isOpen: showClusterFilter,
          setIsOpen: setShowClusterFilter,
          containerRef: clusterFilterRef,
          minClusters: 1,
        }}
        clusterIndicator={localClusterFilter.length > 0 ? { selectedCount: localClusterFilter.length, totalCount: availableClustersForFilter.length } : undefined}
        cardControls={{
          limit: itemsPerPage,
          onLimitChange: setItemsPerPage,
          sortBy: sortField,
          sortOptions: currentSortOptions,
          onSortChange: s => setSortField(s as SortField),
          sortDirection,
          onSortDirectionChange: setSortDirection,
        }}
      />

      <CardSearchInput value={search} onChange={setSearch} placeholder={CARD_UI_STRINGS.hardwareHealth.searchDevicesPlaceholder} className="mb-3 flex-none" />
    </>
  )
})
