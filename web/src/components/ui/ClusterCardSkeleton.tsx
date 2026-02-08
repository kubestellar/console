import { RefreshCw } from 'lucide-react'

/**
 * Skeleton loading card for cluster display
 * Shows placeholder content while cluster data is loading
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
          <div className="w-4 h-4 rounded-full bg-muted-foreground/20" />
          <div>
            {/* Cluster name */}
            <div className="h-5 w-32 bg-muted-foreground/20 rounded mb-2" />
            {/* Server and user placeholders */}
            <div className="flex flex-col gap-1.5">
              <div className="h-3 w-48 bg-muted-foreground/10 rounded" />
              <div className="h-3 w-28 bg-muted-foreground/10 rounded" />
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-4 text-center">
        {[...Array(4)].map((_, i) => (
          <div key={i}>
            <div className="h-6 w-10 mx-auto bg-muted-foreground/20 rounded mb-1" />
            <div className="h-3 w-12 mx-auto bg-muted-foreground/10 rounded" />
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="h-3 w-24 bg-muted-foreground/10 rounded" />
          <div className="h-3 w-20 bg-muted-foreground/10 rounded" />
        </div>
      </div>
    </div>
  )
}

/**
 * Stats overview skeleton for the top summary section
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
          <div className="h-8 w-12 bg-muted-foreground/20 rounded mb-2" />
          <div className="h-4 w-16 bg-muted-foreground/10 rounded" />
        </div>
      ))}
    </div>
  )
}
