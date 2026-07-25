import { useMemo } from 'react'
import type { Pod, Deployment } from '../NamespaceResources'

export function useNamespaceResourcesData(
  pods: Pod[],
  deployments: Deployment[]
) {
  const podsByDeployment = useMemo(() => {
    const map = new Map<string, Pod[]>()
    for (const pod of pods) {
      const deploymentName = pod.metadata?.ownerReferences?.find(
        (ref) => ref.kind === 'Deployment'
      )?.name
      if (deploymentName) {
        if (!map.has(deploymentName)) {
          map.set(deploymentName, [])
        }
        map.get(deploymentName)!.push(pod)
      }
    }
    return map
  }, [pods])

  const orphanedPods = useMemo(() => {
    return pods.filter((pod) => !podsByDeployment.has(
      pod.metadata?.ownerReferences?.find((ref) => ref.kind === 'Deployment')?.name ?? ''
    ))
  }, [pods, podsByDeployment])

  const resourceStats = useMemo(() => ({
    totalPods: pods.length,
    totalDeployments: deployments.length,
    orphanedPods: orphanedPods.length,
  }), [pods.length, deployments.length, orphanedPods.length])

  return {
    podsByDeployment,
    orphanedPods,
    resourceStats,
  }
}
