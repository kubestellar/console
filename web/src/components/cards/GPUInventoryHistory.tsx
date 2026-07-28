import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import {
  Cpu, TrendingUp, TrendingDown, Minus, Clock, Server,
  BarChart3, Table2, ChevronDown, ArrowUpDown, RefreshCw,
} from 'lucide-react'
import { useMetricsHistory } from '../../hooks/useMetricsHistory'
import type { MetricsSnapshot } from '../../types/predictions'
import { useCachedGPUNodes } from '../../hooks/useCachedData'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useGlobalFilters } from '../cardFilters/FilterContext'
import { useCardLoadingState } from './CardDataContext'
import { CardControlsRow, CardPaginationFooter, CardSearchInput } from '../../lib/cards/CardComponents'
import { useCardData } from '../../lib/cards/cardHooks'
import { CardHeaderIcon, CardHeaderText } from '../../lib/cards/CardHeader'
import { CardDataBoundary } from './CardDataBoundary'
import { cn } from '../../lib/cn'
import { useTranslation } from 'react-i18next'
import { GPUInventoryHistoryParts } from './GPUInventoryHistory.parts'

const DEFAULT_SORT_FIELD = 'timestamp'

function GPUInventoryHistoryInternal() {
  const { t } = useTranslation(['cards', 'common'])
  const { filters } = useGlobalFilters()
  const { isDemoMode } = useDemoMode()
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [sortField, setSortField] = useState(DEFAULT_SORT_FIELD)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)

  const history = useMetricsHistory(selectedNode)
  const cachedNodes = useCachedGPUNodes()
  const nodes = isDemoMode ? cachedNodes.demoNodes : cachedNodes.nodes

  const filteredHistory = useMemo(() => {
    const list = history?.items ?? []
    if (!search && !filters.search) return list
    const q = `${search} ${filters.search}`.trim().toLowerCase()
    return list.filter(item =>
      [item.nodeName, item.gpuModel, item.hostName, item.clusterName]
        .some(value => value?.toLowerCase().includes(q))
    )
  }, [history?.items, search, filters.search])

  const sortedHistory = useMemo(() => {
    const list = [...filteredHistory]
    list.sort((a, b) => {
      const aValue = a[sortField as keyof MetricsSnapshot]
      const bValue = b[sortField as keyof MetricsSnapshot]
      const aNum = typeof aValue === 'number' ? aValue : Number(aValue ?? 0)
      const bNum = typeof bValue === 'number' ? bValue : Number(bValue ?? 0)
      return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
    })
    return list
  }, [filteredHistory, sortDirection, sortField])

  const {
    items: paginatedItems,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: cardFilters,
    sorting,
    containerStyle,
  } = useCardData(sortedHistory, {
    filter: {
      searchFields: ['nodeName', 'gpuModel', 'hostName', 'clusterName'],
      storageKey: 'gpu-inventory-history',
    },
    sort: {
      defaultField: DEFAULT_SORT_FIELD,
      defaultDirection: 'desc',
    },
    defaultLimit: 10,
  })

  useCardLoadingState({
    isLoading: !history,
    isRefreshing: false,
    hasAnyData: sortedHistory.length > 0,
    isDemoData: isDemoMode,
  })

  useEffect(() => {
    if (selectedNode) {
      setShowDetails(true)
    }
  }, [selectedNode])

  const handleRefresh = useCallback(() => {
    void history?.refresh()
  }, [history])

  const handleSelectNode = useCallback((node: string) => {
    setSelectedNode(node)
    setShowDetails(true)
  }, [])

  const handleSortToggle = useCallback(() => {
    setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
  }, [])

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <CardHeaderIcon icon={Cpu} />
          <CardHeaderText title={t('cards:gpuInventoryHistory.title')} subtitle={t('cards:gpuInventoryHistory.subtitle')} />
        </div>
        <button
          onClick={handleRefresh}
          className="p-1.5 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
          title={t('common:common.refresh')}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col gap-2 mb-2 shrink-0">
        <CardSearchInput
          value={cardFilters.search}
          onChange={cardFilters.setSearch}
          placeholder={t('cards:gpuInventoryHistory.searchPlaceholder')}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 shrink-0">
        <CardControlsRow
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy: sorting.sortBy,
            sortOptions: [
              { value: 'timestamp', label: t('cards:gpuInventoryHistory.sort.timestamp') },
              { value: 'usage', label: t('cards:gpuInventoryHistory.sort.usage') },
              { value: 'temperature', label: t('cards:gpuInventoryHistory.sort.temperature') },
            ],
            onSortChange: (value) => sorting.setSortBy(value as typeof DEFAULT_SORT_FIELD),
            sortDirection: sorting.sortDirection,
            onSortDirectionChange: sorting.setSortDirection,
          }}
        />
        <button
          onClick={handleSortToggle}
          className={cn('flex items-center gap-1 px-2 py-0.5 text-2xs rounded border transition-colors',
            sortDirection === 'desc' ? 'bg-secondary/50 border-border text-muted-foreground' : 'bg-primary/20 border-primary/30 text-primary')}
        >
          <ArrowUpDown className="w-3 h-3" />
          {sortDirection === 'desc' ? t('common:common.descending') : t('common:common.ascending')}
        </button>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto space-y-2 min-h-0 scrollbar-thin" style={containerStyle}>
        {paginatedItems.map(item => (
          <div key={item.id} className="p-3 rounded-lg bg-secondary/20 border border-border/40">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Server className="w-4 h-4 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="font-medium truncate">{item.nodeName}</div>
                  <div className="text-xs text-muted-foreground truncate">{item.gpuModel}</div>
                </div>
              </div>
              <button
                onClick={() => handleSelectNode(item.nodeName)}
                className="text-xs text-primary hover:underline"
              >
                {t('common:common.details')}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{item.timestamp}</span>
              <span className="inline-flex items-center gap-1"><TrendingUp className="w-3 h-3" />{item.usage}%</span>
              <span className="inline-flex items-center gap-1"><TrendingDown className="w-3 h-3" />{item.temperature}°C</span>
            </div>
          </div>
        ))}
      </div>

      <div className="shrink-0">
        <CardPaginationFooter
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
          onPageChange={goToPage}
          needsPagination={needsPagination}
        />
      </div>

      {showDetails && selectedNode && (
        <GPUInventoryHistoryParts
          selectedNode={selectedNode}
          onClose={() => setShowDetails(false)}
          expanded={expanded}
          setExpanded={setExpanded}
        />
      )}
    </div>
  )
}

export function GPUInventoryHistory() {
  return (
    <CardDataBoundary cardId="GPUInventoryHistory">
      <GPUInventoryHistoryInternal />
    </CardDataBoundary>
  )
}