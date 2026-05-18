export function DashboardSkeleton() {
  return (
    <div data-testid="dashboard-page" className="pt-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-8 w-48 bg-secondary rounded animate-pulse mb-2" />
          <div className="h-4 w-64 bg-secondary/50 rounded animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-10 w-28 bg-secondary rounded animate-pulse" />
          <div className="h-10 w-28 bg-secondary rounded animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="glass rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="h-5 w-32 bg-secondary rounded animate-pulse" />
              <div className="h-5 w-8 bg-secondary rounded animate-pulse" />
            </div>
            <div className="space-y-3">
              <div className="h-4 w-full bg-secondary/50 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-secondary/50 rounded animate-pulse" />
              <div className="h-24 w-full bg-secondary/30 rounded animate-pulse" />
              <div className="h-4 w-1/2 bg-secondary/50 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
