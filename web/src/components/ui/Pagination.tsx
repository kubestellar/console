import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// Hook for managing pagination state
export function usePagination<T>(items: T[], defaultPerPage: number = 5, resetOnFilterChange: boolean = true) {
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(defaultPerPage)
  const prevDefaultPerPage = useRef(defaultPerPage)
  const prevItemsLength = useRef(items.length)

  // Update itemsPerPage when defaultPerPage changes (e.g., when user selects "Show All")
  useEffect(() => {
    if (prevDefaultPerPage.current !== defaultPerPage) {
      prevDefaultPerPage.current = defaultPerPage
      setItemsPerPage(defaultPerPage)
      setCurrentPage(1)
    }
  }, [defaultPerPage])

  // Reset to page 1 when filter changes (items count changes)
  useEffect(() => {
    if (resetOnFilterChange && prevItemsLength.current !== items.length) {
      if (currentPage > 1) {
        setCurrentPage(1)
      }
      prevItemsLength.current = items.length
    }
  }, [items.length, resetOnFilterChange, currentPage])

  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))

  // Derive safe page without setState during render (avoids React anti-pattern)
  const safePage = Math.min(currentPage, totalPages)

  // Sync currentPage back when out of bounds, but via effect not during render
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * itemsPerPage
    return items.slice(start, start + itemsPerPage)
  }, [items, safePage, itemsPerPage])

  // Use ref to avoid stale totalPages in goToPage callback
  const totalPagesRef = useRef(totalPages)
  totalPagesRef.current = totalPages

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPagesRef.current)))
  }, [])

  const setPerPage = useCallback((perPage: number) => {
    setItemsPerPage(perPage)
    setCurrentPage(1)
  }, [])

  return {
    paginatedItems,
    currentPage: safePage,
    totalPages,
    totalItems,
    itemsPerPage,
    goToPage,
    setPerPage,
    // Convenience: whether pagination is needed
    needsPagination: totalItems > itemsPerPage,
  }
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
  itemsPerPageOptions = [5, 10, 20, 50],
}: PaginationProps) {
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
            <span className="text-muted-foreground">Per page:</span>
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
          <button
            onClick={() => onPageChange(1)}
            disabled={!canGoPrevious}
            className="p-1.5 rounded hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
            title="First page"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={!canGoPrevious}
            className="p-1.5 rounded hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
            title="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="px-3 py-1 text-foreground">
            {currentPage} / {totalPages || 1}
          </span>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={!canGoNext}
            className="p-1.5 rounded hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
            title="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={!canGoNext}
            className="p-1.5 rounded hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
            title="Last page"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
