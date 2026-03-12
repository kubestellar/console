export interface PodDrillDownProps {
  data: Record<string, unknown>
}

export type TabType = 'overview' | 'labels' | 'related' | 'describe' | 'logs' | 'exec' | 'events' | 'yaml'

export interface RelatedResource {
  kind: string
  name: string
  namespace?: string
}

/** Cache structure stored in view data */
export interface CachedData {
  describeOutput?: string
  logsOutput?: string
  eventsOutput?: string
  yamlOutput?: string
  podStatusOutput?: string
  aiAnalysis?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  configMaps?: string[]
  secrets?: string[]
  pvcs?: string[]
  serviceAccount?: string
  ownerChain?: RelatedResource[]
  fetchedAt?: number
}

/** Statuses that indicate pod health issues */
export const UNHEALTHY_STATUSES = [
  'Evicted', 'Failed', 'Error', 'CrashLoopBackOff', 'ImagePullBackOff',
  'ErrImagePull', 'CreateContainerConfigError', 'InvalidImageName',
  'OOMKilled', 'Terminating', 'Unknown', 'ContainerStatusUnknown',
  'Pending', 'Init:Error', 'Init:CrashLoopBackOff', 'PodInitializing',
] as const
