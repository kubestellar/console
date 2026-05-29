import { useEffect, useRef } from 'react'
import { emitClusterInventory } from '../../lib/analytics'

interface ClusterInventoryItem {
  distribution?: string
  healthy?: boolean
  reachable?: boolean
}

export function useClusterInventoryAnalytics(deduplicatedClusters: readonly ClusterInventoryItem[]) {
  const prevClusterFingerprintRef = useRef<string>('')

  useEffect(() => {
    const total = deduplicatedClusters.length
    if (total === 0) return

    const fingerprint = deduplicatedClusters
      .map(c => `${c.distribution || 'unknown'}:${c.healthy}:${c.reachable}`)
      .sort()
      .join('|')

    if (fingerprint === prevClusterFingerprintRef.current) return
    prevClusterFingerprintRef.current = fingerprint

    let healthy = 0
    let unhealthy = 0
    let unreachable = 0
    const distributions: Record<string, number> = {}

    for (const cluster of deduplicatedClusters) {
      if (cluster.reachable === false) unreachable += 1
      else if (cluster.healthy === false) unhealthy += 1
      else healthy += 1

      const distribution = cluster.distribution || 'unknown'
      distributions[distribution] = (distributions[distribution] || 0) + 1
    }

    emitClusterInventory({
      total,
      healthy,
      unhealthy,
      unreachable,
      distributions,
    })
  }, [deduplicatedClusters])
}
