import { Box } from 'lucide-react'
import { cn } from '../../../../lib/cn'
import { POD_STATUS_CONFIG } from './types'

export interface DeploymentPodsPanelProps {
  pods: Array<{ name: string; status: string; restarts: number }>
  onDrillToPod: (pod: { name: string; status: string; restarts: number }) => void
}

export function DeploymentPodsPanel({ pods, onDrillToPod }: DeploymentPodsPanelProps) {
  if (pods.length === 0) {
    return (
      <div className="p-4 rounded-lg bg-card/50 border border-border text-center text-muted-foreground">
        No pods found for this Deployment
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {pods.map((pod) => (
        <button
          key={pod.name}
          onClick={() => onDrillToPod(pod)}
          className="w-full p-3 rounded-lg bg-card/50 border border-border hover:bg-card/80 flex items-center justify-between group transition-colors"
        >
          <div className="flex items-center gap-3">
            <Box className="w-5 h-5 text-cyan-400" />
            <span className="font-mono text-foreground">{pod.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={cn('text-xs px-2 py-1 rounded', (() => {
                const config = POD_STATUS_CONFIG[pod.status] || POD_STATUS_CONFIG.Unknown
                return `${config.bg} ${config.text}`
              })())}
            >
              {pod.status}
            </span>
            {pod.restarts > 0 && <span className="text-xs text-yellow-400">{pod.restarts} restarts</span>}
            <svg className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      ))}
    </div>
  )
}
