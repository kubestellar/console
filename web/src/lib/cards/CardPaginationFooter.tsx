import { useCardType } from '../../components/cards/CardWrapper'
import { Pagination } from '../../components/ui/Pagination'
import { emitCardPaginationUsed } from '../analytics'

export interface CardPaginationFooterProps {
  /** Current page (1-indexed) */
  currentPage: number
  /** Total number of pages */
  totalPages: number
  /** Total number of items across all pages */
  totalItems: number
  /** Items per page */
  itemsPerPage: number
  /** Page change callback */
  onPageChange: (page: number) => void
  /** Whether pagination is needed (hide when all items fit on one page) */
  needsPagination: boolean
}

/**
 * Standardized pagination footer with consistent separator styling.
 * Only renders when needsPagination is true.
 */
export function CardPaginationFooter({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  needsPagination }: CardPaginationFooterProps) {
  const cardType = useCardType()

  if (!needsPagination) return null

  const handlePageChange = (page: number) => {
    emitCardPaginationUsed(page, totalPages, cardType)
    onPageChange(page)
  }

  return (
    <div className="pt-2 mt-2 border-t border-border/50">
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={itemsPerPage}
        onPageChange={handlePageChange}
      />
    </div>
  )
}
