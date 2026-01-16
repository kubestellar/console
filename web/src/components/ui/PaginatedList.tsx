import { useState, useMemo, ReactNode } from 'react'

interface PaginatedListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => ReactNode
  pageSize?: number
  pageSizeOptions?: number[]
  showSizeSelector?: boolean
  emptyMessage?: string
}

export function PaginatedList<T>({
  items,
  renderItem,
  pageSize: initialPageSize = 5,
  pageSizeOptions = [5, 10, 25, 50],
  showSizeSelector = true,
  emptyMessage = 'No items to display',
}: PaginatedListProps<T>) {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)

  // Reset to page 1 when page size changes
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setCurrentPage(1)
  }

  const totalPages = Math.ceil(items.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, items.length)

  const paginatedItems = useMemo(() => {
    return items.slice(startIndex, endIndex)
  }, [items, startIndex, endIndex])

  // Don't show pagination if items fit on one page
  const showPagination = items.length > initialPageSize

  if (items.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Items */}
      <div className="space-y-2">
        {paginatedItems.map((item, i) => renderItem(item, startIndex + i))}
      </div>

      {/* Pagination Controls */}
      {showPagination && (
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {startIndex + 1}-{endIndex} of {items.length}
            </span>
            {showSizeSelector && (
              <>
                <span>•</span>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="px-2 py-1 rounded bg-card/50 border border-border text-foreground text-xs"
                >
                  {pageSizeOptions.map(size => (
                    <option key={size} value={size}>{size} per page</option>
                  ))}
                </select>
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1 rounded hover:bg-card/50 disabled:opacity-50 disabled:cursor-not-allowed"
              title="First page"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded hover:bg-card/50 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Previous page"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <span className="px-2 text-xs text-muted-foreground">
              {currentPage} / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded hover:bg-card/50 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Next page"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1 rounded hover:bg-card/50 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Last page"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
