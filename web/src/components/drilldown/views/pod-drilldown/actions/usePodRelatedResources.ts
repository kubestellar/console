import { useCallback, useState } from 'react'
import type { RelatedResource } from '../types'
import type { PodRelatedResourcesActionProps } from './types'

export function usePodRelatedResources({
  cluster,
  namespace,
  podName,
  agentConnected,
  openTrackedWs,
  parseWsMessage,
}: PodRelatedResourcesActionProps) {
  const [relatedResources, setRelatedResources] = useState<RelatedResource[]>([])
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [configMaps, setConfigMaps] = useState<string[]>([])
  const [secrets, setSecrets] = useState<string[]>([])
  const [pvcs, setPvcs] = useState<string[]>([])
  const [serviceAccount, setServiceAccount] = useState<string | null>(null)

  const fetchRelatedResources = useCallback(async (force = false) => {
    if (!agentConnected || (!force && relatedResources.length > 0)) return
    setRelatedLoading(true)

    try {
      const runKubectl = async (args: string[]): Promise<string> => {
        const ws = await openTrackedWs()
        return new Promise((resolve) => {
          const requestId = `related-${Date.now()}-${Math.random().toString(36).slice(2)}`
          let output = ''

          const timeout = setTimeout(() => {
            ws.close()
            resolve(output || '')
          }, 10000)

          ws.onmessage = (event: MessageEvent) => {
            const msg = parseWsMessage(event, 'related resources')
            if (!msg) {
              clearTimeout(timeout)
              ws.close()
              resolve(output || '')
              return
            }

            if (msg.id === requestId && msg.payload?.output) {
              output = msg.payload.output
              clearTimeout(timeout)
              ws.close()
              resolve(output)
            }
          }
          ws.onerror = () => {
            clearTimeout(timeout)
            ws.close()
            resolve(output || '')
          }

          ws.send(JSON.stringify({
            id: requestId,
            type: 'kubectl',
            payload: { context: cluster, args },
          }))
        })
      }

      const podYaml = await runKubectl(['get', 'pod', podName, '-n', namespace, '-o', 'yaml'])

      const saMatch = podYaml.match(/serviceAccountName:\s*(\S+)/)
      if (saMatch) {
        setServiceAccount(saMatch[1])
      }

      const configMapRefs = new Set<string>()
      const configMapMatches = podYaml.matchAll(/configMapName:\s*(\S+)|name:\s*(\S+)\s*\n\s*configMap:/g)
      for (const match of configMapMatches) {
        const name = match[1] || match[2]
        if (name) configMapRefs.add(name)
      }
      const envFromConfigMaps = podYaml.matchAll(/configMapRef:\s*\n\s*name:\s*(\S+)/g)
      for (const match of envFromConfigMaps) {
        if (match[1]) configMapRefs.add(match[1])
      }
      setConfigMaps(Array.from(configMapRefs))

      const secretRefs = new Set<string>()
      const secretMatches = podYaml.matchAll(/secretName:\s*(\S+)/g)
      for (const match of secretMatches) {
        if (match[1]) secretRefs.add(match[1])
      }
      const envFromSecrets = podYaml.matchAll(/secretRef:\s*\n\s*name:\s*(\S+)/g)
      for (const match of envFromSecrets) {
        if (match[1]) secretRefs.add(match[1])
      }
      setSecrets(Array.from(secretRefs))

      const K8S_NAME_PATTERN = '[a-z0-9][a-z0-9._-]*[a-z0-9]|[a-z0-9]'
      const pvcRefs = new Set<string>()
      const pvcMatches = podYaml.matchAll(new RegExp(`claimName:\\s*"?(${K8S_NAME_PATTERN})"?`, 'g'))
      for (const match of pvcMatches) {
        if (match[1]) pvcRefs.add(match[1])
      }
      setPvcs(Array.from(pvcRefs))

      const chain: RelatedResource[] = []
      const ownerRefMatch = podYaml.match(/ownerReferences:[\s\S]*?kind:\s*(\w+)[\s\S]*?name:\s*([\w-]+)/)
      if (ownerRefMatch) {
        const ownerKind = ownerRefMatch[1]
        const ownerName = ownerRefMatch[2]
        chain.push({ kind: ownerKind, name: ownerName, namespace })

        if (ownerKind === 'ReplicaSet') {
          const rsYaml = await runKubectl(['get', 'replicaset', ownerName, '-n', namespace, '-o', 'yaml'])
          const rsOwnerMatch = rsYaml.match(/ownerReferences:[\s\S]*?kind:\s*(\w+)[\s\S]*?name:\s*([\w-]+)/)
          if (rsOwnerMatch) {
            chain.push({ kind: rsOwnerMatch[1], name: rsOwnerMatch[2], namespace })
          }
        }
      }
      setRelatedResources(chain)
    } catch {
      // Ignore errors
    } finally {
      setRelatedLoading(false)
    }
  }, [agentConnected, relatedResources.length, openTrackedWs, parseWsMessage, cluster, podName, namespace])

  return {
    relatedResources,
    relatedLoading,
    configMaps,
    secrets,
    pvcs,
    serviceAccount,
    fetchRelatedResources,
  }
}
