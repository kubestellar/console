/**
 * FlightPlanBlueprintGlow — Glow effect computation for edges and projects
 *
 * Extracted from FlightPlanBlueprint.tsx (#18875)
 */

import { useMemo } from 'react'
import type { LayoutResult } from './BlueprintLayout'

/**
 * Computes which edges should glow based on hover state
 */
export function useGlowEdges(
  hoveredEdge: { from: string; to: string } | null,
  hoveredProjectName: string | null,
  hoveredCluster: string | null,
  layout: LayoutResult | null
) {
  return useMemo(() => {
    const edges = new Set<string>()
    if (hoveredEdge && layout) {
      for (const edge of layout.dependencyEdges) {
        if (edge.from === hoveredEdge.from && edge.to === hoveredEdge.to) {
          const cluster = edge.fromPos?.clusterName ?? ''
          edges.add(`${cluster}:${edge.from}-${edge.to}`)
        }
      }
    }
    if (hoveredProjectName && hoveredCluster && layout) {
      for (const edge of layout.dependencyEdges) {
        const edgeCluster = edge.fromPos?.clusterName ?? ''
        const isConnected = edge.from === hoveredProjectName || edge.to === hoveredProjectName
        if (!isConnected) continue
        // Same-cluster edges: only glow if on the hovered cluster
        // Cross-cluster edges: always glow if the hovered project is an endpoint
        if (!edge.crossCluster && edgeCluster !== hoveredCluster) continue
        edges.add(`${edgeCluster}:${edge.from}-${edge.to}`)
      }
    }
    return edges
  }, [hoveredEdge, hoveredProjectName, hoveredCluster, layout])
}

/**
 * Computes which project nodes should glow based on hover state
 */
export function useGlowProjectKeys(
  hoveredEdge: { from: string; to: string } | null,
  hoveredProjectKey: string | null,
  hoveredProjectName: string | null,
  hoveredCluster: string | null,
  layout: LayoutResult | null
) {
  return useMemo(() => {
    const keys = new Set<string>()
    if (hoveredEdge && layout) {
      for (const key of layout.projectPositions.keys()) {
        const pName = key.split('/')[1]
        if (pName === hoveredEdge.from || pName === hoveredEdge.to) keys.add(key)
      }
    }
    if (hoveredProjectKey && hoveredProjectName && layout) {
      // Always glow the hovered project itself
      keys.add(hoveredProjectKey)
      // Find connected project names — separate same-cluster vs cross-cluster
      const sameClusterConnected = new Set<string>()
      const crossClusterConnected = new Set<string>()
      for (const edge of layout.dependencyEdges) {
        const edgeCluster = edge.fromPos?.clusterName ?? ''
        if (edge.from === hoveredProjectName) {
          if (edge.crossCluster) crossClusterConnected.add(edge.to)
          else if (edgeCluster === hoveredCluster) sameClusterConnected.add(edge.to)
        }
        if (edge.to === hoveredProjectName) {
          if (edge.crossCluster) crossClusterConnected.add(edge.from)
          else if (edgeCluster === hoveredCluster) sameClusterConnected.add(edge.from)
        }
      }
      for (const key of layout.projectPositions.keys()) {
        const [cluster, pName] = key.split('/')
        // Same-cluster connections: glow on same cluster
        if (cluster === hoveredCluster && sameClusterConnected.has(pName)) keys.add(key)
        // Cross-cluster connections: glow on any cluster
        if (crossClusterConnected.has(pName)) keys.add(key)
      }
    }
    return keys
  }, [hoveredEdge, hoveredProjectKey, hoveredProjectName, hoveredCluster, layout])
}
