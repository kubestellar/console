import { RefreshCw } from 'lucide-react'
import { Skeleton } from './Skeleton'

/**
 * Skeleton loading card for cluster display
 * Shows placeholder content while cluster data is loading
 * Uses the shared Skeleton component for consistent styling with dashboard cards
 */
export function ClusterCardSkeleton() {
  return (
    <div className="glass p-5 rounded-lg border border-transparent animate-pulse relative">
      {/* Refresh indicator in corner */}
      <div className="absolute top-3 right-3">
        <RefreshCw className="w-4 h-4 text-muted-foreground/40 animate-spin" />
      </div>

      {/* Header section */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Status indicator placeholder */}
          <Skeleton variant="circular" width={16} height={16} />
          <div>
            {/* Cluster name */}
            <Skeleton variant="rounded" width={128} height={20} className="mb-2" />
            {/* Server and user placeholders */}
            <div className="flex flex-col gap-1.5">
              <Skeleton variant="text" width={192} height={12} />
              <Skeleton variant="text" width={112} height={12} />
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-4 text-center">
        {[...Array(4)].map((_, i) => (
          <div key={i}>
            <Skeleton variant="rounded" width={40} height={24} className="mx-auto mb-1" />
            <Skeleton variant="text" width={48} height={12} className="mx-auto" />
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between">
          <Skeleton variant="text" width={96} height={12} />
          <Skeleton variant="text" width={80} height={12} />
        </div>
      </div>
    </div>
  )
}

/**
 * Stats overview skeleton for the top summary section
 * Uses the shared Skeleton component for consistent styling with dashboard cards
 */
export function StatsOverviewSkeleton() {
  return (
    <div className="grid grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="glass p-4 rounded-lg animate-pulse relative">
          {/* Refresh indicator */}
          <div className="absolute top-2 right-2">
            <RefreshCw className="w-3 h-3 text-muted-foreground/40 animate-spin" />
          </div>
          <Skeleton variant="rounded" width={48} height={32} className="mb-2" />
          <Skeleton variant="text" width={64} height={16} />
        </div>
      ))}
    </div>
  )
}
