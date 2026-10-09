import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings, Check, Plus, Search } from 'lucide-react'
import { Button } from './Button'
import { BaseModal } from '../../lib/modals'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
  StatBlockConfig,
  DashboardStatsType,
  ALL_STAT_BLOCKS,
  getDefaultStatBlocks,
  getDefaultDisplayMode,
  getStatsStorageKey } from './StatsBlockDefinitions'
import { safeGetJSON, safeSetJSON, safeRemoveItem } from '../../lib/utils/localStorage'
import { DASHBOARD_CATEGORIES, getStatBlocksForDashboard } from './StatsConfig.constants'
import { SortableItem, DashboardCategory } from './StatsConfig.parts'

// Re-export for backward compatibility
export type { StatBlockConfig, DashboardStatsType }
export { ALL_STAT_BLOCKS, getDefaultStatBlocks, getStatsStorageKey }

interface PanelState {
  showAddPanel: boolean
  searchQuery: string
  expandedCategories: Set<string>
}

interface StatsConfigModalProps {
  isOpen: boolean
  onClose: () => void
  blocks: StatBlockConfig[]
  onSave: (blocks: StatBlockConfig[]) => void
  defaultBlocks: StatBlockConfig[]
  title?: string
}

export function StatsConfigModal({
  isOpen,
  onClose,
  blocks,
  onSave,
  defaultBlocks,
  title, }: StatsConfigModalProps) {
  const { t } = useTranslation()
  const resolvedTitle = title || t('statsOverview.configureStats', 'Configure stats')
  const [localBlocks, setLocalBlocks] = useState<StatBlockConfig[]>(blocks)
  const [panelState, setPanelState] = useState<PanelState>({ showAddPanel: false, searchQuery: '', expandedCategories: new Set<string>() })
  const { showAddPanel, searchQuery, expandedCategories } = panelState

  useEffect(() => {
    if (isOpen) {
      // Batch all panel resets into a single state update to avoid flicker
      setLocalBlocks(blocks)
      setPanelState({ showAddPanel: false, searchQuery: '', expandedCategories: new Set() })
    }
  }, [isOpen, blocks])

  const toggleCategory = (type: string) => {
    setPanelState(prev => {
      const next = new Set(prev.expandedCategories)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return { ...prev, expandedCategories: next }
    })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Get IDs of blocks in the current dashboard defaults
  const defaultBlockIds = new Set(defaultBlocks.map(b => b.id))

  // Get current block IDs to filter out already-added stats
  const currentBlockIds = new Set(localBlocks.map(b => b.id))

  // Get available stats per dashboard category, filtered by search
  const availableStatsByCategory = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    const result: Map<DashboardStatsType, StatBlockConfig[]> = new Map()

    for (const category of DASHBOARD_CATEGORIES) {
      const blocks = getStatBlocksForDashboard(category.type)
        .filter(block => !currentBlockIds.has(block.id))
        .filter(block =>
          !query ||
          block.name.toLowerCase().includes(query) ||
          block.id.toLowerCase().includes(query) ||
          category.name.toLowerCase().includes(query)
        )
      if (blocks.length > 0) {
        result.set(category.type, blocks)
      }
    }
    return result
  }, [currentBlockIds, searchQuery])

  // Check if any stats are available
  const hasAvailableStats = availableStatsByCategory.size > 0

  // Auto-expand categories when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      // Expand all categories that have matching results
      setPanelState(prev => ({ ...prev, expandedCategories: new Set(availableStatsByCategory.keys()) }))
    }
  }, [searchQuery, availableStatsByCategory])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setLocalBlocks(prev => {
        const oldIndex = prev.findIndex(b => b.id === active.id)
        const newIndex = prev.findIndex(b => b.id === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  const toggleVisibility = (id: string) => {
    setLocalBlocks(prev =>
      prev.map(b => b.id === id ? { ...b, visible: !b.visible } : b)
    )
  }

  const handleAddStat = (block: StatBlockConfig) => {
    setLocalBlocks(prev => [...prev, { ...block, visible: true }])
  }

  const handleRemoveStat = (id: string) => {
    setLocalBlocks(prev => prev.filter(b => b.id !== id))
  }

  const handleSave = () => {
    onSave(localBlocks)
    onClose()
  }

  const handleReset = () => {
    setLocalBlocks(defaultBlocks)
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg" closeOnBackdrop={false}>
      <BaseModal.Header
        title={resolvedTitle}
        description={t('statsOverview.dragToReorderDesc', 'Drag to reorder. Click the eye icon to show/hide stats.')}
        icon={Settings}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[65vh]">
        {/* Current Stats */}
        <div className="space-y-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={localBlocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
              {localBlocks.map(block => (
                <SortableItem
                  key={block.id}
                  block={block}
                  onToggleVisibility={toggleVisibility}
                  onRemove={handleRemoveStat}
                  isCustom={!defaultBlockIds.has(block.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* Add Stats Panel */}
        {showAddPanel ? (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setPanelState(prev => ({ ...prev, searchQuery: e.target.value }))}
                  placeholder={t('statsOverview.searchPlaceholder', 'Search all available stats...')}
                  className="w-full pl-9 pr-3 py-2 bg-secondary/30 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/50"
                  autoFocus
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPanelState(prev => ({ ...prev, showAddPanel: false }))}
              >
                {t('common.done', 'Done')}
              </Button>
            </div>
            <div className="space-y-0 min-h-48 max-h-80 overflow-y-auto border border-border/50 rounded-lg">
              {hasAvailableStats ? (
                DASHBOARD_CATEGORIES.map(category => {
                  const categoryBlocks = availableStatsByCategory.get(category.type)
                  if (!categoryBlocks || categoryBlocks.length === 0) return null
                  return (
                    <DashboardCategory
                      key={category.type}
                      category={category}
                      availableBlocks={categoryBlocks}
                      onAdd={handleAddStat}
                      isExpanded={expandedCategories.has(category.type)}
                      onToggle={() => toggleCategory(category.type)}
                    />
                  )
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {searchQuery ? t('statsOverview.noSearchResults', 'No stats match your search') : t('statsOverview.allStatsAdded', 'All stats are already added')}
                </p>
              )}
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="md"
            onClick={() => setPanelState(prev => ({ ...prev, showAddPanel: true }))}
            className="mt-4 w-full border border-dashed border-border hover:border-purple-500/50"
            icon={<Plus className="w-4 h-4" />}
            fullWidth
          >
            {t('statsOverview.addStatFromDashboards', 'Add stat from other dashboards')}
          </Button>
        )}
      </BaseModal.Content>

      <BaseModal.Footer>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
        >
          {t('statsOverview.resetToDefault', 'Reset to Default')}
        </Button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="md"
            onClick={onClose}
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            variant="accent"
            size="md"
            onClick={handleSave}
            icon={<Check className="w-4 h-4" />}
          >
            {t('common.save', 'Save')}
          </Button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}

/**
 * Hook to manage stats configuration for any dashboard
 */
export function useStatsConfig(
  dashboardType: DashboardStatsType,
  storageKey?: string
) {
  const defaultBlocks = getDefaultStatBlocks(dashboardType)
  const key = storageKey || getStatsStorageKey(dashboardType)

  // Apply default display modes from STAT_DISPLAY_MODE_DEFAULTS to blocks
  // that don't have an explicit displayMode set
  const applyDefaultModes = (blockList: StatBlockConfig[]): StatBlockConfig[] =>
    blockList.map(b => ({
      ...b,
      displayMode: b.displayMode ?? getDefaultDisplayMode(dashboardType, b.id) }))

  const [blocks, setBlocks] = useState<StatBlockConfig[]>(() => {
    const saved = safeGetJSON<StatBlockConfig[]>(key)
    if (saved) {
      // Remove stale saved blocks whose IDs no longer exist in any definition
      const validIds = new Set(ALL_STAT_BLOCKS.map(b => b.id))
      const cleaned = saved.filter(b => validIds.has(b.id))
      // Merge with defaults to handle new blocks added in updates
      const savedIds = new Set(cleaned.map(b => b.id))
      const merged = [...cleaned]
      defaultBlocks.forEach(defaultBlock => {
        if (!savedIds.has(defaultBlock.id)) {
          merged.push(defaultBlock)
        }
      })
      return applyDefaultModes(merged)
    }
    return applyDefaultModes(defaultBlocks)
  })

  const saveBlocks = (newBlocks: StatBlockConfig[]) => {
    setBlocks(newBlocks)
    safeSetJSON(key, newBlocks)
  }

  const resetBlocks = () => {
    setBlocks(defaultBlocks)
    safeRemoveItem(key)
  }

  const visibleBlocks = blocks.filter(b => b.visible)

  return {
    blocks,
    saveBlocks,
    resetBlocks,
    visibleBlocks,
    defaultBlocks }
}
