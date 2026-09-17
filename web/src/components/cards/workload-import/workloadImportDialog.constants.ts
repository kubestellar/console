/**
 * Constants shared across the WorkloadImportDialog split modules.
 */

/** Valid top-level Kubernetes workload kinds we accept */
export const VALID_WORKLOAD_KINDS = new Set([
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'Job',
  'CronJob',
])

/** Default replica count when kind doesn't specify one */
export const DEFAULT_REPLICA_COUNT = 1

/** Tab identifiers */
export type ImportTab = 'yaml' | 'helm' | 'github' | 'kustomize'

/** Shared Tailwind classes for text inputs across the import tabs */
export const inputClasses =
  'w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary/30 text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50'

/** Shared Tailwind classes for input labels across the import tabs */
export const labelClasses = 'block text-xs font-medium text-muted-foreground mb-1'
