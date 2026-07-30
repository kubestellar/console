import { Skeleton } from '../../components/ui/Skeleton'

export interface CardSkeletonProps {
  /** Number of skeleton rows to show */
  rows?: number
  /** Type of skeleton layout */
  type?: 'table' | 'list' | 'chart' | 'status' | 'metric'
  /** Show header skeleton */
  showHeader?: boolean
  /** Show search skeleton */
  showSearch?: boolean
  /** Custom row height in pixels (overrides type-based default) */
  rowHeight?: number
}

export function CardSkeleton({
  rows = 3,
  type = 'list',
  showHeader = true,
  showSearch = false,
  rowHeight }: CardSkeletonProps) {
  const defaultHeight = type === 'table' ? 48 : type === 'metric' ? 80 : 80
  const height = rowHeight ?? defaultHeight

  return (
    <div className="h-full flex flex-col min-h-card">
      {showHeader && (
        <div className="flex items-center justify-between mb-3">
          <Skeleton variant="text" width={80} height={16} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
      )}
      {showSearch && (
        <Skeleton variant="rounded" height={32} className="mb-3" />
      )}
      {type === 'metric' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="glass p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Skeleton variant="circular" width={20} height={20} />
                <Skeleton variant="text" width={80} height={16} />
              </div>
              <Skeleton variant="text" width={60} height={36} className="mb-1" />
              <Skeleton variant="text" width={100} height={12} />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {type === 'chart' ? (
            <Skeleton variant="rounded" height={200} />
          ) : (
            Array.from({ length: rows }).map((_, i) => (
              <Skeleton
                key={i}
                variant="rounded"
                height={height}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
