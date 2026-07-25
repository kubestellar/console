const OVERVIEW_STAT_SKELETON_COUNT = 4;
const ISSUE_SKELETON_COUNT = 2;

export function ClusterDrillDownSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(OVERVIEW_STAT_SKELETON_COUNT)].map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-lg bg-card/50 border border-border"
          >
            <div className="h-4 w-16 bg-secondary rounded mb-2" />
            <div className="h-8 w-20 bg-secondary rounded" />
            <div className="h-3 w-12 bg-secondary/50 rounded mt-2" />
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="h-9 w-28 bg-secondary rounded-lg" />
      </div>

      <div>
        <div className="h-6 w-32 bg-secondary rounded mb-4" />
        <div className="space-y-2">
          {[...Array(ISSUE_SKELETON_COUNT)].map((_, i) => (
            <div
              key={i}
              className="p-3 rounded-lg bg-card/30 border border-border"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-40 bg-secondary rounded" />
                  <div className="h-3 w-24 bg-secondary/50 rounded" />
                </div>
                <div className="h-6 w-16 bg-secondary rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
