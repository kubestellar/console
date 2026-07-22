export type TabType = 'overview' | 'pods' | 'events' | 'describe' | 'yaml'

export interface Props {
  data: Record<string, unknown>
}

/** Maximum replicas allowed via the UI scale widget. Kubernetes itself supports
 *  up to 2^31-1 but most real deployments won't exceed a few hundred. */
export const MAX_SCALE_REPLICAS = 100

/** Pod status styling configuration */
export const POD_STATUS_CONFIG: Record<string, { bg: string; text: string }> = {
  Running: { bg: 'bg-green-500/20', text: 'text-green-400' },
  Pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  Failed: { bg: 'bg-red-500/20', text: 'text-red-400' },
  CrashLoopBackOff: { bg: 'bg-red-500/20', text: 'text-red-400' },
  ImagePullBackOff: { bg: 'bg-red-500/20', text: 'text-red-400' },
  Unknown: { bg: 'bg-red-500/20', text: 'text-red-400' },
}
