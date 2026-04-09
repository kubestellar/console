import { useReducer, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'

interface PaginationPageState {
  currentPage: number
  itemsPerPage: number
}

type PaginationAction =
  | { type: 'SET_PAGE'; page: number }
  | { type: 'SET_PER_PAGE'; perPage: number }

function paginationReducer(state: PaginationPageState, action: PaginationAction): PaginationPageState {
  switch (action.type) {
    case 'SET_PAGE':
      return { ...state, currentPage: action.page }
    case 'SET_PER_PAGE':
      return { currentPage: 1, itemsPerPage: action.perPage }
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

// Hook for managing pagination state
export function usePagination<T>(items: T[], defaultPerPage: number = 5, resetOnFilterChange: boolean = true) {
  const [{ currentPage, itemsPerPage }, dispatch] = useReducer(paginationReducer, {
    currentPage: 1,
    itemsPerPage: defaultPerPage })
  const prevDefaultPerPage = useRef(defaultPerPage)
  const prevItemsLength = useRef(items.length)

  // Update itemsPerPage when defaultPerPage changes (e.g., when user selects "Show All")
  useEffect(() => {
    if (prevDefaultPerPage.current !== defaultPerPage) {
      prevDefaultPerPage.current = defaultPerPage
      dispatch({ type: 'SET_PER_PAGE', perPage: defaultPerPage })
    }
  }, [defaultPerPage])

  // Reset to page 1 when filter changes (items count changes)
  useEffect(() => {
    if (resetOnFilterChange && prevItemsLength.current !== items.length) {
      if (currentPage > 1) {
        dispatch({ type: 'SET_PAGE', page: 1 })
      }
      prevItemsLength.current = items.length
    }
  }, [items.length, resetOnFilterChange, currentPage])

  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))

  // Derive safe page without setState during render (avoids React anti-pattern)
  const safePage = Math.min(currentPage, totalPages)

  // Sync currentPage back when out of bounds (#5762).
  // Only depend on totalPages — including currentPage risks infinite loop.
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      dispatch({ type: 'SET_PAGE', page: totalPages })
    }
  }, [totalPages]) // eslint-disable-line react-hooks/exhaustive-deps

  const paginatedItems = (() => {
    const start = (safePage - 1) * itemsPerPage
    return items.slice(start, start + itemsPerPage)
  })()

  // Use ref to avoid stale totalPages in goToPage callback
  const totalPagesRef = useRef(totalPages)
  totalPagesRef.current = totalPages

  const goToPage = (page: number) => {
    dispatch({ type: 'SET_PAGE', page: Math.max(1, Math.min(page, totalPagesRef.current)) })
  }

  const setPerPage = (perPage: number) => {
    dispatch({ type: 'SET_PER_PAGE', perPage })
  }

  return {
    paginatedItems,
    currentPage: safePage,
    totalPages,
    totalItems,
    itemsPerPage,
    goToPage,
    setPerPage,
    // Convenience: whether pagination is needed
    needsPagination: totalItems > itemsPerPage }
}

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  onItemsPerPageChange?: (perPage: number) => void
  className?: string
  showItemsPerPage?: boolean
  itemsPerPageOptions?: number[]
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  className = '',
  showItemsPerPage = true,
  itemsPerPageOptions = [5, 10, 20, 50] }: PaginationProps) {
  const { t } = useTranslation('common')
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  const canGoPrevious = currentPage > 1
  const canGoNext = currentPage < totalPages

  return (
    <div className={`flex items-center justify-between text-sm ${className}`}>
      {/* Items info */}
      <div className="text-muted-foreground">
        {totalItems > 0 ? (
          <span>
            {t('pagination.showing', { start: startItem, end: endItem, total: totalItems })}
          </span>
        ) : (
          <span>{t('pagination.noItems')}</span>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        {/* Items per page selector */}
        {showItemsPerPage && onItemsPerPageChange && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('pagination.perPage')}</span>
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              className="px-2 py-1 rounded bg-secondary border border-border text-foreground text-sm"
            >
              {itemsPerPageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Page navigation */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(1)}
            disabled={!canGoPrevious}
            className="p-1.5"
            title={t('pagination.firstPage')}
            aria-label={t('pagination.firstPage')}
            icon={<ChevronsLeft className="w-4 h-4" />}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={!canGoPrevious}
            className="p-1.5"
            title={t('pagination.previousPage')}
            aria-label={t('pagination.previousPage')}
            icon={<ChevronLeft className="w-4 h-4" />}
          />

          <span className="px-3 py-1 text-foreground">
            {currentPage} / {totalPages || 1}
          </span>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={!canGoNext}
            className="p-1.5"
            title={t('pagination.nextPage')}
            aria-label={t('pagination.nextPage')}
            icon={<ChevronRight className="w-4 h-4" />}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(totalPages)}
            disabled={!canGoNext}
            className="p-1.5"
            title={t('pagination.lastPage')}
            aria-label={t('pagination.lastPage')}
            icon={<ChevronsRight className="w-4 h-4" />}
          />
        </div>
      </div>
    </div>
  )
}
