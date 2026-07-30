/**
 * Pod status block for PodDrillDown overview — kubectl get pod wide output with loading/error states.
 */
import { Loader2 } from 'lucide-react'

export interface PodStatusSectionProps {
  agentConnected: boolean
  podName: string
  namespace: string
  output: string | null
  loading: boolean
  error: string | null
  fetchingLabel: string
}

export function PodStatusSection({
  agentConnected,
  podName,
  namespace,
  output,
  loading,
  error,
  fetchingLabel,
}: PodStatusSectionProps) {
  if (!agentConnected) {
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-card/50 border border-border">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">{fetchingLabel}</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
        {error}
      </div>
    )
  }

  if (!output) {
    return null
  }

  return (
    <pre className="p-3 rounded-lg bg-muted border border-border overflow-x-auto text-xs text-foreground font-mono">
      <code className="text-muted-foreground"># kubectl get pod {podName} -n {namespace} -o wide</code>
      {'\n'}
      {output}
    </pre>
  )
}
