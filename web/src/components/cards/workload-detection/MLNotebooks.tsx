import { ExternalLink, AlertCircle } from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { StatusBadge } from '../../ui/StatusBadge'
import { useCardData } from '../../../lib/cards/cardHooks'
import { CardPaginationFooter, CardControlsRow, CardSearchInput } from '../../../lib/cards/CardComponents'
import { DEMO_NOTEBOOKS, useDemoData } from './shared'
import { useCardLoadingState } from '../CardDataContext'
import { useTranslation } from 'react-i18next'

type Notebook = typeof DEMO_NOTEBOOKS[number]
type SortByOption = 'name' | 'user' | 'status'

const SORT_OPTION_KEYS = [
  { value: 'name' as const, labelKey: 'mlNotebooks.sortName' },
  { value: 'user' as const, labelKey: 'mlNotebooks.sortUser' },
  { value: 'status' as const, labelKey: 'mlNotebooks.sortStatus' },
] as const

interface MLNotebooksProps {
  config?: Record<string, unknown>
}

export function MLNotebooks({ config: _config }: MLNotebooksProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { data: notebooks, isLoading, isRefreshing, isDemoData } = useDemoData(DEMO_NOTEBOOKS)

  const hasData = notebooks.length > 0
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData,
  })

  const statusOrder: Record<string, number> = { running: 0, idle: 1, stopped: 2 }

  const { items, totalItems, currentPage, totalPages, goToPage, needsPagination, itemsPerPage, setItemsPerPage, filters, sorting,
    containerRef,
    containerStyle,
  } = useCardData<Notebook, SortByOption>(notebooks, {
    filter: {
      searchFields: ['name', 'user', 'status'] as (keyof Notebook)[],
      storageKey: 'ml-notebooks',
    },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: {
        name: (a, b) => a.name.localeCompare(b.name),
        user: (a, b) => a.user.localeCompare(b.user),
        status: (a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99),
      },
    },
    defaultLimit: 5,
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <StatusBadge color="green">{t('common:common.active')}</StatusBadge>
      case 'idle':
        return <StatusBadge color="yellow">{t('mlNotebooks.idle')}</StatusBadge>
      case 'stopped':
        return <StatusBadge color="gray">{t('mlNotebooks.stopped')}</StatusBadge>
      default:
        return <StatusBadge color="gray">{status}</StatusBadge>
    }
  }

  if (isLoading && !hasData) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <StatusBadge color="blue">
          {notebooks.filter(n => n.status === 'running').length} active
        </StatusBadge>
        <CardControlsRow
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy: sorting.sortBy,
            sortOptions: SORT_OPTION_KEYS.map(opt => ({ value: opt.value, label: t(opt.labelKey) })),
            onSortChange: (v) => sorting.setSortBy(v as SortByOption),
            sortDirection: sorting.sortDirection,
            onSortDirectionChange: sorting.setSortDirection,
          }}
          className="mb-0"
        />
      </div>

      {/* Search */}
      <CardSearchInput
        value={filters.search}
        onChange={filters.setSearch}
        placeholder={t('mlNotebooks.searchNotebooks')}
        className="mb-3"
      />

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs mb-4">
        <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-blue-400 font-medium">{t('cards:mlNotebooks.notebookDetection')}</p>
          <p className="text-muted-foreground">
            {t('cards:mlNotebooks.notebookDetectionDescription')}{' '}
            <a href="https://jupyterhub.readthedocs.io/en/stable/getting-started/index.html" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline">
              JupyterHub docs <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>
        </div>
      </div>

      {/* Notebook list */}
      <div ref={containerRef} className="flex-1 overflow-y-auto" style={containerStyle}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border/50">
              <th className="text-left py-2">{t('mlNotebooks.columnNotebook')}</th>
              <th className="text-left py-2">{t('mlNotebooks.columnUser')}</th>
              <th className="text-right py-2">{t('common:common.resources')}</th>
              <th className="text-right py-2">{t('common:common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((nb, idx) => (
              <tr key={idx} className="border-b border-border/30 hover:bg-secondary/30">
                <td className="py-2 font-medium text-foreground">{nb.name}</td>
                <td className="py-2 text-muted-foreground">{nb.user}</td>
                <td className="py-2 text-right text-xs text-muted-foreground">
                  {nb.cpu} / {nb.memory} {nb.gpu !== '-' && `/ ${nb.gpu}`}
                </td>
                <td className="py-2 text-right">{getStatusBadge(nb.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 5}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />
    </div>
  )
}
