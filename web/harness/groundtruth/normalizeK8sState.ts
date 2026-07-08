import type { K8sDeployment, K8sGroundTruth, K8sNode, K8sPod } from './k8sTypes'

export function normalizeK8sState(input: {
  runId: string
  contextNames: string[]
  reachableContexts: string[]
  nodes: K8sNode[]
  pods: K8sPod[]
  namespaces: unknown[]
  deployments: K8sDeployment[]
  createdNamespaces?: string[]
}): K8sGroundTruth {
  const readyNodes = input.nodes.filter(node =>
    node.status?.conditions?.some(condition => condition.type === 'Ready' && condition.status === 'True'),
  ).length
  const crashLoopBackOff = input.pods.filter(pod =>
    pod.status?.containerStatuses?.some(status => status.state?.waiting?.reason === 'CrashLoopBackOff'),
  ).length
  const availableDeployments = input.deployments.filter(deployment =>
    (deployment.status?.availableReplicas || 0) >= (deployment.status?.replicas || 0),
  ).length

  return {
    runId: input.runId,
    contexts: {
      configured: input.contextNames.length,
      reachable: input.reachableContexts.length,
      names: input.contextNames,
    },
    nodes: {
      total: input.nodes.length,
      ready: readyNodes,
      notReady: Math.max(0, input.nodes.length - readyNodes),
    },
    pods: {
      total: input.pods.length,
      running: input.pods.filter(pod => pod.status?.phase === 'Running').length,
      pending: input.pods.filter(pod => pod.status?.phase === 'Pending').length,
      failed: input.pods.filter(pod => pod.status?.phase === 'Failed').length,
      crashLoopBackOff,
    },
    namespaces: {
      total: input.namespaces.length,
      createdByHarness: input.createdNamespaces || [],
    },
    deployments: {
      total: input.deployments.length,
      available: availableDeployments,
      unavailable: Math.max(0, input.deployments.length - availableDeployments),
    },
  }
}
