export function FeedLoadingSkeleton() {
  return (
    <div className="h-full flex flex-col animate-pulse">
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <div className="h-5 w-32 bg-secondary/50 rounded" />
        <div className="h-6 w-6 bg-secondary/50 rounded" />
      </div>
      <div className="space-y-3 flex-1">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="p-3 rounded-lg bg-secondary/20">
            <div className="h-4 w-3/4 bg-secondary/50 rounded mb-2" />
            <div className="h-3 w-1/2 bg-secondary/30 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
