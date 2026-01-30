import { ExternalLink } from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { useCachedProwJobs } from '../../../hooks/useCachedData'

interface ProwStatusProps {
  config?: Record<string, unknown>
}

export function ProwStatus({ config: _config }: ProwStatusProps) {
  const { status, isLoading } = useCachedProwJobs('prow', 'prow')

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={100} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Status badge */}
      <div className="flex items-center justify-between mb-4">
        <span className={`text-xs px-1.5 py-0.5 rounded ${status.healthy ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {status.healthy ? 'Healthy' : 'Unhealthy'}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="text-2xl font-bold text-green-400">{status.successRate}%</div>
          <div className="text-xs text-muted-foreground">Success Rate</div>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="text-2xl font-bold text-foreground">{status.prowJobsLastHour}</div>
          <div className="text-xs text-muted-foreground">Jobs (last hour)</div>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-blue-400">{status.runningJobs}</div>
            <span className="text-xs text-muted-foreground">running</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-yellow-400">{status.pendingJobs}</div>
            <span className="text-xs text-muted-foreground">pending</span>
          </div>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-green-400">{status.successJobs}</div>
            <span className="text-xs text-muted-foreground">success</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-red-400">{status.failedJobs}</div>
            <span className="text-xs text-muted-foreground">failed</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        <a href="https://prow2.kubestellar.io" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline flex items-center gap-1">
          Open Prow Dashboard <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}
