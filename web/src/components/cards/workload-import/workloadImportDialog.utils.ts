/**
 * Parsing/conversion utilities for the WorkloadImportDialog.
 */
import { load as yamlLoad, loadAll as yamlLoadAll } from 'js-yaml'
import type { Workload } from '../WorkloadDeployment'
import { VALID_WORKLOAD_KINDS, DEFAULT_REPLICA_COUNT } from './workloadImportDialog.constants'

export interface ParsedResource {
  kind: string
  name: string
  namespace: string
  image: string
}

/**
 * Parse a YAML document string into an array of valid K8s workload resources.
 * Supports multi-document YAML (separated by `---`).
 */
export function parseYamlDocuments(text: string): { resources: ParsedResource[]; errors: string[] } {
  const resources: ParsedResource[] = []
  const errors: string[] = []

  if (!text.trim()) {
    errors.push('YAML input is empty')
    return { resources, errors }
  }

  try {
    const docs = yamlLoadAll(text)
    for (const doc of docs) {
      if (!doc || typeof doc !== 'object') continue
      const obj = doc as Record<string, unknown>

      const kind = obj.kind as string | undefined
      if (!kind) {
        errors.push('Document missing "kind" field')
        continue
      }
      if (!VALID_WORKLOAD_KINDS.has(kind)) {
        errors.push(`Unsupported kind "${kind}" — expected one of: ${[...VALID_WORKLOAD_KINDS].join(', ')}`)
        continue
      }

      const metadata = obj.metadata as Record<string, unknown> | undefined
      const name = (metadata?.name as string) || 'unnamed'
      const namespace = (metadata?.namespace as string) || 'default'

      const spec = obj.spec as Record<string, unknown> | undefined
      const templateSpec =
        kind === 'CronJob'
          ? (((spec?.jobTemplate as Record<string, unknown> | undefined)?.spec as Record<string, unknown> | undefined)
              ?.template as Record<string, unknown> | undefined)?.spec as Record<string, unknown> | undefined
          : ((spec?.template as Record<string, unknown> | undefined)?.spec as Record<string, unknown> | undefined)

      const containers = (templateSpec?.containers as Array<Record<string, unknown>> | undefined) || []
      const image = (containers[0]?.image as string) || 'unknown'

      resources.push({ kind, name, namespace, image })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    errors.push(`YAML parse error: ${message}`)
  }

  return { resources, errors }
}

/**
 * Validate a Helm `values` YAML blob, returning true when it parses cleanly.
 */
export function isValidYaml(text: string): boolean {
  try {
    yamlLoad(text)
    return true
  } catch {
    return false
  }
}

/**
 * Convert a ParsedResource into a full Workload object with sensible defaults.
 */
export function resourceToWorkload(r: ParsedResource): Workload {
  return {
    name: r.name,
    namespace: r.namespace,
    type: r.kind as Workload['type'],
    status: 'Pending',
    replicas: DEFAULT_REPLICA_COUNT,
    readyReplicas: 0,
    image: r.image,
    labels: { 'app.kubernetes.io/name': r.name },
    targetClusters: [],
    deployments: [],
    createdAt: new Date().toISOString(),
  }
}
