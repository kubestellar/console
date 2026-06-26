import type { ReactNode } from 'react'
import { useStablePageHeight } from './useStablePageHeight'

/**
 * Wrapper component for paginated content that maintains stable height.
 * Use this for cards that manage their own pagination (e.g. usePagination)
 * instead of useCardData.
 */
export function StablePaginatedContent({
  pageSize,
  totalItems,
  className,
  children,
}: {
  pageSize: number
  totalItems: number
  className?: string
  children: ReactNode
}) {
  const { containerRef, containerStyle } = useStablePageHeight(pageSize, totalItems)
  return (
    <div ref={containerRef} className={className} style={containerStyle}>
      {children}
    </div>
  )
}
