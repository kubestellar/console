import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Settings } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Button } from './Button'
import { BaseModal } from '../../lib/modals'
import {
  ALERTS_STAT_BLOCKS,
  ALL_STAT_BLOCKS,
  CLUSTERS_STAT_BLOCKS,
  COMPLIANCE_STAT_BLOCKS,
  COMPUTE_STAT_BLOCKS,
  COST_STAT_BLOCKS,
  DASHBOARD_STAT_BLOCKS,
  DATA_COMPLIANCE_STAT_BLOCKS,
  EVENTS_STAT_BLOCKS,
  GITOPS_STAT_BLOCKS,
  NETWORK_STAT_BLOCKS,
  OPERATORS_STAT_BLOCKS,
  PODS_STAT_BLOCKS,
  SECURITY_STAT_BLOCKS,
  STORAGE_STAT_BLOCKS,
  WORKLOADS_STAT_BLOCKS,
  getDefaultDisplayMode,
  getDefaultStatBlocks,
  getStatsStorageKey,
} from './StatsBlockDefinitions'
import {
  AddStatsPanel,
  type DashboardCategoryItem,
  SortableStatRow,
} from './StatsConfig.parts'
import type { DashboardStatsType, StatBlockConfig } from './Stats.types'
import { safeGetJSON, safeRemoveItem, safeSetJSON } from '../../lib/utils/localStorage'

export type { DashboardStatsType, StatBlockConfig }
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

const DASHBOARD_CATEGORIES: DashboardCategoryItem[] = [
  { type: 'clusters', name: 'Clusters', icon: '🖥️' },
  { type: 'workloads', name: 'Workloads', icon: '📦' },
  { type: 'pods', name: 'Pods', icon: '🗂️' },
  { type: 'compute', name: 'Compute', icon: '🔲' },
  { type: 'gitops', name: 'GitOps', icon: '🚢' },
  { type: 'storage', name: 'Storage', icon: '💽' },
  { type: 'network', name: 'Network', icon: '🌐' },
  { type: 'security', name: 'Security', icon: '🛡️' },
  { type: 'compliance', name: 'Compliance', icon: '🔒' },
  { type: 'data-compliance', name: 'Data Compliance', icon: '📋' },
  { type: 'events', name: 'Events', icon: '📜' },
  { type: 'cost', name: 'Cost', icon: '💵' },
  { type: 'alerts', name: 'Alerts', icon: '🔴' },
  { type: 'operators', name: 'Operators', icon: '⚙️' },
  { type: 'dashboard', name: 'Main Dashboard', icon: '📊' },
  { type: 'ci-cd', name: 'CI/CD', icon: '🔄' },
]

function getStatBlocksForDashboard(dashboardType: DashboardStatsType): StatBlockConfig[] {
  switch (dashboardType) {
    case 'clusters':
      return CLUSTERS_STAT_BLOCKS
    case 'workloads':
      return WORKLOADS_STAT_BLOCKS
    case 'pods':
      return PODS_STAT_BLOCKS
    case 'gitops':
      return GITOPS_STAT_BLOCKS
    case 'storage':
      return STORAGE_STAT_BLOCKS
    case 'network':
      return NETWORK_STAT_BLOCKS
    case 'security':
      return SECURITY_STAT_BLOCKS
    case 'compliance':
      return COMPLIANCE_STAT_BLOCKS
    case 'data-compliance':
      return DATA_COMPLIANCE_STAT_BLOCKS
    case 'compute':
      return COMPUTE_STAT_BLOCKS
    case 'events':
      return EVENTS_STAT_BLOCKS
    case 'cost':
      return COST_STAT_BLOCKS
    case 'alerts':
      return ALERTS_STAT_BLOCKS
    case 'dashboard':
      return DASHBOARD_STAT_BLOCKS
    case 'operators':
      return OPERATORS_STAT_BLOCKS
    case 'ci-cd':
      return GITOPS_STAT_BLOCKS
    default:
      return []
  }
}

