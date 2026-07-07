import type { K8sGroundTruth } from './k8sTypes'
import { sanitizeJson } from '../evidence/sanitizeEvidence'

export function redactK8sGroundTruth(groundTruth: K8sGroundTruth): K8sGroundTruth {
  return sanitizeJson({
    ...groundTruth,
    contexts: {
      ...groundTruth.contexts,
      names: groundTruth.contexts.names.map((name, index) => `context-${index + 1}-${name.replace(/[^a-z0-9-]/gi, '').slice(0, 12)}`),
    },
  })
}
