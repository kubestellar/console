import type { K8sGroundTruth } from './k8sTypes'
import { sanitizeJson } from '../evidence/sanitizeEvidence'

export function redactK8sGroundTruth(groundTruth: K8sGroundTruth): K8sGroundTruth {
  const redactContextName = (name: string, index: number) => `context-${index + 1}-${name.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`
  return sanitizeJson({
    ...groundTruth,
    contexts: {
      ...groundTruth.contexts,
      names: groundTruth.contexts.names.map(redactContextName),
    },
    ...(groundTruth.listingFailures !== undefined ? {
      listingFailures: groundTruth.listingFailures.map(failure => {
        const index = groundTruth.contexts.names.indexOf(failure.context)
        return {
          ...failure,
          context: index >= 0 ? redactContextName(failure.context, index) : 'context-unknown',
        }
      }),
    } : {}),
  })
}