export function StatsConfigModal({
  isOpen,
  onClose,
  blocks,
  onSave,
  defaultBlocks,
  title,
}: StatsConfigModalProps) {
  const { t } = useTranslation()
  const resolvedTitle = title || t('statsOverview.configureStats', 'Configure stats')
  const [localBlocks, setLocalBlocks] = useState<StatBlockConfig[]>(blocks)
  const [panelState, setPanelState] = useState<PanelState>({
    showAddPanel: false,
    searchQuery: '',
    expandedCategories: new Set<string>(),
  })

  const { showAddPanel, searchQuery, expandedCategories } = panelState

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setLocalBlocks(blocks)
    setPanelState({ showAddPanel: false, searchQuery: '', expandedCategories: new Set() })
  }, [isOpen, blocks])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const defaultBlockIds = new Set(defaultBlocks.map(block => block.id))
  const currentBlockIds = new Set(localBlocks.map(block => block.id))

  const availableStatsByCategory = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    const result: Map<DashboardStatsType, StatBlockConfig[]> = new Map()

    for (const category of DASHBOARD_CATEGORIES) {
      const categoryBlocks = getStatBlocksForDashboard(category.type)
        .filter(block => !currentBlockIds.has(block.id))
        .filter(block => {
          if (!query) {
            return true
          }
          return block.name.toLowerCase().includes(query)
            || block.id.toLowerCase().includes(query)
            || category.name.toLowerCase().includes(query)
        })

      if (categoryBlocks.length > 0) {
        result.set(category.type, categoryBlocks)
      }
    }

    return result
  }, [currentBlockIds, searchQuery])

  const hasAvailableStats = availableStatsByCategory.size > 0

  useEffect(() => {
    if (!searchQuery.trim()) {
      return
    }

    setPanelState(previous => ({
      ...previous,
      expandedCategories: new Set(availableStatsByCategory.keys()),
    }))
  }, [searchQuery, availableStatsByCategory])

  const toggleCategory = (type: string) => {
    setPanelState(previous => {
      const nextCategories = new Set(previous.expandedCategories)
      if (nextCategories.has(type)) {
        nextCategories.delete(type)
      } else {
        nextCategories.add(type)
      }

      return { ...previous, expandedCategories: nextCategories }
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }

    setLocalBlocks(previous => {
      const oldIndex = previous.findIndex(block => block.id === active.id)
      const newIndex = previous.findIndex(block => block.id === over.id)
      return arrayMove(previous, oldIndex, newIndex)
    })
  }

  const toggleVisibility = (id: string) => {
    setLocalBlocks(previous => previous.map(block => block.id === id ? { ...block, visible: !block.visible } : block))
  }

  const handleAddStat = (block: StatBlockConfig) => {
    setLocalBlocks(previous => [...previous, { ...block, visible: true }])
  }

  const handleRemoveStat = (id: string) => {
    setLocalBlocks(previous => previous.filter(block => block.id !== id))
  }

  const handleSave = () => {
    onSave(localBlocks)
    onClose()
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
        <div className="space-y-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localBlocks.map(block => block.id)} strategy={verticalListSortingStrategy}>
              {(localBlocks || []).map(block => (
                <SortableStatRow
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

        <AddStatsPanel
          showAddPanel={showAddPanel}
          searchQuery={searchQuery}
          onSearchQueryChange={query => setPanelState(previous => ({ ...previous, searchQuery: query }))}
          onHideAddPanel={() => setPanelState(previous => ({ ...previous, showAddPanel: false }))}
          onShowAddPanel={() => setPanelState(previous => ({ ...previous, showAddPanel: true }))}
          hasAvailableStats={hasAvailableStats}
          dashboardCategories={DASHBOARD_CATEGORIES}
          availableStatsByCategory={availableStatsByCategory}
          expandedCategories={expandedCategories}
          onToggleCategory={toggleCategory}
          onAdd={handleAddStat}
          searchPlaceholder={t('statsOverview.searchPlaceholder', 'Search all available stats...')}
          doneLabel={t('common.done', 'Done')}
          addFromDashboardsLabel={t('statsOverview.addStatFromDashboards', 'Add stat from other dashboards')}
          noSearchResultsLabel={t('statsOverview.noSearchResults', 'No stats match your search')}
          allStatsAddedLabel={t('statsOverview.allStatsAdded', 'All stats are already added')}
        />
      </BaseModal.Content>

      <BaseModal.Footer>
        <Button variant="ghost" size="sm" onClick={() => setLocalBlocks(defaultBlocks)}>
          {t('statsOverview.resetToDefault', 'Reset to Default')}
        </Button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="md" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant="accent" size="md" onClick={handleSave} icon={<Check className="h-4 w-4" />}>
            {t('common.save', 'Save')}
          </Button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}

export function useStatsConfig(dashboardType: DashboardStatsType, storageKey?: string) {
  const defaultBlocks = getDefaultStatBlocks(dashboardType)
  const key = storageKey || getStatsStorageKey(dashboardType)

  const applyDefaultModes = (blockList: StatBlockConfig[]): StatBlockConfig[] =>
    blockList.map(block => ({
      ...block,
      displayMode: block.displayMode ?? getDefaultDisplayMode(dashboardType, block.id),
    }))

  const [blocks, setBlocks] = useState<StatBlockConfig[]>(() => {
    const savedBlocks = safeGetJSON<StatBlockConfig[]>(key)
    if (savedBlocks) {
      const validIds = new Set(ALL_STAT_BLOCKS.map(block => block.id))
      const cleanedBlocks = savedBlocks.filter(block => validIds.has(block.id))
      const savedIds = new Set(cleanedBlocks.map(block => block.id))
      const mergedBlocks = [...cleanedBlocks]

      defaultBlocks.forEach(defaultBlock => {
        if (!savedIds.has(defaultBlock.id)) {
          mergedBlocks.push(defaultBlock)
        }
      })

      return applyDefaultModes(mergedBlocks)
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

  return {
    blocks,
    saveBlocks,
    resetBlocks,
    visibleBlocks: blocks.filter(block => block.visible),
    defaultBlocks,
  }
}
